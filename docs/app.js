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

  function showToast(msg) {
    const t = $("toast");
    if (!t) return;
    t.textContent = msg;
    t.style.display = "block";
    clearTimeout(showToast._tm);
    showToast._tm = setTimeout(() => (t.style.display = "none"), 2200);
  }

  function animateCoin(result) {
    const el = document.getElementById("coin3d");
    if (!el) return;

    // финал стороны после крутилки
    setTimeout(() => {
      el.style.transform = result === "орел" ? "rotateY(0deg)" : "rotateY(180deg)";
    }, 1150);
  }

  function spinCoinNow() {
    const el = document.getElementById("coin3d");
    if (!el) return;
    el.classList.remove("flip");
    void el.offsetWidth;
    el.classList.add("flip");
  }

  function setSide(side) {
    state.side = side;
    $("sideView").textContent = side;
    $("btnOrel").classList.toggle("active", side === "орел");
    $("btnReshka").classList.toggle("active", side === "решка");
    debug("SIDE=" + side);
    tg?.HapticFeedback?.selectionChanged?.();
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
    const body = {
      action,
      ...payload,
      initData: tg?.initData || "",
      user: tg?.initDataUnsafe?.user || null,
    };

    const r = await fetch(API, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await r.json().catch(() => ({}));
    if (!data.ok) throw new Error(data.error || "API error");

    if (action === "bet" && data.result) animateCoin(data.result);
    return data;
  }

  function renderRound(data) {
    const card = $("resultCard");
    const badge = $("resultBadge");
    const coefView = $("coefView");
    const resultText = $("resultText");
    const balanceText = $("balanceText");
    const list = $("roundList");

    if (!card) return;

    const youWin = !!data?.you?.win;

    badge.classList.remove("win", "lose");
    badge.classList.add(youWin ? "win" : "lose");
    badge.textContent = youWin ? "✅ WIN" : "❌ LOSE";

    coefView.textContent = Number(data.coef || 0).toFixed(2);
    resultText.textContent = `Выпало: ${String(data.result || "").toUpperCase()}`;
    balanceText.textContent = `Баланс: ${data.you?.balance ?? "—"}`;

    list.innerHTML = "";
    const parts = data?.round?.participants || [];

    parts.forEach((p) => {
      const row = document.createElement("div");
      row.className = "rowp";

      const left = document.createElement("div");
      left.className = "left";

      const tag = document.createElement("div");
      tag.className = "tag " + (p.isNpc ? "npc" : "you");
      tag.textContent = p.isNpc ? "NPC" : "YOU";

      const col = document.createElement("div");
      col.style.minWidth = "0";

      const nm = document.createElement("div");
      nm.className = "name";
      nm.textContent = p.name;

      const meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent = `${p.side} • ставка ${p.amount}`;

      col.appendChild(nm);
      col.appendChild(meta);

      left.appendChild(tag);
      left.appendChild(col);

      const right = document.createElement("div");
      right.className = "right";
      right.textContent = p.win ? "✅" : "❌";

      row.appendChild(left);
      row.appendChild(right);
      list.appendChild(row);
    });

    card.style.display = "block";
  }

  async function refreshFeed() {
    const r = await fetch(API, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "feed", limit: 20 }),
    });

    const data = await r.json().catch(() => ({}));
    const feed = $("feed");
    feed.innerHTML = "";

    (data.items || []).forEach((it) => {
      if (it.type !== "round") return;
      const div = document.createElement("div");
      div.className = "feed-item";
      div.innerHTML = `<b>${String(it.result || "").toUpperCase()}</b> • коэф ${Number(it.coef || 0).toFixed(2)} • игроков ${it.totals?.players ?? "—"}`;
      feed.appendChild(div);
    });
  }

  async function play() {
    if (state.busy) return;
    state.busy = true;
    debug("PLAY CLICK");

    try {
      // крутилка ДО результата
      spinCoinNow();

      const data = await callApi("bet", { side: state.side, amount: state.amount });

      // красиво рисуем раунд
      renderRound(data);

      // toast с профитом/убытком
      const prof = (data.you?.payout || 0) - (data.you?.amount || 0);
      showToast(data.you?.win ? `+${prof} 🎉` : `-${data.you?.amount} 😬`);

      tg?.HapticFeedback?.notificationOccurred?.(data.you?.win ? "success" : "error");

      await refreshFeed();
    } catch (e) {
      showToast("Ошибка: " + e.message);
      debug("ERR=" + e.message);
      tg?.HapticFeedback?.notificationOccurred?.("error");
    } finally {
      state.busy = false;
    }
  }

  function bind() {
    tg?.ready?.();
    tg?.expand?.();

    document.addEventListener("pointerdown", (e) => {
      const t = e.target;

      if (t.closest("#btnOrel")) return setSide("орел");
      if (t.closest("#btnReshka")) return setSide("решка");

      const chip = t.closest(".chip");
      if (chip) return setAmount(chip.dataset.amt);

      if (t.closest("#play")) return play();

      if (t.closest("#balance")) {
        debug("BALANCE CLICK");
        callApi("balance")
          .then(d => showToast("Баланс: " + d.balance))
          .catch(err => showToast("Ошибка: " + err.message));
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