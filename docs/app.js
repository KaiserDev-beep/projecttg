(() => {
  const tg = window.Telegram?.WebApp;
  const API = "https://coinflip-bot.stexiner94.workers.dev/api";

  const $ = (id) => document.getElementById(id);
  const state = { side: "орел", amount: 50, busy: false };

  function debug(t) {
    const d = $("debug");
    if (d) d.textContent = t;
    console.log(t);
  }

  function setSide(side) {
    state.side = side;
    $("sideView").textContent = side;
    $("btnOrel").classList.toggle("active", side === "орел");
    $("btnReshka").classList.toggle("active", side === "решка");
    debug("SIDE=" + side);
  }

  function setAmount(v) {
    const n = Math.max(1, Math.floor(Number(v) || 1));
    state.amount = n;
    $("amount").value = String(n);
    $("amountView").textContent = String(n);
    document.querySelectorAll(".chip").forEach((b) => {
      b.classList.toggle("active", Number(b.dataset.amt) === n);
    });
    debug("AMOUNT=" + n);
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
    const feed = $("feed");
    feed.innerHTML = "";
    (data.items || []).forEach((it) => {
      if (it.type !== "round") return;
      const div = document.createElement("div");
      div.className = "feed-item";
      div.textContent = `Раунд: выпало ${it.result} (коэф ${Number(it.coef || 0).toFixed(2)})`;
      feed.appendChild(div);
    });
  }

  async function play() {
    if (state.busy) return;
    state.busy = true;
    debug("PLAY CLICK");
    try {
      const data = await callApi("bet", { side: state.side, amount: state.amount });
      const msg = `Выпало: ${data.result}\nБаланс: ${data.you.balance}`;
      tg?.showPopup?.({ title: data.you.win ? "✅ WIN" : "❌ LOSE", message: msg, buttons: [{ type: "ok" }] })
        || alert(msg);
      await refreshFeed();
    } catch (e) {
      alert("Ошибка: " + e.message);
      debug("ERR=" + e.message);
    } finally {
      state.busy = false;
    }
  }

  function bind() {
    tg?.ready?.();
    tg?.expand?.();

    // ловим клики надёжно (даже если нажал на текст внутри кнопки)
    document.addEventListener("pointerdown", (e) => {
      const t = e.target;

      if (t.closest("#btnOrel")) return setSide("орел");
      if (t.closest("#btnReshka")) return setSide("решка");

      const chip = t.closest(".chip");
      if (chip) return setAmount(chip.dataset.amt);

      if (t.closest("#play")) return play();

      if (t.closest("#balance")) {
        debug("BALANCE CLICK");
        callApi("balance").then(d => alert("Баланс: " + d.balance)).catch(err => alert(err.message));
        return;
      }

      if (t.closest("#refreshFeed")) return refreshFeed();
    }, { capture: true });

    $("amount").addEventListener("input", (e) => setAmount(e.target.value));

    setSide("орел");
    setAmount(50);
    refreshFeed();
    debug("APP LOADED ✅");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();
})();