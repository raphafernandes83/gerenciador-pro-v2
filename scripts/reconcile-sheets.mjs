const required = [
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_ACCOUNT_ID",
  "D1_DATABASE_ID",
  "SHEETS_MIRROR_URL"
];

for (const key of required) {
  if (!process.env[key]) throw new Error(`missing_env:${key}`);
}

const token = process.env.CLOUDFLARE_API_TOKEN;
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const databaseId = process.env.D1_DATABASE_ID;
const sheetsUrl = process.env.SHEETS_MIRROR_URL;
const limit = Math.min(Math.max(Number(process.env.RECONCILE_LIMIT || 50), 1), 100);
const targetSubmissionId = String(process.env.RECONCILE_SUBMISSION_ID || "").trim();
const api = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;

async function query(sql, params = []) {
  const response = await fetch(api, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ sql, params })
  });
  const body = await response.json();
  if (!response.ok || body?.success !== true) {
    throw new Error(`d1_query_failed:${response.status}`);
  }
  return body.result?.[0]?.results || [];
}

async function execute(sql, params = []) {
  const response = await fetch(api, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ sql, params })
  });
  const body = await response.json();
  if (!response.ok || body?.success !== true) {
    throw new Error(`d1_execute_failed:${response.status}`);
  }
  const result = body.result?.[0] || {};
  return Number(result?.meta?.changes ?? result?.changes ?? 0);
}

function safeJson(value) {
  try {
    return value ? JSON.parse(value) : {};
  } catch {
    return {};
  }
}

function buildPayload(row) {
  const original = safeJson(row.payload_json);
  return {
    ...original,
    _mirror_auth_token: String(row.mirror_auth_token || "").trim().slice(0, 128),
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

async function mirror(row) {
  if (!/^[a-f0-9]{64}$/.test(String(row.mirror_auth_token || "").trim())) {
    throw new Error("mirror_auth_token_missing");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(sheetsUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=utf-8",
        accept: "application/json"
      },
      body: JSON.stringify(buildPayload(row)),
      redirect: "follow",
      signal: controller.signal
    });
    const text = await response.text();
    let result = null;
    try { result = JSON.parse(text); } catch {}
    if (!response.ok || result?.ok !== true) {
      throw new Error(String(result?.error || `sheet_http_${response.status}`).slice(0, 300));
    }
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

async function currentStatus(submissionId) {
  const rows = await query(
    "SELECT sheet_sync_status FROM leads WHERE submission_id=? LIMIT 1",
    [submissionId]
  );
  return rows[0]?.sheet_sync_status || null;
}

let selectionSql = `SELECT submission_id,tipo_interesse,nome,whatsapp,email,pais,canal_divulgacao,link_canal,
                            observacao,origem,utm_source,utm_medium,utm_campaign,pagina_url,user_agent,
                            enviado_em_local,payload_json,sheet_sync_attempts,mirror_auth_token
                     FROM leads
                     WHERE sheet_sync_status IN ('retry','pending')`;
const selectionParams = [];

if (targetSubmissionId) {
  selectionSql += " AND submission_id=?";
  selectionParams.push(targetSubmissionId);
}
selectionSql += " ORDER BY created_at ASC LIMIT ?";
selectionParams.push(targetSubmissionId ? 1 : limit);

const rows = await query(selectionSql, selectionParams);

let synced = 0;
let failed = 0;
let raceResolved = 0;

for (const row of rows) {
  try {
    const result = await mirror(row);
    const changed = await execute(
      `UPDATE leads
       SET sheet_sync_status='synced',
           sheet_sync_attempts=sheet_sync_attempts+1,
           sheet_synced_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),
           updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE submission_id=?
         AND COALESCE(sheet_sync_status,'pending') <> 'synced'`,
      [row.submission_id]
    );
    await query(
      "INSERT INTO system_events (event_type,submission_id,details_json) VALUES (?,?,?) RETURNING id",
      [changed > 0 ? "sheet_reconciled" : "sheet_reconcile_already_synced", row.submission_id, JSON.stringify({ duplicate: Boolean(result?.duplicate) })]
    );
    if (changed > 0) synced += 1;
    else raceResolved += 1;
  } catch (error) {
    const status = await currentStatus(row.submission_id).catch(() => null);
    if (status === "synced") {
      await query(
        "INSERT INTO system_events (event_type,submission_id,details_json) VALUES ('sheet_reconcile_race_resolved',?,?) RETURNING id",
        [row.submission_id, JSON.stringify({ error: String(error?.message || error).slice(0, 300) })]
      );
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
      [row.submission_id]
    );

    if (changed === 0) {
      raceResolved += 1;
      continue;
    }

    await query(
      "INSERT INTO system_events (event_type,submission_id,details_json) VALUES ('sheet_reconcile_failed',?,?) RETURNING id",
      [row.submission_id, JSON.stringify({ error: String(error?.message || error).slice(0, 300) })]
    );
    failed += 1;
  }
}

console.log(JSON.stringify({ checked: rows.length, synced, failed, raceResolved, targeted: Boolean(targetSubmissionId) }));
if (failed > 0 && process.env.FAIL_ON_RECONCILE_ERROR === "1") process.exit(1);
