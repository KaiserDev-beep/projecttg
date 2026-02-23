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

  function setButtonBusy(busy) {
    const btn = $("play");
    if (!btn) return;
    btn.disabled = !!busy;
    btn.textContent = busy ? "Подбрасываем..." : "Сделать ставку";
  }

  function setSide(side) {
    state.side = side;
    $("sideView").textContent = side;
    $("btnOrel").classList.toggle("active", side === "орел");
    $("btnReshka").classList.toggle("active", side === "решка");
    tg?.HapticFeedback?.selectionChanged?.();
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
    return data;
  }

  // ===== ULTRA EFFECTS =====
  function floorPulse() {
    const f = $("floor");
    if (!f) return;
    f.classList.remove("pulse");
    void f.offsetWidth;
    f.classList.add("pulse");
  }

  function glowOn(type) {
    const g = $("glowRing");
    if (!g) return;
    g.classList.remove("win", "lose", "on");
    g.classList.add(type);
    // next frame
    requestAnimationFrame(() => g.classList.add("on"));
  }

  function glowOff() {
    const g = $("glowRing");
    if (!g) return;
    g.classList.remove("on", "win", "lose");
  }

  function particlesBurst(type) {
    const box = $("particles");
    if (!box) return;

    box.classList.remove("play");
    box.innerHTML = "";

    // создаём 18 частиц
    const count = 18;
    for (let i = 0; i < count; i++) {
      const p = document.createElement("div");
      p.className = "p" + (type === "lose" ? " lose" : "");
      const angle = (Math.PI * 2) * (i / count);
      const dist = 60 + Math.random() * 70;
      const dx = Math.cos(angle) * dist;
      const dy = -Math.abs(Math.sin(angle) * dist) - (20 + Math.random() * 40);

      p.style.setProperty("--dx", `${dx.toFixed(1)}px`);
      p.style.setProperty("--dy", `${dy.toFixed(1)}px`);
      p.style.animationDelay = `${Math.random() * 80}ms`;

      box.appendChild(p);
    }

    // старт
    requestAnimationFrame(() => box.classList.add("play"));

    // чистим
    setTimeout(() => {
      box.classList.remove("play");
      box.innerHTML = "";
    }, 750);
  }

  function coinTossStart() {
    const el = $("coin3d");
    if (!el) return;
    el.classList.remove("toss");
    void el.offsetWidth;
    el.classList.add("toss");
  }

  function coinSetResult(result) {
    const el = $("coin3d");
    if (!el) return;
    // после завершения toss фиксируем сторону
    setTimeout(() => {
      el.style.transform = result === "орел" ? "rotateY(0deg)" : "rotateY(180deg)";
      floorPulse();
    }, 1350);
  }

  function animateNumber(el, to, ms = 420) {
    if (!el) return;
    const from = Number(el.dataset.n || "0") || 0;
    const start = performance.now();
    el.dataset.n = String(to);

    function tick(now) {
      const p = Math.min(1, (now - start) / ms);
      const v = Math.floor(from + (to - from) * (1 - Math.pow(1 - p, 3)));
      el.textContent = String(v);
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function renderRound(data) {
    const card = $("resultCard");
    const badge = $("resultBadge");
    const coefView = $("coefView");
    const resultText = $("resultText");
    const balanceText = $("balanceText");
    const deltaText = $("deltaText");
    const payoutText = $("payoutText");
    const list = $("roundList");
    const winnersPoolEl = $("winnersPool");
    const losersPoolEl = $("losersPool");

    if (!card) return;

    const you = data.you || {};
    const youWin = !!you.win;

    badge.classList.remove("win", "lose");
    badge.classList.add(youWin ? "win" : "lose");
    badge.textContent = youWin ? "✅ WIN" : "❌ LOSE";

    coefView.textContent = Number(data.coef || 0).toFixed(2);
    resultText.textContent = `Выпало: ${String(data.result || "").toUpperCase()}`;
    balanceText.textContent = `Баланс: ${you.balance ?? "—"}`;

    // банки
    const winnersPool = Number(data.round?.winnersPool || 0);
    const losersPool = Number(data.round?.losersPool || 0);
    animateNumber(winnersPoolEl, winnersPool);
    animateNumber(losersPoolEl, losersPool);

    // дельта
    const delta = (you.payout || 0) - (you.amount || 0);
    deltaText.textContent = youWin ? `+${delta}` : `-${you.amount || 0}`;
    deltaText.style.color = youWin ? "var(--good)" : "var(--bad)";
    payoutText.textContent = `Выплата: ${youWin ? (you.payout || 0) : 0}`;

    // участники
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
      right.innerHTML = `${p.win ? "✅" : "❌"}<small>${p.win ? "WIN" : "LOSE"}</small>`;

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

  async function updateBalanceInline() {
    try {
      const d = await callApi("balance");
      showToast(`Баланс: ${d.balance}`);
    } catch (e) {
      showToast("Ошибка: " + e.message);
    }
  }

  async function play() {
    if (state.busy) return;
    state.busy = true;
    setButtonBusy(true);
    debug("PLAY CLICK");

    try {
      glowOff(); // сброс
      coinTossStart(); // старт подбрасывания

      const data = await callApi("bet", { side: state.side, amount: state.amount });

      // фикс стороны + “удар”
      coinSetResult(data.result);

      // эффекты по win/lose
      const type = data.you?.win ? "win" : "lose";
      glowOn(type);
      particlesBurst(type);

      // отрисовка результата
      renderRound(data);

      // текст без окон
      const prof = (data.you?.payout || 0) - (data.you?.amount || 0);
      showToast(data.you?.win ? `WIN +${prof}` : `LOSE -${data.you?.amount}`);

      tg?.HapticFeedback?.notificationOccurred?.(data.you?.win ? "success" : "error");

      await refreshFeed();
    } catch (e) {
      showToast("Ошибка: " + e.message);
      debug("ERR=" + e.message);
      tg?.HapticFeedback?.notificationOccurred?.("error");
      glowOn("lose");
      particlesBurst("lose");
    } finally {
      state.busy = false;
      setButtonBusy(false);
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
      if (t.closest("#balance")) return updateBalanceInline();
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