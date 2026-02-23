// netlify/functions/webhook.js
import { tg } from "./tg.js";

export default async (req) => {
  const token = process.env.BOT_TOKEN;
  const webAppUrl = process.env.WEBAPP_URL;
  const webhookSecret = process.env.WEBHOOK_SECRET;

  // защита: Telegram пришлёт заголовок X-Telegram-Bot-Api-Secret-Token
  if (webhookSecret) {
    const got = req.headers.get("x-telegram-bot-api-secret-token");
    if (got !== webhookSecret) {
      return new Response("forbidden", { status: 403 });
    }
  }

  if (req.method !== "POST") return new Response("ok", { status: 200 });

  const update = await req.json();
  const msg = update.message;

  if (!msg?.text) return new Response("ok", { status: 200 });

  if (msg.text.startsWith("/start")) {
    await tg("sendMessage", token, {
      chat_id: msg.chat.id,
      text: "🎮 Добро пожаловать в CoinFlip!\n\nЖми кнопку ниже или кнопку Menu → Играть.",
      reply_markup: {
        inline_keyboard: [[{ text: "Открыть игру", web_app: { url: webAppUrl } }]]
      }
    });
  }

  return new Response("ok", { status: 200 });
};

export const config = { path: "/.netlify/functions/webhook" };