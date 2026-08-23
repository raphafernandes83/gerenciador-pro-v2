import baseWorker from "./worker.js";
import { allocateRegistrationLot, getLotStatus } from "./lots.js";

const PREVIEW_HOST = "infra-cloudflare-foundation-gerenciador-pro-v2.animaisfofinhos1983.workers.dev";
const TURNSTILE_TEST_PASS_SECRET = "1x0000000000000000000000000000000AA";
const TURNSTILE_TEST_FAIL_SECRET = "2x0000000000000000000000000000000AA";
const TURNSTILE_SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const MAX_REGISTRATION_BYTES = 64 * 1024;
const MAX_MIRROR_AUTH_BYTES = 64 * 1024;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function clean(value, max = 5000) {
  if (value === null || value === undefined) return "";
  return String(value).trim().slice(0, max);
}

async function readRegistrationPayload(request) {
  const type = request.headers.get("content-type") || "";
  if (type.includes("application/json")) return await request.json();
  if (type.includes("application/x-www-form-urlencoded") || type.includes("multipart/form-data")) {
    const form = await request.formData();
    return Object.fromEntries(form.entries());
  }
  return {};
}

async function readRegistrationMarket(request) {
  try {
    const body = await readRegistrationPayload(request);
    return String(body?.pais || "").trim();
  } catch (error) {
    console.error("lot_market_read_failed", error);
  }
  return "";
}

function configuredTurnstileSecret(env) {
  return String(env.TURNSTILE_SECRET_KEY || "").trim();
}

function turnstileSecretFor(request, env) {
  const configured = configuredTurnstileSecret(env);
  if (configured) return configured;

  const host = new URL(request.url).hostname;
  if (host === PREVIEW_HOST) {
    if (request.headers.get("X-GP-Turnstile-Test") === "force-fail") {
      return TURNSTILE_TEST_FAIL_SECRET;
    }
    return TURNSTILE_TEST_PASS_SECRET;
  }
  return "";
}

async function validateTurnstile(request, env) {
  const secret = turnstileSecretFor(request, env);
  if (!secret) return { ok: false, error: "turnstile_not_configured", status: 503 };

  let payload;
  try {
    payload = await readRegistrationPayload(request.clone());
  } catch {
    return { ok: false, error: "turnstile_invalid_request", status: 400 };
  }

  const token = String(payload?.["cf-turnstile-response"] || "").trim();
  if (!token) return { ok: false, error: "turnstile_required", status: 403 };
  if (token.length > 2048) return { ok: false, error: "turnstile_invalid", status: 403 };

  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);

  const ip = request.headers.get("CF-Connecting-IP");
  if (ip) form.append("remoteip", ip);
  form.append("idempotency_key", crypto.randomUUID());

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(TURNSTILE_SITEVERIFY, {
      method: "POST",
      body: form,
      signal: controller.signal
    });

    let result = null;
    try {
      result = await response.json();
    } catch {
      result = null;
    }

    if (response.status >= 500) {
      console.error("turnstile_siteverify_http", response.status);
      return { ok: false, error: "turnstile_unavailable", status: 503 };
    }

    if (!response.ok || result?.success !== true) {
      console.warn("turnstile_rejected", response.status, result?.["error-codes"] || []);
      return { ok: false, error: "turnstile_invalid", status: 403 };
    }

    if (configuredTurnstileSecret(env)) {
      const expectedAction = String(env.TURNSTILE_EXPECTED_ACTION || "lead_register").trim();
      const expectedHostname = new URL(request.url).hostname;
      if (result?.action !== expectedAction || result?.hostname !== expectedHostname) {
        console.warn("turnstile_context_mismatch");
        return { ok: false, error: "turnstile_invalid", status: 403 };
      }
    }

    return { ok: true };
  } catch (error) {
    console.error("turnstile_siteverify_failed", error?.name || error);
    return { ok: false, error: "turnstile_unavailable", status: 503 };
  } finally {
    clearTimeout(timeout);
  }
}

function requestTooLarge(request, maxBytes) {
  const raw = request.headers.get("content-length");
  if (!raw) return false;
  const bytes = Number(raw);
  return Number.isFinite(bytes) && bytes > maxBytes;
}

function registrationRequestTooLarge(request) {
  return requestTooLarge(request, MAX_REGISTRATION_BYTES);
}

function mirrorValue(value, max = 5000) {
  return clean(value, max);
}

