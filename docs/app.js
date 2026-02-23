(function () {
  const tg = window.Telegram?.WebApp;

  const el = (id) => document.getElementById(id);
  const API = "https://coinflip-bot.stexiner94.workers.dev/api";

  const state = { side: "орел", amount: 50 };

  function setSide(side) {
    state.side = side;
    el("sideView").textContent = side;
    el("btnOrel").classList.toggle("active", side === "орел");
    el("btnReshka").classList.toggle("active", side === "решка");
  }

  function setAmount(v) {
    const n = Math.max(1, Math.floor(Number(v) || 1));
    state.amount = n;
    el("amount").value = String(n);
    el("amountView").textContent = String(n);
    document.querySelectorAll(".chip").forEach((b) => {
      b.classList.toggle("active", Number(b.dataset.amt) === n);
    });
  }

  async function callApi(action, payload = {}) {
    const body = { action, ...payload, initData: tg?.initData || "" };
    const r = await fetch(API, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!data.ok) throw new Error(data.error || "API error");
    return data;
  }

  async function refreshFeed() {
    const r = await fetch(API, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "feed", limit: 20 }),
    });
    const data = await r.json();
    const feed = el("feed");
    feed.innerHTML = "";
    (data.items || []).forEach((it) => {
      if (it.type !== "round") return;
      const div = document.createElement("div");
      div.className = "feed-item";
      div.textContent = `Раунд: выпало ${it.result} (коэф ${Number(it.coef).toFixed(2)})`;
      feed.appendChild(div);
    });
  }

  async function play() {
    try {
      const data = await callApi("bet", { side: state.side, amount: state.amount });
      tg?.showPopup?.({
        title: data.you.win ? "✅ WIN" : "❌ LOSE",
        message: `Выпало: ${data.result}\nБаланс: ${data.you.balance}`,
        buttons: [{ type: "ok" }],
      }) || alert(`Выпало: ${data.result}\nБаланс: ${data.you.balance}`);
      await refreshFeed();
    } catch (e) {
      alert("Ошибка: " + e.message);
    }
  }

  function bind() {
    tg?.ready?.();
    tg?.expand?.();

    // ВАЖНО: используем pointer events + click (не touchstart)
    el("btnOrel").addEventListener("click", () => setSide("орел"));
    el("btnReshka").addEventListener("click", () => setSide("решка"));

    document.querySelectorAll(".chip").forEach((b) => {
      b.addEventListener("click", () => setAmount(b.dataset.amt));
    });

    el("amount").addEventListener("input", (e) => setAmount(e.target.value));
    el("play").addEventListener("click", play);

    el("balance").addEventListener("click", async () => {
      try {
        const data = await callApi("balance");
        alert("Баланс: " + data.balance);
      } catch (e) {
        alert("Ошибка: " + e.message);
      }
    });

    el("refreshFeed")?.addEventListener("click", refreshFeed);

    setSide("орел");
    setAmount(50);
    refreshFeed();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();