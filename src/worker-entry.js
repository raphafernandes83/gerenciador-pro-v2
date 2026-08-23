import baseWorker from "./worker.js";
import { allocateRegistrationLot, getLotStatus } from "./lots.js";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

async function readRegistrationMarket(request) {
  try {
    const type = request.headers.get("content-type") || "";
    if (type.includes("application/json")) {
      const body = await request.json();
      return String(body?.pais || "").trim();
    }
    if (type.includes("application/x-www-form-urlencoded") || type.includes("multipart/form-data")) {
      const form = await request.formData();
      return String(form.get("pais") || "").trim();
    }
  } catch (error) {
    console.error("lot_market_read_failed", error);
  }
  return "";
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
      const marketRequest = request.clone();
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
