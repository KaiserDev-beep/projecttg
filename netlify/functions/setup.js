// netlify/functions/setup.js
import { tg } from "./tg.js";

export default async (req) => {
  const token = process.env.BOT_TOKEN;
  const webAppUrl = process.env.WEBAPP_URL;
  const setupSecret = process.env.SETUP_SECRET;
  const webhookSecret = process.env.WEBHOOK_SECRET;

  const url = new URL(req.url);
  const secret = url.searchParams.get("secret");

  if (!setupSecret || !token || !webAppUrl) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "Missing env vars: SETUP_SECRET / BOT_TOKEN / WEBAPP_URL"
      }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }

  if (secret !== setupSecret) {
    return new Response(JSON.stringify({ ok: false, error: "Forbidden" }), {
      status: 403,
      headers: { "content-type": "application/json" }
    });
  }

  // базовый URL сайта (Netlify)
  const host = req.headers.get("host");
  const baseUrl = `https://${host}`;
  const webhookUrl = `${baseUrl}/.netlify/functions/webhook`;

  // 1) Menu button -> WebApp
  const menuRes = await tg("setChatMenuButton", token, {
    menu_button: {
      type: "web_app",
      text: "Играть",
      web_app: { url: webAppUrl }
    }
  });

  // 2) Set webhook
  const webhookPayload = {
    url: webhookUrl,
    allowed_updates: ["message"] // нам достаточно message для /start
  };

  // секретный токен для защиты webhook (Telegram будет слать заголовок)
  if (webhookSecret) webhookPayload.secret_token = webhookSecret;

  const hookRes = await tg("setWebhook", token, webhookPayload);

  return new Response(
    JSON.stringify({
      ok: true,
      baseUrl,
      webhookUrl,
      menu: menuRes,
      webhook: hookRes
    }),
    { headers: { "content-type": "application/json" } }
  );
};