function expectedMirrorPayload(lead) {
  let original = {};
  try {
    original = lead.payload_json ? JSON.parse(lead.payload_json) : {};
  } catch {
    original = {};
  }

  return {
    submission_id: mirrorValue(lead.submission_id, 120),
    tipo_interesse: mirrorValue(lead.tipo_interesse, 20),
    nome: mirrorValue(lead.nome, 160),
    whatsapp: mirrorValue(lead.whatsapp, 80),
    email: mirrorValue(lead.email, 320),
    pais: mirrorValue(lead.pais, 120),
    cidade_estado: mirrorValue(original.cidade_estado, 500),
    contato_preferido: mirrorValue(original.contato_preferido, 500),
    experiencia_trading: mirrorValue(original.experiencia_trading, 500),
    principal_objetivo: mirrorValue(original.principal_objetivo, 1000),
    canal_divulgacao: mirrorValue(lead.canal_divulgacao, 180),
    tamanho_publico: mirrorValue(original.tamanho_publico, 500),
    link_canal: mirrorValue(lead.link_canal, 1000),
    experiencia_afiliado: mirrorValue(original.experiencia_afiliado, 1000),
    observacao: mirrorValue(lead.observacao, 5000),
    consentimento: "Sim",
    origem: mirrorValue(lead.origem, 500),
    utm_source: mirrorValue(lead.utm_source, 500),
    utm_medium: mirrorValue(lead.utm_medium, 500),
    utm_campaign: mirrorValue(lead.utm_campaign, 500),
    pagina_url: mirrorValue(lead.pagina_url, 2000),
    enviado_em_local: mirrorValue(lead.enviado_em_local, 100),
    user_agent: mirrorValue(lead.user_agent, 1000)
  };
}

function mirrorPayloadMatches(expected, supplied) {
  const keys = Object.keys(expected);
  return keys.every((key) => mirrorValue(supplied?.[key], key === "observacao" ? 5000 : 5000) === expected[key]);
}

async function authorizeMirrorWrite(request, env) {
  if (requestTooLarge(request, MAX_MIRROR_AUTH_BYTES)) {
    return json({ ok: false, error: "payload_too_large" }, 413);
  }

  if (!(request.headers.get("content-type") || "").includes("application/json")) {
    return json({ ok: false, error: "invalid_request" }, 400);
  }

  let supplied;
  try {
    supplied = await request.json();
  } catch {
    return json({ ok: false, error: "invalid_request" }, 400);
  }

  const submissionId = mirrorValue(supplied?.submission_id, 120);
  if (!submissionId) return json({ ok: false, error: "mirror_unauthorized" }, 403);

  try {
    const lead = await env.DB.prepare(
      `SELECT submission_id,tipo_interesse,nome,whatsapp,email,pais,canal_divulgacao,
              link_canal,observacao,origem,utm_source,utm_medium,utm_campaign,
              pagina_url,user_agent,enviado_em_local,payload_json,sheet_sync_status
       FROM leads WHERE submission_id = ? LIMIT 1`
    ).bind(submissionId).first();

    if (!lead || !["pending", "retry"].includes(String(lead.sheet_sync_status || ""))) {
      return json({ ok: false, error: "mirror_unauthorized" }, 403);
    }

    const expected = expectedMirrorPayload(lead);
    if (!mirrorPayloadMatches(expected, supplied)) {
      console.warn("mirror_payload_mismatch");
      return json({ ok: false, error: "mirror_unauthorized" }, 403);
    }

    return json({ ok: true });
  } catch (error) {
    console.error("mirror_authorization_failed", error?.message || error);
    return json({ ok: false, error: "mirror_authorization_unavailable" }, 503);
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/mirror/authorize" && request.method === "POST") {
      return authorizeMirrorWrite(request, env);
    }

    if (url.pathname === "/api/lots" && request.method === "GET") {
      const market = String(url.searchParams.get("market") || "").trim();
      if (!market) return json({ ok: false, error: "market_required" }, 400);

      try {
        const status = await getLotStatus(env, market);
        return json({ ok: true, ...status });
      } catch (error) {
        console.error("lot_status_failed", error);
        return json({ ok: false, error: "lot_status_unavailable" }, 503);
      }
    }

    if (url.pathname === "/api/register" && request.method === "POST") {
      if (registrationRequestTooLarge(request)) {
        return json({ ok: false, error: "payload_too_large" }, 413);
      }

      const securityRequest = request.clone();
      const marketRequest = request.clone();

      const security = await validateTurnstile(securityRequest, env);
      if (!security.ok) {
        return json({ ok: false, error: security.error }, security.status);
      }

      const response = await baseWorker.fetch(request, env, ctx);
      if (!response.ok) return response;

      let result;
      try {
        result = await response.clone().json();
      } catch {
        return response;
      }

      if (!result?.ok || result?.ignored || result?.duplicate !== false || !result?.submissionId) {
        return response;
      }

      const market = await readRegistrationMarket(marketRequest);
      try {
        const lotResult = await allocateRegistrationLot(env, result.submissionId, market);
        return json({
          ...result,
          lotStatus: lotResult.status,
          lot: lotResult.allocation
        }, response.status);
      } catch (error) {
        console.error("lot_allocation_failed", result.submissionId, error);
        return json({
          ...result,
          lotStatus: "error",
          lot: null
        }, response.status);
      }
    }

    return baseWorker.fetch(request, env, ctx);
  },

  async queue(batch, env, ctx) {
    if (typeof baseWorker.queue === "function") {
      return baseWorker.queue(batch, env, ctx);
    }
  }
};
