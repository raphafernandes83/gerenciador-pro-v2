const required = [
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_ACCOUNT_ID",
  "D1_DATABASE_ID",
  "RETRY_QUEUE_ID",
  "SHEETS_MIRROR_URL"
];

for (const key of required) {
  if (!process.env[key]) throw new Error(`missing_env:${key}`);
}

const token = process.env.CLOUDFLARE_API_TOKEN;
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const databaseId = process.env.D1_DATABASE_ID;
const queueId = process.env.RETRY_QUEUE_ID;
const sheetsUrl = process.env.SHEETS_MIRROR_URL;
const batchSize = Math.min(Math.max(Number(process.env.QUEUE_PULL_BATCH_SIZE || 50), 1), 100);
const visibilityTimeoutMs = Math.min(Math.max(Number(process.env.QUEUE_VISIBILITY_TIMEOUT_MS || 120000), 10000), 600000);

const cfBase = `https://api.cloudflare.com/client/v4/accounts/${accountId}`;
const d1Api = `${cfBase}/d1/database/${databaseId}/query`;
const queueApi = `${cfBase}/queues/${queueId}/messages`;

async function cloudflare(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(options.headers || {})
    }
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.success !== true) {
    throw new Error(`cloudflare_api_failed:${response.status}`);
  }
  return body;
}

async function query(sql, params = []) {
  const body = await cloudflare(d1Api, {
    method: "POST",
    body: JSON.stringify({ sql, params })
  });
  return body.result?.[0]?.results || [];
}

async function execute(sql, params = []) {
  const body = await cloudflare(d1Api, {
    method: "POST",
    body: JSON.stringify({ sql, params })
  });
  const result = body.result?.[0] || {};
  return Number(result?.meta?.changes ?? result?.changes ?? 0);
}

function clean(value, max = 5000) {
  if (value === null || value === undefined) return "";
  return String(value).trim().slice(0, max);
}

function parseMessageBody(value) {
  if (value && typeof value === "object") return value;
  if (typeof value !== "string") return {};
  try { return JSON.parse(value); } catch { return {}; }
}

function safeJson(value) {
  try { return value ? JSON.parse(value) : {}; } catch { return {}; }
}

function buildSheetPayload(row) {
  const original = safeJson(row.payload_json);
  return {
    ...original,
    submission_id: row.submission_id,
    tipo_interesse: row.tipo_interesse,
    nome: row.nome,
    whatsapp: row.whatsapp,
    email: row.email || "",
    pais: row.pais,
    canal_divulgacao: row.canal_divulgacao || original.canal_divulgacao || "",
    link_canal: row.link_canal || original.link_canal || "",
    observacao: row.observacao || original.observacao || "",
    consentimento: "Sim",
    origem: row.origem || original.origem || "",
    utm_source: row.utm_source || original.utm_source || "",
    utm_medium: row.utm_medium || original.utm_medium || "",
    utm_campaign: row.utm_campaign || original.utm_campaign || "",
    pagina_url: row.pagina_url || original.pagina_url || "",
    enviado_em_local: row.enviado_em_local || original.enviado_em_local || "",
    user_agent: row.user_agent || original.user_agent || ""
  };
}

async function recordEvent(type, submissionId, details = {}) {
  await query(
    "INSERT INTO system_events (event_type,submission_id,details_json) VALUES (?,?,?) RETURNING id",
    [type, submissionId || null, JSON.stringify(details)]
  );
}

async function loadLead(submissionId) {
  const rows = await query(
    `SELECT submission_id,tipo_interesse,nome,whatsapp,email,pais,canal_divulgacao,link_canal,
            observacao,origem,utm_source,utm_medium,utm_campaign,pagina_url,user_agent,
            enviado_em_local,payload_json,sheet_sync_status,sheet_sync_attempts
     FROM leads WHERE submission_id=? LIMIT 1`,
    [submissionId]
  );
  return rows[0] || null;
}

async function mirror(row) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(sheetsUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=utf-8",
        accept: "application/json"
      },
      body: JSON.stringify(buildSheetPayload(row)),
      redirect: "follow",
      signal: controller.signal
    });
    const text = await response.text();
    let result = null;
    try { result = JSON.parse(text); } catch {}
    if (!response.ok || result?.ok !== true) {
      throw new Error(clean(result?.error || `sheet_http_${response.status}`, 300));
    }
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

