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

async function register(request, env) {
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

  const existingSubmission = await env.DB.prepare(
    "SELECT submission_id FROM leads WHERE submission_id = ? LIMIT 1"
  ).bind(submissionId).first();

  if (existingSubmission) {
    return json({ ok: true, duplicate: true, submissionId });
  }

  const duplicate = await findDuplicate(env, interest, whatsappNorm, emailNorm);
  if (duplicate) {
    return json({ ok: true, duplicate: true, submissionId: duplicate.submission_id });
  }

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
    canal_divulgacao: clean(payload.canal_divulgacao, 180) || null,
    link_canal: clean(payload.link_canal, 1000) || null,
    observacao: clean(payload.observacao, 5000) || null,
    origem: clean(payload.origem, 500) || null,
    utm_source: clean(payload.utm_source, 500) || null,
    utm_medium: clean(payload.utm_medium, 500) || null,
    utm_campaign: clean(payload.utm_campaign, 500) || null,
    pagina_url: clean(payload.pagina_url, 2000) || null,
    user_agent: clean(payload.user_agent, 1000) || null,
    enviado_em_local: clean(payload.enviado_em_local, 100) || null,
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
      record.submission_id,
      record.tipo_interesse,
      record.nome,
      record.whatsapp,
      record.whatsapp_norm,
      record.email,
      record.email_norm,
      record.pais,
      record.consentimento,
      record.canal_divulgacao,
      record.link_canal,
      record.observacao,
      record.origem,
      record.utm_source,
      record.utm_medium,
      record.utm_campaign,
      record.pagina_url,
      record.user_agent,
      record.enviado_em_local,
      JSON.stringify(payload)
    ).run();

    if (!result.success) throw new Error("d1_insert_failed");
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
    return json({ ok: row?.ok === 1, database: "reachable" });
  } catch {
    return json({ ok: false, database: "unreachable" }, 503);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health" && request.method === "GET") {
      return health(env);
    }

    if (url.pathname === "/api/register" && request.method === "POST") {
      return register(request, env);
    }

    if (url.pathname.startsWith("/api/")) {
      return json({ ok: false, error: "not_found" }, 404);
    }

    return env.ASSETS.fetch(request);
  }
};
