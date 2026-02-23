/**
 * Cloudflare Worker (module syntax)
 * Routes:
 *  - GET  /setup?secret=...   -> setWebhook + setChatMenuButton
 *  - POST /webhook            -> Telegram updates
 *  - POST /api                -> MiniApp API (bet/balance/feed)
 *
 * Required bindings:
 *  - KV (Cloudflare KV Namespace)
 *  - BOT_TOKEN (env var)
 *  - WEBAPP_URL (env var) e.g. https://your.pages.dev
 *  - SETUP_SECRET (env var)
 * Optional:
 *  - WEBHOOK_SECRET (env var) (only [A-Za-z0-9_-], <=256)
 */

const NPCS = [
  { id: "npc_1", name: "BotAlpha" },
  { id: "npc_2", name: "BotBeta" },
  { id: "npc_3", name: "CoinGhost" },
];

const DEFAULT_BALANCE = 1000;
const FEED_KEY = "feed:v1";
const FEED_MAX = 50;

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function text(str, status = 200) {
  return new Response(str, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
}

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function coinFlip() {
  return Math.random() < 0.5 ? "орел" : "решка";
}

function normalizeSide(s) {
  s = String(s || "").toLowerCase();
  if (s === "орёл" || s === "орел") return "орел";
  if (s === "решка") return "решка";
  return null;
}

function isValidWebhookSecret(s) {
  if (!s) return false;
  if (s.length > 256) return false;
  // Telegram secret_token: safe set (практически всегда ok)
  return /^[A-Za-z0-9_-]+$/.test(s);
}

// ---------- KV store ----------
async function getBalance(KV, id) {
  const key = `bal:${id}`;
  const raw = await KV.get(key);
  if (raw === null) {
    await KV.put(key, String(DEFAULT_BALANCE));
    return DEFAULT_BALANCE;
  }
  const n = Number(raw);
  return Number.isFinite(n) ? n : DEFAULT_BALANCE;
}

async function addBalance(KV, id, delta) {
  const bal = await getBalance(KV, id);
  const next = Math.max(0, bal + delta);
  await KV.put(`bal:${id}`, String(next));
  return next;
}

async function feedGet(KV, limit = 20) {
  const raw = await KV.get(FEED_KEY);
  const arr = raw ? safeJsonParse(raw, []) : [];
  return arr.slice(0, Math.min(limit, arr.length));
}

async function feedPush(KV, item) {
  const raw = await KV.get(FEED_KEY);
  const arr = raw ? safeJsonParse(raw, []) : [];
  arr.unshift(item);
  if (arr.length > FEED_MAX) arr.length = FEED_MAX;
  await KV.put(FEED_KEY, JSON.stringify(arr));
}

function safeJsonParse(s, fallback) {
  try { return JSON.parse(s); } catch { return fallback; }
}

// ---------- Telegram helpers ----------
async function tgCall(method, token, payload) {
  const url = `https://api.telegram.org/bot${token}/${method}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await r.json().catch(() => null);
  return data || { ok: false, error: "Bad TG response" };
}

function toHex(buf) {
  const bytes = new Uint8Array(buf);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}

async function hmacSha256(keyBytes, messageStr) {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(messageStr));
  return sig;
}

async function verifyInitData(initData, botToken) {
  // https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
  const params = new URLSearchParams(initData || "");
  const hash = params.get("hash");
  if (!hash) return { ok: false };

  params.delete("hash");
  const pairs = [];
  for (const [k, v] of params.entries()) pairs.push([k, v]);
  pairs.sort((a, b) => a[0].localeCompare(b[0]));
  const dataCheckString = pairs.map(([k, v]) => `${k}=${v}`).join("\n");

  // secretKey = HMAC_SHA256("WebAppData", botToken)
  const secretKey = await hmacSha256(new TextEncoder().encode("WebAppData"), botToken);

  // computedHash = HMAC_SHA256(secretKey, dataCheckString) hex
  const computed = await hmacSha256(new Uint8Array(secretKey), dataCheckString);
  const computedHex = toHex(computed);

  if (computedHex !== hash) return { ok: false };

  const userRaw = params.get("user");
  const user = userRaw ? safeJsonParse(userRaw, null) : null;
  return { ok: true, user };
}

// ---------- Handlers ----------
async function handleSetup(request, env) {
  const { BOT_TOKEN, WEBAPP_URL, SETUP_SECRET, WEBHOOK_SECRET } = env;

  if (!BOT_TOKEN || !WEBAPP_URL || !SETUP_SECRET) {
    return json({ ok: false, error: "Missing env vars: BOT_TOKEN / WEBAPP_URL / SETUP_SECRET" }, 500);
  }

  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");
  if (secret !== SETUP_SECRET) return json({ ok: false, error: "Forbidden" }, 403);

  const origin = url.origin;
  const webhookUrl = `${origin}/webhook`;

  // 1) Menu button -> WebApp
  const menu = await tgCall("setChatMenuButton", BOT_TOKEN, {
    menu_button: {
      type: "web_app",
      text: "Играть",
      web_app: { url: WEBAPP_URL },
    },
  });

  // 2) Set webhook
  const webhookPayload = {
    url: webhookUrl,
    // без allowed_updates — проще, пусть всё приходит
  };

  if (isValidWebhookSecret(WEBHOOK_SECRET)) {
    webhookPayload.secret_token = WEBHOOK_SECRET;
  }

  const webhook = await tgCall("setWebhook", BOT_TOKEN, webhookPayload);

  return json({ ok: true, origin, webhookUrl, menu, webhook });
}

async function handleWebhook(request, env) {
  const { BOT_TOKEN, WEBAPP_URL, WEBHOOK_SECRET } = env;
  if (!BOT_TOKEN || !WEBAPP_URL) return text("Missing env", 500);

  if (request.method !== "POST") return text("ok", 200);

  // optional secret header verify
  if (isValidWebhookSecret(WEBHOOK_SECRET)) {
    const got = request.headers.get("x-telegram-bot-api-secret-token");
    if (got !== WEBHOOK_SECRET) return text("forbidden", 403);
  }

  const update = await request.json().catch(() => ({}));
  const msg = update.message;

  if (msg && msg.text && msg.chat && msg.chat.id) {
    const textMsg = String(msg.text).trim();
    const chatId = msg.chat.id;

    if (textMsg.startsWith("/start")) {
      await tgCall("sendMessage", BOT_TOKEN, {
        chat_id: chatId,
        text: "🎮 Готово! Нажми кнопку ниже или Menu → Играть",
        reply_markup: {
          inline_keyboard: [[{ text: "Открыть игру", web_app: { url: WEBAPP_URL } }]],
        },
      });
    }
  }

  return text("ok", 200);
}

async function handleApi(request, env) {
  const { KV, BOT_TOKEN } = env;
  if (!KV) return json({ ok: false, error: "KV binding missing" }, 500);
  if (!BOT_TOKEN) return json({ ok: false, error: "BOT_TOKEN missing" }, 500);

  if (request.method !== "POST") return text("Only POST", 405);

  const body = await request.json().catch(() => null);
  if (!body || !body.action) return json({ ok: false, error: "Bad request" }, 400);

  // feed можно без initData (чтобы UI мог грузиться/обновляться)
  if (body.action === "feed") {
    const limit = Math.min(50, Math.max(1, Number(body.limit || 20)));
    const items = await feedGet(KV, limit);
    return json({ ok: true, items });
  }

  // остальное только с initData
  const auth = await verifyInitData(body.initData || "", BOT_TOKEN);
  if (!auth.ok || !auth.user || !auth.user.id) return json({ ok: false, error: "Unauthorized" }, 401);

  const userId = String(auth.user.id);
  const username = auth.user.username ? `@${auth.user.username}` : (auth.user.first_name || "Player");

  if (body.action === "balance") {
    const bal = await getBalance(KV, userId);
    return json({ ok: true, balance: bal });
  }

  if (body.action === "bet") {
    const amount = Math.floor(Number(body.amount));
    const side = normalizeSide(body.side);

    if (!Number.isFinite(amount) || amount <= 0 || !side) {
      return json({ ok: false, error: "Bad bet params" }, 400);
    }

    const userBal = await getBalance(KV, userId);
    if (amount > userBal) {
      return json({ ok: false, error: "Not enough balance", balance: userBal }, 400);
    }

    // participants: user + 1..3 NPC
    const participants = [{
      id: userId,
      name: username,
      isNpc: false,
      side,
      amount,
    }];

    const npcCount = rand(1, 3);
    for (let i = 0; i < npcCount; i++) {
      const npc = NPCS[rand(0, NPCS.length - 1)];
      const npcSide = Math.random() < 0.5 ? "орел" : "решка";
      const npcAmt = [10, 25, 50, 75, 100, 150, 200][rand(0, 6)];
      const bal = await getBalance(KV, npc.id);
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

    // deduct bets
    for (const p of participants) {
      await addBalance(KV, p.id, -p.amount);
    }

    const result = coinFlip();

    const winners = participants.filter(p => p.side === result);
    const losers = participants.filter(p => p.side !== result);

    const winnersPool = winners.reduce((s, p) => s + p.amount, 0);
    const losersPool = losers.reduce((s, p) => s + p.amount, 0);

    const coef = winnersPool > 0 ? (1 + losersPool / winnersPool) : 0;

    const payouts = [];
    if (winnersPool > 0) {
      for (const w of winners) {
        const share = losersPool * (w.amount / winnersPool);
        const payout = Math.floor(w.amount + share);
        await addBalance(KV, w.id, payout);
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

    const newUserBal = await getBalance(KV, userId);
    const your = payouts.find(x => x.id === userId);
    const youWin = !!your;

    const roundEvent = {
      ts: new Date().toISOString(),
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
      participants: participants.map(p => ({
        name: p.name,
        isNpc: p.isNpc,
        side: p.side,
        amount: p.amount,
        win: p.side === result,
      })),
      payouts,
    };

    await feedPush(KV, roundEvent);

    return json({
      ok: true,
      result,
      coef: winnersPool > 0 ? Number(coef.toFixed(4)) : 0,
      you: {
        side,
        amount,
        win: youWin,
        payout: youWin ? your.payout : 0,
        balance: newUserBal,
      },
      round: {
        participants: roundEvent.participants,
        winnersPool,
        losersPool,
      },
    });
  }

  return json({ ok: false, error: "Unknown action" }, 400);
}

// ---------- Router ----------
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/setup") return handleSetup(request, env);
    if (path === "/webhook") return handleWebhook(request, env);
    if (path === "/api") return handleApi(request, env);

    return text("Not found", 404);
  },
};