const pulled = await cloudflare(`${queueApi}/pull`, {
  method: "POST",
  body: JSON.stringify({
    visibility_timeout_ms: visibilityTimeoutMs,
    batch_size: batchSize
  })
});

const messages = pulled.result?.messages || [];
const acks = [];
const retries = [];
let synced = 0;
let ignored = 0;
let retryCount = 0;
let raceResolved = 0;

for (const message of messages) {
  const leaseId = clean(message.lease_id, 4096);
  if (!leaseId) continue;

  const body = parseMessageBody(message.body);
  const submissionId = clean(body.submissionId, 120);

  try {
    if (body.type !== "sheet_mirror_retry" || !submissionId) {
      await recordEvent("sheet_pull_invalid_message", null, { attempts: Number(message.attempts || 0) });
      acks.push({ lease_id: leaseId });
      ignored += 1;
      continue;
    }

    const lead = await loadLead(submissionId);
    if (!lead) {
      await recordEvent("sheet_pull_missing_lead", submissionId, { attempts: Number(message.attempts || 0) });
      acks.push({ lease_id: leaseId });
      ignored += 1;
      continue;
    }

    if (lead.sheet_sync_status === "synced") {
      await recordEvent("sheet_pull_already_synced", submissionId, { attempts: Number(message.attempts || 0) });
      acks.push({ lease_id: leaseId });
      ignored += 1;
      continue;
    }

    const result = await mirror(lead);
    const changed = await execute(
      `UPDATE leads
       SET sheet_sync_status='synced',
           sheet_sync_attempts=sheet_sync_attempts+1,
           sheet_synced_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),
           updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE submission_id=?
         AND COALESCE(sheet_sync_status,'pending') <> 'synced'`,
      [submissionId]
    );

    if (changed > 0) {
      await recordEvent("sheet_pull_synced", submissionId, {
        attempts: Number(message.attempts || 0),
        duplicate: Boolean(result?.duplicate)
      });
      synced += 1;
    } else {
      await recordEvent("sheet_pull_race_resolved_synced", submissionId, {
        attempts: Number(message.attempts || 0)
      });
      raceResolved += 1;
    }

    acks.push({ lease_id: leaseId });
  } catch (error) {
    const reason = clean(error?.message || error, 300) || "sheet_pull_failed";

    if (submissionId) {
      try {
        const fresh = await loadLead(submissionId);
        if (!fresh || fresh.sheet_sync_status === "synced") {
          await recordEvent("sheet_pull_race_resolved_synced", submissionId, {
            attempts: Number(message.attempts || 0),
            reason
          });
          acks.push({ lease_id: leaseId });
          raceResolved += 1;
          continue;
        }

        const changed = await execute(
          `UPDATE leads
           SET sheet_sync_status='retry',
               sheet_sync_attempts=sheet_sync_attempts+1,
               updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
           WHERE submission_id=?
             AND COALESCE(sheet_sync_status,'pending') <> 'synced'`,
          [submissionId]
        );

        if (changed === 0) {
          await recordEvent("sheet_pull_race_resolved_synced", submissionId, {
            attempts: Number(message.attempts || 0),
            reason
          });
          acks.push({ lease_id: leaseId });
          raceResolved += 1;
          continue;
        }

        await recordEvent("sheet_pull_retry", submissionId, {
          attempts: Number(message.attempts || 0),
          reason
        });
      } catch (statusError) {
        console.error("status_update_failed", submissionId, statusError?.message || statusError);
      }
    }

    const attempts = Math.max(1, Number(message.attempts || 1));
    const delaySeconds = Math.min(900, 60 * (2 ** Math.min(attempts - 1, 4)));
    retries.push({ lease_id: leaseId, delay_seconds: delaySeconds });
    retryCount += 1;
  }
}

if (acks.length || retries.length) {
  await cloudflare(`${queueApi}/ack`, {
    method: "POST",
    body: JSON.stringify({ acks, retries })
  });
}

console.log(JSON.stringify({
  pulled: messages.length,
  synced,
  ignored,
  retried: retryCount,
  raceResolved,
  backlog: Number(pulled.result?.message_backlog_count || 0)
}));
