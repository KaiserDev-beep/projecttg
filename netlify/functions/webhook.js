import { tg } from "./tg.js";

export default async (req) => {
  const token = process.env.BOT_TOKEN;
  const webAppUrl = process.env.WEBAPP_URL;

  if (req.method !== "POST") {
    return new Response("ok", { status: 200 });
  }

  const update = await req.json();
  const msg = update.message;

  if (!msg?.text) {
    return new Response("ok", { status: 200 });
  }

  if (msg.text.startsWith("/start")) {
    await tg("sendMessage", token, {
      chat_id: msg.chat.id,
      text: "🎮 Добро пожаловать в CoinFlip!\n\nНажми кнопку ниже, чтобы открыть игру.",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "Открыть игру",
              web_app: { url: webAppUrl }
            }
          ]
        ]
      }
    });
  }

  return new Response("ok", { status: 200 });
};

export const config = {
  path: "/.netlify/functions/webhook"
};