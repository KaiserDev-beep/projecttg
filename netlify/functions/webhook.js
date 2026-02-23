// netlify/functions/webhook.js
import { tg } from "./tg.js";

export default async (req) => {
  const token = process.env.BOT_TOKEN;
  const webAppUrl = process.env.WEBAPP_URL;
  const webhookSecret = process.env.WEBHOOK_SECRET;

  // Telegram будет слать POST
  if (req.method !== "POST") return new Response("ok", { status: 200 });

  // защита secret_token (если включен)
  if (webhookSecret) {
    const got = req.headers.get("x-telegram-bot-api-secret-token");
    if (got !== webhookSecret) return new Response("forbidden", { status: 403 });
  }

  const update = await req.json().catch(() => ({}));

  // Сообщения
  const msg = update.message;
  if (msg?.text) {
    const text = msg.text.trim();
    const chatId = msg.chat.id;

    if (text.startsWith("/start")) {
      await tg("sendMessage", token, {
        chat_id: chatId,
        text: "🎮 Готово! Нажми кнопку ниже или Menu → Играть",
        reply_markup: {
          inline_keyboard: [[{ text: "Открыть игру", web_app: { url: webAppUrl } }]]
        }
      });
    }
  }

  // CallbackQuery (на будущее, если кнопки inline будут)
  const cq = update.callback_query;
  if (cq?.id) {
    await tg("answerCallbackQuery", token, { callback_query_id: cq.id });
  }

  return new Response("ok", { status: 200 });
};