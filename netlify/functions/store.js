// netlify/functions/store.js
const hasUpstash =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN;

// fallback memory (для теста ок; без Redis на Netlify может сбрасываться)
const mem = new Map();

async function redisCmd(cmd, ...args) {
  const url = `${process.env.UPSTASH_REDIS_REST_URL}/${cmd}/${args
    .map(encodeURIComponent)
    .join("/")}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` }
  });
  return res.json();
}

// ===== Balances =====
export async function getBalance(userId) {
  if (hasUpstash) {
    const r = await redisCmd("get", `bal:${userId}`);
    const val = r?.result;
    return val ? Number(val) : 1000; // стартовый баланс
  }
  return mem.get(`bal:${userId}`) ?? 1000;
}

export async function setBalance(userId, value) {
  if (hasUpstash) {
    await redisCmd("set", `bal:${userId}`, String(value));
    return;
  }
  mem.set(`bal:${userId}`, value);
}

export async function addBalance(userId, delta) {
  const cur = await getBalance(userId);
  const next = Math.max(0, cur + delta);
  await setBalance(userId, next);
  return next;
}

// ===== Generic KV =====
export async function getKey(key, fallback = null) {
  if (hasUpstash) {
    const r = await redisCmd("get", key);
    return r?.result ?? fallback;
  }
  return mem.get(key) ?? fallback;
}

export async function setKey(key, value) {
  if (hasUpstash) {
    await redisCmd("set", key, String(value));
    return;
  }
  mem.set(key, value);
}

// ===== Feed =====
export async function feedPush(eventObj) {
  const key = "feed:global";
  const raw = JSON.stringify(eventObj);

  if (hasUpstash) {
    await redisCmd("lpush", key, raw);
    await redisCmd("ltrim", key, "0", "49");
    return;
  }

  const arr = mem.get(key) ?? [];
  arr.unshift(raw);
  mem.set(key, arr.slice(0, 50));
}

export async function feedGet(limit = 30) {
  const key = "feed:global";
  const n = Math.min(50, Math.max(1, Number(limit) || 30));

  if (hasUpstash) {
    const r = await redisCmd("lrange", key, "0", String(n - 1));
    const list = r?.result ?? [];
    return list
      .map((x) => {
        try {
          return JSON.parse(x);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }

  const arr = mem.get(key) ?? [];
  return arr.slice(0, n).map((x) => JSON.parse(x));
}