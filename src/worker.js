const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function clean(value, max = 5000) {
  if (value === null || value === undefined) return "";
  return String(value).trim().slice(0, max);
}

function normalizePhone(value) {
  return clean(value, 80).replace(/\D/g, "");
}

function normalizeEmail(value) {
  const email = clean(value, 320).toLowerCase();
  return email || null;
}

function truthyConsent(value) {
  if (value === true || value === 1) return true;
  return ["1", "true", "on", "sim", "yes"].includes(String(value || "").trim().toLowerCase());
}

function validEmail(value) {
  return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function errorReason(error, fallback = "unknown_error") {
  if (error?.name === "AbortError") return "sheet_timeout";
  return clean(error?.message || error, 500) || fallback;
}

async function readPayload(request) {
  const type = request.headers.get("content-type") || "";
  if (type.includes("application/json")) return await request.json();
  if (type.includes("application/x-www-form-urlencoded") || type.includes("multipart/form-data")) {
    const form = await request.formData();
    return Object.fromEntries(form.entries());
  }
  throw new Error("unsupported_content_type");
}

async function findDuplicate(env, interest, phone, email) {
  const clauses = ["whatsapp_norm = ?"];
  const args = [phone];
  if (email) {
    clauses.push("email_norm = ?");
    args.push(email);
  }

  return await env.DB.prepare(
    `SELECT submission_id FROM leads
     WHERE tipo_interesse = ? AND (${clauses.join(" OR ")})
     ORDER BY id ASC LIMIT 1`
  ).bind(interest, ...args).first();
}

function buildSheetPayload(record, payload) {
  return {
    submission_id: record.submission_id,
    tipo_interesse: record.tipo_interesse,
    nome: record.nome,
    whatsapp: record.whatsapp,
    email: record.email || "",
    pais: record.pais,
    cidade_estado: clean(payload.cidade_estado, 500),
    contato_preferido: clean(payload.contato_preferido, 500),
    experiencia_trading: clean(payload.experiencia_trading, 500),
    principal_objetivo: clean(payload.principal_objetivo, 1000),
    canal_divulgacao: record.canal_divulgacao || "",
    tamanho_publico: clean(payload.tamanho_publico, 500),
    link_canal: record.link_canal || "",
    experiencia_afiliado: clean(payload.experiencia_afiliado, 1000),
    observacao: record.observacao || "",
    consentimento: "Sim",
    origem: record.origem || "",
    utm_source: record.utm_source || "",
    utm_medium: record.utm_medium || "",
    utm_campaign: record.utm_campaign || "",
    pagina_url: record.pagina_url || "",
    enviado_em_local: record.enviado_em_local || "",
    user_agent: record.user_agent || ""
  };
}

async function recordSystemEvent(env, eventType, submissionId, details = {}) {
  try {
    await env.DB.prepare(
      "INSERT INTO system_events (event_type, submission_id, details_json) VALUES (?, ?, ?)"
    ).bind(eventType, submissionId || null, JSON.stringify(details)).run();
  } catch (error) {
    console.error("system_event_failed", eventType, error);
  }
}

async function markSheetSynced(env, submissionId, details = {}) {
  await env.DB.prepare(
    `UPDATE leads
     SET sheet_sync_status = 'synced',
         sheet_sync_attempts = sheet_sync_attempts + 1,
         sheet_synced_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     WHERE submission_id = ?`
  ).bind(submissionId).run();

  await recordSystemEvent(env, "sheet_sync_succeeded", submissionId, details);
}

async function markSheetRetry(env, submissionId, reason, details = {}) {
  try {
    await env.DB.prepare(
      `UPDATE leads
       SET sheet_sync_status = 'retry',
           sheet_sync_attempts = sheet_sync_attempts + 1,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE submission_id = ?`
    ).bind(submissionId).run();
  } finally {
    await recordSystemEvent(env, "sheet_sync_retry", submissionId, {
      reason,
      ...details
    });
  }
}

async function enqueueSheetRetry(env, submissionId, reason) {
  if (!env.SHEET_RETRY_QUEUE || typeof env.SHEET_RETRY_QUEUE.send !== "function") {
    await recordSystemEvent(env, "sheet_queue_unavailable", submissionId, { reason });
    return false;
  }

  try {
    await env.SHEET_RETRY_QUEUE.send({
      type: "sheet_mirror_retry",
      submissionId,
      reason: clean(reason, 500) || "unknown",
      queuedAt: new Date().toISOString()
    }, { delaySeconds: 60 });

    await recordSystemEvent(env, "sheet_retry_queued", submissionId, { reason });
    return true;
  } catch (error) {
    const queueError = errorReason(error, "queue_send_failed");
    console.error("sheet_queue_failed", submissionId, queueError);
    await recordSystemEvent(env, "sheet_queue_failed", submissionId, {
      reason,
      queueError
    });
    return false;
  }
}

async function scheduleSheetRetry(env, submissionId, reason) {
  try {
    await markSheetRetry(env, submissionId, reason);
  } catch (error) {
    console.error("sheet_retry_status_failed", submissionId, error);
  }
  await enqueueSheetRetry(env, submissionId, reason);
}

async function postLeadToSheet(env, record, payload) {
  const endpoint = clean(env.SHEETS_MIRROR_URL, 2000);
  if (!endpoint) throw new Error("mirror_not_configured");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=utf-8",
        "accept": "application/json"
      },
      body: JSON.stringify(buildSheetPayload(record, payload)),
      redirect: "follow",
      signal: controller.signal
    });

    const raw = await response.text();
    let result;
    try {
      result = JSON.parse(raw);
    } catch {
      throw new Error(`invalid_sheet_response:${response.status}`);
    }

    if (!response.ok || result?.ok !== true) {
      throw new Error(clean(result?.error || `sheet_http_${response.status}`, 500));
    }

    return result;
  } finally {
    clearTimeout(timeout);
  }
}

