// netlify/functions/tg.js
export async function tg(method, token, payload) {
  const url = `https://api.telegram.org/bot${token}/${method}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload ?? {})
  });
  const data = await res.json();
  if (!data.ok) console.error("Telegram API error:", method, data);
  return data;
}