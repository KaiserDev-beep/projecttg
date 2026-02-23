import crypto from "crypto";
import { getBalance, addBalance, feedPush, feedGet, getKey, setKey } from "./store.js";

const COEF_WIN = 1.95;

const NPCS = [
  { id: "npc_1", name: "BotAlpha" },
  { id: "npc_2", name: "BotBeta" },
  { id: "npc_3", name: "CoinGhost" }
];

// как часто можно "дорисовывать" NPC активность
const NPC_COOLDOWN_MS = 6000;
// сколько NPC ставок максимум за 1 запрос
const NPC_MAX_PER_TICK = 2;

function coinFlip() {
  return Math.random() < 0.5 ? "орел" : "решка";
}

function normalizeSide(s) {
  s = (s || "").toLowerCase();
  if (["орел", "орёл"].includes(s)) return "орел";
  if (["решка"].includes(s)) return "решка";
  return null;
}

// Telegram Mini Apps auth
function verifyInitData(initData, botToken) {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return { ok: false };
  params.delete("hash");

  const pairs = [];
  for (const [k, v] of params.entries()) pairs.push([k, v]);
  pairs.sort((a, b) => a[0].localeCompare(b[0]));
  const dataCheckString = pairs.map(([k, v]) => `${k}=${v}`).join("\n");

  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const computedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  if (computedHash !== hash) return { ok: false };

  const userRaw = params.get("user");
  const user = userRaw ? JSON.parse(userRaw) : null;
  return { ok: true, user };
}

function now() {
  return Date.now();
}

function randomNpcBet() {
  const npc = NPCS[Math.floor(Math.random() * NPCS.length)];
  const side = Math.random() < 0.5 ? "орел" : "решка";
  const amount = 10 + Math.floor(Math.random() * 190); // 10..199
  return { npc, side, amount };
}

async function npcTick() {
  const last = Number(await getKey("npc:last_ts", "0")) || 0;
  const t = now();
  if (t - last < NPC_COOLDOWN_MS) return;

  await setKey("npc:last_ts", String(t));

  const count = Math.floor(Math.random() * (NPC_MAX_PER_TICK + 1)); // 0..2
  for (let i = 0; i < count; i++) {
    const { npc, side, amount } = randomNpcBet();

    // NPC баланс тоже ведём (чтобы не улетал в минус)
    const bal = await getBalance(npc.id);
    const betAmount = Math.min(amount, bal);
    if (betAmount <= 0) continue;

    await addBalance(npc.id, -betAmount);

    const result = coinFlip();
    const win = result === side;
    let payout = 0;
    if (win) {
      payout = Math.floor(betAmount * COEF_WIN);
      await addBalance(npc.id, payout);
    }

    const newBal = await getBalance(npc.id);

    await feedPush({
      ts: t,
      type: "npc",
      name: npc.name,
      chosen: side,
      result,
      amount: betAmount,
      win,
      payout,
      balance: newBal
    });
  }
}

export default async (req) => {
  const botToken = process.env.BOT_TOKEN;
  if (req.method !== "POST") return new Response("Only POST", { status: 405 });

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
  const username = auth.user.username || auth.user.first_name || "Player";

  // “оживляем” мир NPC на любых действиях
  await npcTick();

  if (body.action === "balance") {
    const bal = await getBalance(userId);
    return new Response(JSON.stringify({ ok: true, balance: bal }), {
      headers: { "content-type": "application/json" }
    });
  }

  if (body.action === "feed") {
    const limit = Number(body.limit || 30);
    const items = await feedGet(Math.min(50, Math.max(1, limit)));
    return new Response(JSON.stringify({ ok: true, items }), {
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
        headers: { "content-type": "application/json" }
      });
    }

    await addBalance(userId, -amount);

    const result = coinFlip();
    const win = result === side;
    let payout = 0;

    if (win) {
      payout = Math.floor(amount * COEF_WIN);
      await addBalance(userId, payout);
    }

    const newBal = await getBalance(userId);

    // пишем событие игрока в ленту
    await feedPush({
      ts: now(),
      type: "user",
      name: username,
      chosen: side,
      result,
      amount,
      win,
      payout,
      balance: newBal
    });

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