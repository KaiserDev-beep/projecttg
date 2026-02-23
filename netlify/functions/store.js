// добавь в конец netlify/functions/store.js

export async function feedPush(eventObj) {
  const key = "feed:global";
  const raw = JSON.stringify(eventObj);

  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    await redisCmd("lpush", key, raw);
    await redisCmd("ltrim", key, "0", "49"); // храним 50 последних
    return;
  }

  // fallback memory
  const arr = mem.get(key) ?? [];
  arr.unshift(raw);
  mem.set(key, arr.slice(0, 50));
}

export async function feedGet(limit = 30) {
  const key = "feed:global";

  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    const r = await redisCmd("lrange", key, "0", String(Math.max(0, limit - 1)));
    const list = r?.result ?? [];
    return list.map((x) => {
      try { return JSON.parse(x); } catch { return null; }
    }).filter(Boolean);
  }

  const arr = mem.get(key) ?? [];
  return arr.slice(0, limit).map((x) => JSON.parse(x));
}

export async function getKey(key, fallback = null) {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    const r = await redisCmd("get", key);
    return r?.result ?? fallback;
  }
  return mem.get(key) ?? fallback;
}

export async function setKey(key, value) {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    await redisCmd("set", key, String(value));
    return;
  }
  mem.set(key, value);
}