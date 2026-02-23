import crypto from "crypto";
import { getBalance, addBalance } from "./store.js";

const COEF_WIN = 1.95;

function coinFlip() {
  return Math.random() < 0.5 ? "орел" : "решка";
}
function normalizeSide(s) {
  s = (s || "").toLowerCase();
  if (["орел", "орёл"].includes(s)) return "орел";
  if (["решка"].includes(s)) return "решка";
  return null;
}

// Проверка initData (Telegram Mini Apps auth)
function verifyInitData(initData, botToken) {
  // initData: "query_id=...&user=...&auth_date=...&hash=..."
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return { ok: false, reason: "No hash" };
  params.delete("hash");

  // data_check_string — строки key=value отсортированные по key
  const pairs = [];
  for (const [k, v] of params.entries()) pairs.push([k, v]);
  pairs.sort((a, b) => a[0].localeCompare(b[0]));
  const dataCheckString = pairs.map(([k, v]) => `${k}=${v}`).join("\n");

  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();

  const computedHash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  if (computedHash !== hash) return { ok: false, reason: "Bad hash" };

  const userRaw = params.get("user");
  const user = userRaw ? JSON.parse(userRaw) : null;

  return { ok: true, user };
}

export default async (req) => {
  const botToken = process.env.BOT_TOKEN;

  if (req.method !== "POST") {
    return new Response("Only POST", { status: 405 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.initData || !body?.action) {
    return new Response(JSON.stringify({ ok: false, error: "Bad request" }), {
      status: 400,
      headers: { "content-type": "application/json" }
    });
  }

  const auth = verifyInitData(body.initData, botToken);
  if (!auth.ok || !auth.user?.id) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" }
    });
  }

  const userId = auth.user.id;

  if (body.action === "balance") {
    const bal = await getBalance(userId);
    return new Response(JSON.stringify({ ok: true, balance: bal }), {
      headers: { "content-type": "application/json" }
    });
  }

  if (body.action === "bet") {
    const amount = Number(body.amount);
    const side = normalizeSide(body.side);
    if (!Number.isFinite(amount) || amount <= 0 || !side) {
      return new Response(JSON.stringify({ ok: false, error: "Bad bet params" }), {
        status: 400,
        headers: { "content-type": "application/json" }
      });
    }

    const bal = await getBalance(userId);
    if (amount > bal) {
      return new Response(JSON.stringify({ ok: false, error: "Not enough balance", balance: bal }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }

    // списали
    await addBalance(userId, -amount);

    const result = coinFlip();
    const win = result === side;
    let payout = 0;

    if (win) {
      payout = Math.floor(amount * COEF_WIN);
      await addBalance(userId, payout);
    }

    const newBal = await getBalance(userId);

    return new Response(
      JSON.stringify({
        ok: true,
        win,
        chosen: side,
        result,
        amount,
        payout,
        coef: COEF_WIN,
        balance: newBal
      }),
      { headers: { "content-type": "application/json" } }
    );
  }

  return new Response(JSON.stringify({ ok: false, error: "Unknown action" }), {
    status: 400,
    headers: { "content-type": "application/json" }
  });
};

export const config = { path: "/.netlify/functions/api" };