async function syncLeadToSheet(env, record, payload) {
  try {
    const result = await postLeadToSheet(env, record, payload);
    await markSheetSynced(env, record.submission_id, {
      source: "initial",
      duplicate: Boolean(result.duplicate),
      sheetName: clean(result.sheetName, 200) || null
    });
  } catch (error) {
    const reason = errorReason(error, "sheet_unknown_error");
    console.error("sheet_sync_failed", record.submission_id, reason);
    await scheduleSheetRetry(env, record.submission_id, reason);
  }
}

async function loadLeadForRetry(env, submissionId) {
  return await env.DB.prepare(
    `SELECT submission_id, tipo_interesse, nome, whatsapp, email, pais,
            canal_divulgacao, link_canal, observacao, origem,
            utm_source, utm_medium, utm_campaign, pagina_url, user_agent,
            enviado_em_local, payload_json, sheet_sync_status
     FROM leads WHERE submission_id = ? LIMIT 1`
  ).bind(submissionId).first();
}

async function processRetryMessage(message, env) {
  const body = message?.body || {};
  const submissionId = clean(body.submissionId, 120);

  if (body.type !== "sheet_mirror_retry" || !submissionId) {
    await recordSystemEvent(env, "sheet_retry_invalid_message", null, {
      attempts: Number(message?.attempts || 0)
    });
    message.ack();
    return;
  }

  const lead = await loadLeadForRetry(env, submissionId);
  if (!lead) {
    await recordSystemEvent(env, "sheet_retry_missing_lead", submissionId, {
      attempts: Number(message?.attempts || 0)
    });
    message.ack();
    return;
  }

  if (lead.sheet_sync_status === "synced") {
    await recordSystemEvent(env, "sheet_retry_already_synced", submissionId, {
      attempts: Number(message?.attempts || 0)
    });
    message.ack();
    return;
  }

  let originalPayload = {};
  try {
    originalPayload = lead.payload_json ? JSON.parse(lead.payload_json) : {};
  } catch {
    originalPayload = {};
  }

  try {
    const result = await postLeadToSheet(env, lead, originalPayload);
    await markSheetSynced(env, submissionId, {
      source: "queue",
      queueAttempts: Number(message?.attempts || 0),
      duplicate: Boolean(result.duplicate),
      sheetName: clean(result.sheetName, 200) || null
    });
    await recordSystemEvent(env, "sheet_retry_consumer_succeeded", submissionId, {
      attempts: Number(message?.attempts || 0)
    });
    message.ack();
  } catch (error) {
    const reason = errorReason(error, "sheet_retry_consumer_failed");
    try {
      await markSheetRetry(env, submissionId, reason, {
        source: "queue",
        queueAttempts: Number(message?.attempts || 0)
      });
    } catch (statusError) {
      console.error("sheet_consumer_status_failed", submissionId, statusError);
    }

    await recordSystemEvent(env, "sheet_retry_consumer_failed", submissionId, {
      reason,
      attempts: Number(message?.attempts || 0)
    });

    const attempts = Math.max(1, Number(message?.attempts || 1));
    const delaySeconds = Math.min(900, 60 * (2 ** Math.min(attempts - 1, 4)));
    message.retry({ delaySeconds });
  }
}

