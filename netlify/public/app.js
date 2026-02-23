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

async function refreshBalanceUI() {
  const r = await api("balance");
  if (r.ok) {
    // если хочешь — выведи баланс в интерфейсе отдельным элементом
    console.log("Balance:", r.balance);
  }
}

function renderFeed(items) {
  const el = document.getElementById("feed");
  if (!el) return;
  el.innerHTML = "";

  for (const it of items) {
    const line = document.createElement("div");
    line.style.padding = "10px 12px";
    line.style.borderRadius = "14px";
    line.style.border = "1px solid rgba(255,255,255,.08)";
    line.style.background = "rgba(255,255,255,.03)";

    const who = it.type === "npc" ? `🤖 ${it.name}` : `👤 ${it.name}`;
    const res = it.win ? `✅ +${it.payout}` : `❌ -${it.amount}`;
    line.textContent = `${who}: ${it.amount} на ${it.chosen} → ${it.result} (${res})`;

    el.appendChild(line);
  }
}

async function refreshFeed() {
  const r = await api("feed", { limit: 20 });
  if (r.ok) renderFeed(r.items);
}

document.getElementById("refreshFeed")?.addEventListener("click", refreshFeed);

// авто-обновление раз в 5 сек (не агрессивно)
setInterval(() => {
  if (tg) refreshFeed();
}, 5000);

// первый запуск
if (tg) {
  refreshBalanceUI();
  refreshFeed();
}