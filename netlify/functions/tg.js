export async function answerCallbackQuery(token, callback_query_id, text) {
  return tg("answerCallbackQuery", token, {
    callback_query_id,
    text,
    show_alert: false
  });
}