async function register(request, env, ctx) {
  let payload;
  try {
    payload = await readPayload(request);
  } catch {
    return json({ ok: false, error: "invalid_request" }, 400);
  }

  if (clean(payload.website, 200)) {
    return json({ ok: true, ignored: true });
  }

  const submissionId = clean(payload.submission_id || payload.submissionId || crypto.randomUUID(), 120);
  const interest = clean(payload.tipo_interesse, 20).toLowerCase();
  const nome = clean(payload.nome, 160);
  const whatsapp = clean(payload.whatsapp, 80);
  const whatsappNorm = normalizePhone(whatsapp);
  const email = clean(payload.email, 320);
  const emailNorm = normalizeEmail(email);
  const pais = clean(payload.pais, 120);
  const consent = truthyConsent(payload.consentimento);
  const canalDivulgacao = clean(payload.canal_divulgacao, 180);

  if (!submissionId || !["comprar", "revender"].includes(interest)) {
    return json({ ok: false, error: "invalid_interest" }, 422);
  }
  if (nome.length < 3) return json({ ok: false, error: "invalid_name" }, 422);
  if (whatsappNorm.length < 6 || whatsappNorm.length > 20) {
    return json({ ok: false, error: "invalid_whatsapp" }, 422);
  }
  if (!validEmail(emailNorm)) return json({ ok: false, error: "invalid_email" }, 422);
  if (!pais) return json({ ok: false, error: "invalid_country" }, 422);
  if (!consent) return json({ ok: false, error: "consent_required" }, 422);
  if (interest === "revender" && !canalDivulgacao) {
    return json({ ok: false, error: "channel_required" }, 422);
  }

  const existingSubmission = await env.DB.prepare(
    "SELECT submission_id FROM leads WHERE submission_id = ? LIMIT 1"
  ).bind(submissionId).first();
  if (existingSubmission) return json({ ok: true, duplicate: true, submissionId });

  const duplicate = await findDuplicate(env, interest, whatsappNorm, emailNorm);
  if (duplicate) return json({ ok: true, duplicate: true, submissionId: duplicate.submission_id });

  const record = {
    submission_id: submissionId,
    tipo_interesse: interest,
    nome,
    whatsapp,
    whatsapp_norm: whatsappNorm,
    email: email || null,
    email_norm: emailNorm,
    pais,
    consentimento: 1,
    canal_divulgacao: canalDivulgacao || null,
    link_canal: clean(payload.link_canal, 1000) || null,
    observacao: clean(payload.observacao, 5000) || null,
    origem: clean(payload.origem, 500) || null,
    utm_source: clean(payload.utm_source, 500) || null,
    utm_medium: clean(payload.utm_medium, 500) || null,
    utm_campaign: clean(payload.utm_campaign, 500) || null,
    pagina_url: clean(payload.pagina_url, 2000) || null,
    user_agent: clean(payload.user_agent, 1000) || null,
    enviado_em_local: clean(payload.enviado_em_local, 100) || null
  };

  try {
    const result = await env.DB.prepare(
      `INSERT INTO leads (
        submission_id, tipo_interesse, nome, whatsapp, whatsapp_norm,
        email, email_norm, pais, consentimento, canal_divulgacao, link_canal,
        observacao, origem, utm_source, utm_medium, utm_campaign,
        pagina_url, user_agent, enviado_em_local, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      record.submission_id, record.tipo_interesse, record.nome, record.whatsapp,
      record.whatsapp_norm, record.email, record.email_norm, record.pais,
      record.consentimento, record.canal_divulgacao, record.link_canal,
      record.observacao, record.origem, record.utm_source, record.utm_medium,
      record.utm_campaign, record.pagina_url, record.user_agent,
      record.enviado_em_local, JSON.stringify(payload)
    ).run();

    if (!result.success) throw new Error("d1_insert_failed");

    const mirrorPromise = syncLeadToSheet(env, record, payload);
    if (ctx?.waitUntil) ctx.waitUntil(mirrorPromise);
    else mirrorPromise.catch((error) => console.error("sheet_sync_unhandled", error));

    return json({ ok: true, duplicate: false, submissionId });
  } catch (error) {
    const duplicateAfterRace = await findDuplicate(env, interest, whatsappNorm, emailNorm);
    if (duplicateAfterRace) {
      return json({ ok: true, duplicate: true, submissionId: duplicateAfterRace.submission_id });
    }
    console.error("registration_failed", error);
    return json({ ok: false, error: "storage_unavailable" }, 503);
  }
}

async function health(env) {
  try {
    const row = await env.DB.prepare("SELECT 1 AS ok").first();
    return json({
      ok: row?.ok === 1,
      database: "reachable",
      sheetMirrorConfigured: Boolean(clean(env.SHEETS_MIRROR_URL, 2000)),
      retryQueueConfigured: Boolean(env.SHEET_RETRY_QUEUE)
    });
  } catch {
    return json({ ok: false, database: "unreachable" }, 503);
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health" && request.method === "GET") return health(env);
    if (url.pathname === "/api/register" && request.method === "POST") return register(request, env, ctx);
    if (url.pathname.startsWith("/api/")) return json({ ok: false, error: "not_found" }, 404);
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return json({ ok: false, error: "not_found" }, 404);
  },

  async queue(batch, env) {
    for (const message of batch.messages) {
      try {
        await processRetryMessage(message, env);
      } catch (error) {
        console.error("queue_message_unhandled", error);
        message.retry({ delaySeconds: 60 });
      }
    }
  }
};
