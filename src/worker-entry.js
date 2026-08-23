import baseWorker from "./worker.js";
import { allocateRegistrationLot, getLotStatus } from "./lots.js";

const PREVIEW_HOST = "infra-cloudflare-foundation-gerenciador-pro-v2.animaisfofinhos1983.workers.dev";
const TURNSTILE_TEST_SECRET = "1x0000000000000000000000000000000AA";
const TURNSTILE_SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
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

function turnstileSecretFor(request, env) {
  const configured = String(env.TURNSTILE_SECRET_KEY || "").trim();
  if (configured) return configured;

  const host = new URL(request.url).hostname;
  if (host === PREVIEW_HOST) return TURNSTILE_TEST_SECRET;
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

    const expectedAction = String(env.TURNSTILE_EXPECTED_ACTION || "").trim();
    if (expectedAction && result?.action !== expectedAction) {
      return { ok: false, error: "turnstile_invalid", status: 403 };
    }

    return { ok: true };
  } catch (error) {
    console.error("turnstile_siteverify_failed", error?.name || error);
    return { ok: false, error: "turnstile_unavailable", status: 503 };
  } finally {
    clearTimeout(timeout);
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

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
