// public/app.js (compatible for Telegram Desktop + iOS)
(function () {
  function $(id) { return document.getElementById(id); }

  var tg = null;
  try { if (window.Telegram && window.Telegram.WebApp) tg = window.Telegram.WebApp; } catch (e) {}

  var state = { side: "орел", amount: 50, busy: false };

  function toast(text) {
    try {
      if (tg && tg.showPopup) {
        tg.showPopup({ title: "CoinFlip", message: String(text), buttons: [{ type: "ok" }] });
      } else {
        alert(text);
      }
    } catch (e) { alert(text); }
  }

  function setActiveSide(side) {
    state.side = side;
    var o = $("btnOrel");
    var r = $("btnReshka");
    var v = $("sideView");
    if (o) o.classList.toggle("active", side === "орел");
    if (r) r.classList.toggle("active", side === "решка");
    if (v) v.textContent = side;
  }

  function setAmount(val) {
    var n = Math.max(1, Math.floor(Number(val) || 1));
    state.amount = n;

    var input = $("amount");
    var view = $("amountView");
    if (input) input.value = String(n);
    if (view) view.textContent = String(n);

    var chips = document.querySelectorAll(".chip");
    for (var i = 0; i < chips.length; i++) {
      var b = chips[i];
      var amt = Number(b.getAttribute("data-amt"));
      b.classList.toggle("active", amt === n);
    }
  }

  function api(action, payload, cb) {
    payload = payload || {};
    var initData = "";
    try { initData = tg ? (tg.initData || "") : ""; } catch (e) {}

    var body = { action: action, initData: initData };
    for (var k in payload) body[k] = payload[k];

    // Заменить в public/app.js
    const API_BASE = "https://coinflip-bot.stexiner94.workers.dev";

fetch(`${API_BASE}/api`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body)
})
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data || !data.ok) throw new Error((data && data.error) || "Request failed");
        cb(null, data);
      })
      .catch(function (err) { cb(err); });
  }

  function renderRoundFeed(items) {
    var feed = $("feed");
    if (!feed) return;
    feed.innerHTML = "";

    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!it || it.type !== "round") continue;

      var head = document.createElement("div");
      head.className = "feed-item";
      var coef = Number(it.coef || 0).toFixed(2);
      var ts = it.ts ? new Date(it.ts).toLocaleTimeString() : "";
      head.innerHTML =
        '<div style="display:flex;justify-content:space-between;gap:10px;">' +
          "<b>Раунд</b>" +
          '<span style="color:var(--hint)">' + ts + "</span>" +
        "</div>" +
        '<div style="margin-top:6px;">Выпало: <b>' + it.result + "</b> • Коэф: <b>" + coef + "</b></div>";
      feed.appendChild(head);

      var parts = it.participants || [];
      for (var j = 0; j < parts.length && j < 12; j++) {
        var p = parts[j];
        var row = document.createElement("div");
        row.className = "feed-item " + (p.win ? "win" : "lose");
        row.innerHTML =
          "<b>" + (p.isNpc ? "🤖 " : "🧑 ") + p.name + "</b> — " +
          p.side + " — ставка " + p.amount + " — " + (p.win ? "WIN" : "LOSE");
        feed.appendChild(row);
      }
    }
  }

  function refreshFeed() {
    api("feed", { limit: 20 }, function (err, data) {
      if (err) return;
      renderRoundFeed(data.items || []);
    });
  }

  function refreshBalance() {
    api("balance", {}, function (err, data) {
      if (err) return toast("Ошибка баланса: " + (err.message || err));
      toast("Баланс: " + data.balance);
    });
  }

  function play() {
    if (state.busy) return;
    state.busy = true;

    var playBtn = $("play");
    if (playBtn) playBtn.disabled = true;

    api("bet", { side: state.side, amount: state.amount }, function (err, data) {
      state.busy = false;
      if (playBtn) playBtn.disabled = false;

      if (err) return toast("Ошибка ставки: " + (err.message || err));

      var you = data.you || {};
      var coef = Number(data.coef || 0).toFixed(2);

      if (you.win) {
        toast("✅ WIN!\nВыпало: " + data.result + "\nКоэф: " + coef +
              "\nВыплата: " + you.payout + "\nБаланс: " + you.balance);
      } else {
        toast("❌ LOSE.\nВыпало: " + data.result + "\nКоэф: " + coef +
              "\nБаланс: " + you.balance);
      }

      refreshFeed();
    });
  }

  function onClick(el, fn) {
    if (!el) return;
    el.addEventListener("click", fn);
  }

  function wireUI() {
    try { if (tg && tg.ready) tg.ready(); } catch (e) {}
    try { if (tg && tg.expand) tg.expand(); } catch (e) {}

    setActiveSide(state.side);
    setAmount(state.amount);

    onClick($("btnOrel"), function () { setActiveSide("орел"); });
    onClick($("btnReshka"), function () { setActiveSide("решка"); });

    var chips = document.querySelectorAll(".chip");
    for (var i = 0; i < chips.length; i++) {
      (function (b) {
        onClick(b, function () { setAmount(b.getAttribute("data-amt")); });
      })(chips[i]);
    }

    var amountInput = $("amount");
    if (amountInput) {
      amountInput.addEventListener("input", function (e) { setAmount(e.target.value); });
    }

    onClick($("play"), play);
    onClick($("balance"), refreshBalance);
    onClick($("refreshFeed"), refreshFeed);

    refreshFeed();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireUI);
  } else {
    wireUI();
  }
})();