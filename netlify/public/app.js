const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }

async function api(action, payload = {}) {
  const res = await fetch("/.netlify/functions/api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      initData: tg?.initData || "",
      action,
      ...payload
    })
  });
  return res.json();
}

// пример: получить баланс
async function refreshBalance() {
  const r = await api("balance");
  if (r.ok) {
    // обнови UI
    console.log("balance", r.balance);
  }
}

// пример: сделать ставку
async function doBet(amount, side) {
  const r = await api("bet", { amount, side });
  console.log(r);
}