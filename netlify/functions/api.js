
import crypto from "crypto";
import { getBalance, addBalance, feedPush, feedGet } from "./store.js";

function json(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

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

const NPCS = [
  { id: "npc_1", name: "BotAlpha" },
  { id: "npc_2", name: "BotBeta" },
  { id: "npc_3", name: "CoinGhost" },
];

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomNpcBet() {
  const npc = NPCS[rand(0, NPCS.length - 1)];
  const side = Math.random() < 0.5 ? "орел" : "решка";
  const amount = [10, 25, 50, 75, 100, 150, 200][rand(0, 6)];
  return { npc, side, amount };
}

function isoNow() {
  return new Date().toISOString();
}

export default async (req) => {
  const botToken = process.env.BOT_TOKEN;
  if (!botToken) return json(500, { ok: false, error: "BOT_TOKEN missing" });

  if (req.method !== "POST") return new Response("Only POST", { status: 405 });

  const body = await req.json().catch(() => null);
  if (!body?.action) return json(400, { ok: false, error: "Bad request" });

  // feed можно отдавать без авторизации
  if (body.action === "feed") {
    const limit = Math.min(50, Math.max(1, Number(body.limit || 30)));
    const items = await feedGet(limit);
    return json(200, { ok: true, items });
  }

  // Всё остальное — только из Telegram Mini App
  const auth = verifyInitData(body.initData || "", botToken);
  if (!auth.ok || !auth.user?.id) return json(401, { ok: false, error: "Unauthorized" });

  const userId = String(auth.user.id);
  const username = auth.user.username ? `@${auth.user.username}` : (auth.user.first_name || "Player");

  if (body.action === "balance") {
    const bal = await getBalance(userId);
    return json(200, { ok: true, balance: bal });
  }

  if (body.action === "bet") {
    const amount = Math.floor(Number(body.amount));
    const side = normalizeSide(body.side);

    if (!Number.isFinite(amount) || amount <= 0 || !side) {
      return json(400, { ok: false, error: "Bad bet params" });
    }

    const userBal = await getBalance(userId);
    if (amount > userBal) {
      return json(400, { ok: false, error: "Not enough balance", balance: userBal });
    }

    // Создаём участников раунда: user + NPC (вместе!)
    const participants = [];

    participants.push({
      id: userId,
      name: username,
      isNpc: false,
      side,
      amount,
    });

    // NPC: 1..3 ставок в раунд (настрой как хочешь)
    const npcCount = rand(1, 3);
    for (let i = 0; i < npcCount; i++) {
      const { npc, side: npcSide, amount: npcAmt } = randomNpcBet();
      const bal = await getBalance(npc.id);
      const betAmt = Math.min(npcAmt, bal);
      if (betAmt <= 0) continue;

      participants.push({
        id: npc.id,
        name: npc.name,
        isNpc: true,
        side: npcSide,
        amount: betAmt,
      });
    }

    // Списываем ставки у всех участников
    for (const p of participants) {
      await addBalance(p.id, -p.amount);
    }

    const result = coinFlip();

    const winners = participants.filter((p) => p.side === result);
    const losers = participants.filter((p) => p.side !== result);

    const winnersPool = winners.reduce((s, p) => s + p.amount, 0);
    const losersPool = losers.reduce((s, p) => s + p.amount, 0);

    // коэффициент раунда (для победителей)
    const coef = winnersPool > 0 ? (1 + losersPool / winnersPool) : 0;

    // Выплаты победителям (возврат ставки + доля банка проигравших)
    const payouts = [];
    if (winnersPool > 0) {
      for (const w of winners) {
        const share = losersPool * (w.amount / winnersPool);
        const payout = Math.floor(w.amount + share);
        await addBalance(w.id, payout);

        payouts.push({
          id: w.id,
          name: w.name,
          isNpc: w.isNpc,
          amount: w.amount,
          payout,
          profit: payout - w.amount,
        });
      }
    }

    // Итоговые балансы (только для удобства фронта — покажем игрока)
    const newUserBal = await getBalance(userId);

    // Запишем в ленту ОДНО событие раунда (и участники внутри)
    await feedPush({
      ts: isoNow(),
      type: "round",
      result,
      coef: winnersPool > 0 ? Number(coef.toFixed(4)) : 0,
      totals: {
        players: participants.length,
        winners: winners.length,
        losers: losers.length,
        winnersPool,
        losersPool,
      },
      participants: participants.map((p) => ({
        name: p.name,
        isNpc: p.isNpc,
        side: p.side,
        amount: p.amount,
        win: p.side === result,
      })),
      payouts,
    });

    // Ответ клиенту (важно: фронт покажет “кто сколько получил”)
    const youWin = side === result && winnersPool > 0;
    const yourPayout = payouts.find((x) => x.id === userId)?.payout ?? 0;

    return json(200, {
      ok: true,
      result,
      coef: winnersPool > 0 ? Number(coef.toFixed(4)) : 0,
      you: {
        side,
        amount,
        win: youWin,
        payout: yourPayout,
        balance: newUserBal,
      },
      round: {
        participants: participants.map((p) => ({
          name: p.name,
          isNpc: p.isNpc,
          side: p.side,
          amount: p.amount,
          win: p.side === result,
        })),
        winnersPool,
        losersPool,
      },
    });
  }

  return json(400, { ok: false, error: "Unknown action" });
};