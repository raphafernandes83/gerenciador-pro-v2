function cleanMarket(value) {
  return String(value || "").trim().slice(0, 120);
}

function normalizeLotRow(row) {
  if (!row) return null;
  return {
    lotId: Number(row.lot_id ?? row.id),
    market: String(row.market_key || ""),
    lotNumber: Number(row.lot_number),
    label: String(row.label || ""),
    capacity: Number(row.capacity),
    claimed: Number(row.claimed_count),
    remaining: Math.max(0, Number(row.capacity) - Number(row.claimed_count)),
    priceMinor: row.price_minor === null || row.price_minor === undefined
      ? null
      : Number(row.price_minor),
    currency: String(row.currency_code || ""),
    state: String(row.state || "")
  };
}

async function readAllocation(env, submissionId) {
  const row = await env.DB.prepare(
    `SELECT
       a.lot_id,
       a.price_minor_snapshot AS price_minor,
       a.currency_code_snapshot AS currency_code,
       l.market_key,
       l.lot_number,
       l.label,
       l.capacity,
       l.claimed_count,
       l.state
     FROM lead_lot_allocations a
     JOIN registration_lots l ON l.id = a.lot_id
     WHERE a.submission_id = ?
     LIMIT 1`
  ).bind(submissionId).first();

  return normalizeLotRow(row);
}

export async function allocateRegistrationLot(env, submissionId, marketValue) {
  const market = cleanMarket(marketValue);
  if (!market) return { status: "not_configured", allocation: null };

  const existing = await readAllocation(env, submissionId);
  if (existing) return { status: "allocated", allocation: existing };

  try {
    await env.DB.prepare(
      `INSERT INTO lead_lot_allocations
         (submission_id, lot_id, price_minor_snapshot, currency_code_snapshot)
       SELECT ?, id, price_minor, currency_code
       FROM registration_lots
       WHERE state = 'open'
         AND claimed_count < capacity
         AND (market_key = ? COLLATE NOCASE OR market_key = 'GLOBAL' COLLATE NOCASE)
       ORDER BY
         CASE WHEN market_key = ? COLLATE NOCASE THEN 0 ELSE 1 END,
         display_order ASC,
         lot_number ASC
       LIMIT 1
       ON CONFLICT(submission_id) DO NOTHING`
    ).bind(submissionId, market, market).run();
  } catch (error) {
    if (!String(error?.message || error).includes("lot_not_available")) throw error;
  }

  const allocation = await readAllocation(env, submissionId);
  if (allocation) return { status: "allocated", allocation };

  const configured = await env.DB.prepare(
    `SELECT COUNT(*) AS total
     FROM registration_lots
     WHERE market_key = ? COLLATE NOCASE OR market_key = 'GLOBAL' COLLATE NOCASE`
  ).bind(market).first();

  return {
    status: Number(configured?.total || 0) > 0 ? "unavailable" : "not_configured",
    allocation: null
  };
}

export async function getLotStatus(env, marketValue) {
  const market = cleanMarket(marketValue);
  if (!market) {
    return { configured: false, market: "", closedCount: 0, current: null, next: null, lots: [] };
  }

  const result = await env.DB.prepare(
    `SELECT id, market_key, lot_number, label, capacity, claimed_count,
            price_minor, currency_code, state, display_order
     FROM registration_lots
     WHERE market_key = ? COLLATE NOCASE OR market_key = 'GLOBAL' COLLATE NOCASE
     ORDER BY
       CASE WHEN market_key = ? COLLATE NOCASE THEN 0 ELSE 1 END,
       display_order ASC,
       lot_number ASC`
  ).bind(market, market).all();

  const lots = (result.results || []).map(normalizeLotRow);
  const current = lots.find((lot) => lot.state === "open" && lot.remaining > 0) || null;
  const next = lots.find((lot) => lot.state === "planned") || null;

  return {
    configured: lots.length > 0,
    market,
    closedCount: lots.filter((lot) => lot.state === "closed").length,
    current,
    next,
    lots
  };
}
