(function () {
  var KEY = "chehel-rooz-v1";
  var TOTAL = 40;
  var MONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];
  var WEEKDAYS = ["یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه"];
  var SUGGESTIONS = ["سوره واقعه", "سوره الرحمن", "دعای توسل", "دعای فرج", "نماز شب", "صلوات"];
  var BUILTINS = [
    { id: "mulk", title: "سوره ملک", kind: "quran", surah: 67 },
    { id: "ashura", title: "زیارت عاشورا", kind: "ashura" },
    { id: "yasin", title: "سوره یس", kind: "quran", surah: 36 }
  ];
  var FONT_STEPS = [1, 1.15, 1.3, 1.45, 1.6, 1.75];

  var state = loadState();
  var storageOk = true;
  var selectedDate = null;
  var focusId = null;
  var trToken = 0;
  var toastTimer = 0;
  var player = {
    audio: new Audio(),
    token: 0,
    itemId: null,
    index: -1,
    playing: false,
    cancel: null
  };

  function faNum(n) {
    return String(n).replace(/\d/g, function (d) { return "۰۱۲۳۴۵۶۷۸۹"[d]; });
  }

  function el(tag, attrs, kids) {
    var node = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (key) {
      var value = attrs[key];
      if (value == null || value === false) return;
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = value;
      else if (key.indexOf("on") === 0 && typeof value === "function") node.addEventListener(key.slice(2).toLowerCase(), value);
      else node.setAttribute(key, value === true ? "" : String(value));
    });
    (kids || []).forEach(function (child) {
      if (child == null || child === false) return;
      node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    });
    return node;
  }

  function isoLocal(date) {
    date = date || new Date();
    var m = String(date.getMonth() + 1).padStart(2, "0");
    var d = String(date.getDate()).padStart(2, "0");
    return date.getFullYear() + "-" + m + "-" + d;
  }

  function parseISO(iso) {
    var p = iso.split("-").map(Number);
    return new Date(p[0], p[1] - 1, p[2], 12, 0, 0, 0);
  }

  function dayDiff(from, to) {
    return Math.round((parseISO(to) - parseISO(from)) / 86400000);
  }

  function addDays(iso, n) {
    var date = parseISO(iso);
    date.setDate(date.getDate() + n);
    return isoLocal(date);
  }

  function formatJalali(iso, withWeekday) {
    var date = parseISO(iso);
    var j = window.jalaali.toJalaali(date.getFullYear(), date.getMonth() + 1, date.getDate());
    var core = faNum(j.jd) + " " + MONTHS[j.jm - 1] + " " + faNum(j.jy);
    return withWeekday ? WEEKDAYS[date.getDay()] + " " + core : core;
  }

  function fresh() {
    return {
      startDate: isoLocal(),
      name: "",
      reminderTime: "08:00",
      remindersOn: false,
      lastNotified: "",
      fontScale: 1.2,
      showTranslation: true,
      dark: false,
      ashuraShort: false,
      welcomed: false,
      counts: {},
      bookmark: {},
      items: BUILTINS.map(function (b) {
        return { id: b.id, title: b.title, kind: b.kind, surah: b.surah, builtin: true, done: {} };
      })
    };
  }

  function cleanDone(done) {
    var out = {};
    if (!done || typeof done !== "object") return out;
    Object.keys(done).forEach(function (key) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(key) && done[key]) out[key] = true;
    });
    return out;
  }

  function normalize(raw) {
    var base = fresh();
    var items = Array.isArray(raw.items) ? raw.items.filter(function (item) { return item && item.id; }) : [];
    BUILTINS.forEach(function (b) {
      if (!items.some(function (item) { return item.id === b.id; })) {
        items.unshift({ id: b.id, title: b.title, kind: b.kind, surah: b.surah, builtin: true, done: {} });
      }
    });
    items.forEach(function (item) {
      var builtin = BUILTINS.filter(function (b) { return b.id === item.id; })[0];
      item.title = String(item.title || (builtin ? builtin.title : "بدون نام")).trim().slice(0, 80);
      item.done = cleanDone(item.done);
      if (builtin) {
        item.builtin = true;
        item.kind = builtin.kind;
        item.surah = builtin.surah;
        delete item.text;
      } else {
        item.builtin = false;
        item.kind = "custom";
        item.text = String(item.text || "").slice(0, 20000);
        delete item.surah;
      }
    });
    var counts = {};
    if (raw.counts && typeof raw.counts === "object") {
      Object.keys(raw.counts).forEach(function (day) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !raw.counts[day]) return;
        var clean = {};
        ["laan", "salam", "laanShort", "salamShort"].forEach(function (key) {
          var n = Math.floor(Number(raw.counts[day][key]));
          if (n > 0) clean[key] = Math.min(100, n);
        });
        if (Object.keys(clean).length) counts[day] = clean;
      });
    }
    var bookmark = {};
    if (raw.bookmark && typeof raw.bookmark === "object") {
      Object.keys(raw.bookmark).forEach(function (key) {
        var n = Math.floor(Number(raw.bookmark[key]));
        if (n > 0) bookmark[key] = n;
      });
    }
    var scale = Number(raw.fontScale);
    if (!isFinite(scale)) scale = 1.2;
    scale = Math.min(1.75, Math.max(1, scale));
    return {
      startDate: /^\d{4}-\d{2}-\d{2}$/.test(raw.startDate) ? raw.startDate : base.startDate,
      name: String(raw.name || "").slice(0, 40),
      reminderTime: /^\d{2}:\d{2}$/.test(raw.reminderTime) ? raw.reminderTime : "08:00",
      remindersOn: !!raw.remindersOn,
      lastNotified: raw.lastNotified || "",
      fontScale: scale,
      showTranslation: raw.showTranslation !== false,
      dark: !!raw.dark,
      ashuraShort: !!raw.ashuraShort,
      welcomed: !!raw.welcomed,
      counts: counts,
      bookmark: bookmark,
      items: items
    };
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return fresh();
      return normalize(JSON.parse(raw));
    } catch (e) {
      return fresh();
    }
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      storageOk = true;
    } catch (e) {
      storageOk = false;
    }
  }

  function applyTheme() {
    document.documentElement.classList.toggle("dark", !!state.dark);
    document.documentElement.style.setProperty("--read-scale", String(state.fontScale || 1.2));
  }

  function periodDates() {
    var dates = [];
    for (var i = 0; i < TOTAL; i++) dates.push(addDays(state.startDate, i));
    return dates;
  }

  function phaseOf(iso) {
    var diff = dayDiff(state.startDate, iso);
    if (diff < 0) return { mode: "before", diff: diff };
    if (diff > TOTAL - 1) return { mode: "after", diff: diff };
    return { mode: "during", diff: diff, day: diff + 1 };
  }

  function perfect(date) {
    return state.items.length > 0 && state.items.every(function (item) { return item.done[date]; });
  }

  function perfectCount() {
    return periodDates().filter(perfect).length;
  }

  function countDone(item) {
    return periodDates().filter(function (date) { return item.done[date]; }).length;
  }

  function greeting() {
    var hour = new Date().getHours();
    var text = hour < 11 ? "صبح بخیر" : hour < 15 ? "روز بخیر" : hour < 19 ? "عصر بخیر" : "شب بخیر";
    if (state.name.trim()) text += "، " + state.name.trim();
    return text;
  }

  function accentClass(item) {
    if (item.id === "ashura") return "accent-maroon";
    if (item.id === "yasin") return "accent-teal";
    if (item.kind === "custom") return "accent-brass";
    return "accent-green";
  }

  function toast(message) {
    var node = document.getElementById("toast");
    node.textContent = message;
    node.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { node.hidden = true; }, 3200);
  }

  function ask(message, okLabel, cancelLabel) {
    return new Promise(function (resolve) {
      var modal = document.getElementById("modal");
      var ok = document.getElementById("modalOk");
      var cancel = document.getElementById("modalCancel");
      document.getElementById("modalText").textContent = message;
      ok.textContent = okLabel || "بله";
      cancel.textContent = cancelLabel || "انصراف";
      modal.hidden = false;
      function cleanup(value) {
        modal.hidden = true;
        ok.removeEventListener("click", onOk);
        cancel.removeEventListener("click", onCancel);
        modal.removeEventListener("click", onBackdrop);
        document.removeEventListener("keydown", onKey);
        resolve(value);
      }
      function onOk() { cleanup(true); }
      function onCancel() { cleanup(false); }
      function onBackdrop(e) { if (e.target === modal) cleanup(false); }
      function onKey(e) { if (e.key === "Escape") cleanup(false); }
      ok.addEventListener("click", onOk);
      cancel.addEventListener("click", onCancel);
      modal.addEventListener("click", onBackdrop);
      document.addEventListener("keydown", onKey);
      ok.focus();
    });
  }

  function toggleDate(id, date) {
    var item = state.items.filter(function (it) { return it.id === id; })[0];
    if (!item) return;
    var was = perfect(date);
    if (item.done[date]) delete item.done[date];
    else item.done[date] = true;
    save();
    if (!was && perfect(date) && date === isoLocal()) toast("خدا قبول کند.");
    rerender();
  }

  function toggleToday(id) {
    var today = isoLocal();
    if (phaseOf(today).mode !== "during") return;
    toggleDate(id, today);
  }

  function markAll(date, value) {
    state.items.forEach(function (item) {
      if (value) item.done[date] = true;
      else delete item.done[date];
    });
    save();
    if (value && date === isoLocal()) toast("خدا قبول کند.");
    rerender();
  }

  function go(hash) {
    if (location.hash === hash) renderAt(false);
    else location.hash = hash;
  }

  function parseRoute() {
    var parts = decodeURIComponent(location.hash || "#/").replace(/^#/, "").split("/").filter(Boolean);
    if (!parts.length) return { name: "home" };
    if (parts[0] === "read" && parts[1]) return { name: "read", id: parts[1] };
    if (parts[0] === "days") return { name: "days" };
    if (parts[0] === "settings") return { name: "settings" };
    if (parts[0] === "new") return { name: "edit", id: null };
    if (parts[0] === "edit" && parts[1]) return { name: "edit", id: parts[1] };
    return { name: "home" };
  }

  function navKey(name) {
    if (name === "days") return "days";
    if (name === "settings") return "settings";
    return "home";
  }

  function topbar() {
    return el("header", { class: "topbar" }, [
      el("div", { class: "brand" }, [el("span", { class: "mark", text: "۴۰" }), el("span", { text: "چهل‌روز" })]),
      el("div", { class: "today-label", text: formatJalali(isoLocal(), true) })
    ]);
  }

  function nav(name) {
    var active = navKey(name);
    function btn(hash, label, key) {
      return el("button", { type: "button", class: active === key ? "on" : "", onclick: function () { go(hash); } }, [label]);
    }
    return el("nav", { class: "nav" }, [
      btn("#/", "خانه", "home"),
      btn("#/days", "روزها", "days"),
      btn("#/settings", "تنظیمات", "settings")
    ]);
  }

  function viewHome() {
    var today = isoLocal();
    var phase = phaseOf(today);
    var end = addDays(state.startDate, TOTAL - 1);
    var doneDays = perfectCount();
    var pct = phase.mode === "before" ? 0 : phase.mode === "after" ? 100 : (phase.day / TOTAL) * 100;
    var dayLine = "هنوز شروع نشده";
    var sub = "روز اول، " + formatJalali(state.startDate, true);
    if (phase.mode === "during") {
      dayLine = "روز " + faNum(phase.day) + " از " + faNum(TOTAL);
      sub = formatJalali(today, true) + " · تا " + formatJalali(end, false);
    } else if (phase.mode === "after") {
      dayLine = "چهل روز تمام شد";
      sub = faNum(doneDays) + " روز را کامل خوانده‌اید";
    }
    var pending = phase.mode === "during" ? state.items.filter(function (item) { return !item.done[today]; }) : [];
    var yesterday = addDays(today, -1);
    var showYesterday = periodDates().indexOf(yesterday) !== -1 && !perfect(yesterday);

    return el("section", {}, [
      el("div", { class: "hero" }, [
        el("p", { class: "hero-kicker", text: greeting() }),
        el("h1", { class: "hero-day", text: dayLine }),
        el("p", { class: "hero-sub", text: sub }),
        el("div", { class: "bar" }, [el("span", { style: "width:" + pct + "%" })]),
        phase.mode !== "before" ? el("p", { class: "hero-sub", text: faNum(doneDays) + " روز کامل شده" }) : null,
        phase.mode === "during" && pending.length === 0 ? el("p", { class: "ok-line", text: "امروز تمام شد. خدا قبول کند." }) : null,
        phase.mode === "after" ? el("button", { type: "button", class: "ghost", text: "شروع دورهٔ تازه", onclick: newCycle }) : null
      ]),
      !storageOk ? el("p", { class: "hint-btn", text: "این مرورگر تیک‌ها را نگه نمی‌دارد. برنامه را با Chrome یا Edge باز کنید." }) : null,
      !state.welcomed ? el("div", { class: "welcome" }, [
        el("p", { text: "هر روز سورهٔ ملک، زیارت عاشورا و سورهٔ یس را بخوانید و دکمهٔ «امروز خواندم» را بزنید. برنامه می‌گوید امروز روز چندم است. اگر ذکر دیگری هم دارید، پایین صفحه اضافه کنید. برای زیارت عاشورا شمارندهٔ صد لعن و صد سلام هست." }),
        el("button", { type: "button", class: "primary wide", text: "باشه، شروع کنیم", onclick: function () { state.welcomed = true; save(); rerender(); } })
      ]) : null,
      showYesterday ? el("button", {
        type: "button",
        class: "hint-btn",
        text: "دیروز هنوز باز است. اگر خوانده‌اید، تیکش اینجاست.",
        onclick: function () { selectedDate = yesterday; go("#/days"); }
      }) : null,
      el("div", {}, state.items.map(itemCard)),
      el("button", { type: "button", class: "ghost wide", text: "اگر چیز دیگری هم می‌خوانید، اضافه کنید", onclick: function () { go("#/new"); } })
    ]);
  }

  function itemCard(item) {
    var today = isoLocal();
    var phase = phaseOf(today);
    var during = phase.mode === "during";
    var on = !!item.done[today];
    var status = !during ? "خارج از این چهل روز" : on ? "امروز خوانده شد" : "برای امروز مانده";
    return el("article", { class: "card " + accentClass(item) }, [
      el("div", { class: "card-head" }, [
        el("h2", { class: "card-title", text: item.title }),
        el("span", { class: "card-count", text: faNum(countDone(item)) + " از " + faNum(TOTAL) })
      ]),
      el("p", { class: "status", text: status }),
      el("div", { class: "actions" }, [
        during ? el("button", {
          type: "button",
          class: on ? "done" : "primary",
          onclick: function () { toggleToday(item.id); }
        }, [on ? "خوانده شد" : "امروز خواندم"]) : null,
        el("button", { type: "button", class: "ghost", text: "خواندن", onclick: function () { go("#/read/" + item.id); } })
      ])
    ]);
  }

function todayButton(item) {
  var today = isoLocal();
  var phase = phaseOf(today);
  if (phase.mode !== "during") return null;
  var on = !!item.done[today];
  return el("button", {
    type: "button",
    class: on ? "done" : "primary",
    onclick: function () { toggleToday(item.id); }
  }, [on ? "امروز خوانده شد" : "امروز خواندم"]);
}

  function viewRead(id) {
    var item = state.items.filter(function (it) { return it.id === id; })[0];
    if (!item) {
      return el("section", {}, [
        el("h1", { class: "page-title", text: "این مورد پیدا نشد" }),
        el("button", { type: "button", class: "primary", text: "برگشت به خانه", onclick: function () { go("#/"); } })
      ]);
    }
    var body;
    if (item.kind === "quran") body = quranView(item);
    else if (item.kind === "ashura") body = ashuraView();
    else body = customView(item);
    return el("section", {}, [
      el("div", { class: "toolbar" }, [
        todayButton(item),
        el("button", { type: "button", class: "ghost", text: "برگشت", onclick: function () { go("#/"); } }),
        el("button", { type: "button", class: "ghost", text: "بزرگ‌تر", onclick: function () { stepFont(1); } }),
        el("button", { type: "button", class: "ghost", text: "کوچک‌تر", onclick: function () { stepFont(-1); } }),
        item.kind === "quran" ? el("button", {
          type: "button",
          class: "ghost",
          text: state.showTranslation ? "پنهان کردن ترجمه" : "نمایش ترجمه",
          onclick: function () { state.showTranslation = !state.showTranslation; save(); rerender(); }
        }) : null,
        item.kind === "quran" ? el("button", {
          type: "button",
          id: "playBtn",
          class: "primary",
          text: player.playing && player.itemId === item.id ? "توقف صوت" : "پخش صوت",
          onclick: function () { onPlayClick(item); }
        }) : null,
        el("button", {
          type: "button",
          class: "ghost",
          text: state.dark ? "روز" : "شب",
          onclick: function () { state.dark = !state.dark; save(); applyTheme(); rerender(); }
        })
      ]),
      el("h1", { class: "page-title", text: item.title }),
      body
    ]);
  }

  function quranView(item) {
    var data = window.QURAN && window.QURAN[item.surah];
    if (!data) return el("p", { text: "متن این سوره پیدا نشد." });
    var bookmark = state.bookmark[item.id] || 0;
    return el("div", {}, [
      el("p", { class: "muted center", text: data.arabicName + " · " + faNum(data.ayahs.length) + " آیه" }),
      el("p", { class: "small center", id: "trStatus", text: state.showTranslation ? "ترجمه با اولین اتصال اینترنت می‌ماند روی همین رایانه." : "" }),
      bookmark > 0 ? el("button", {
        type: "button",
        class: "ghost",
        text: "ادامه از آیه " + faNum(data.ayahs[bookmark].n),
        onclick: function () {
          var node = document.querySelector('.ayah[data-i="' + bookmark + '"]');
          if (node) node.scrollIntoView({ block: "center", behavior: "smooth" });
        }
      }) : null,
      el("div", {}, data.ayahs.map(function (ayah, index) {
        return el("button", {
          type: "button",
          class: "ayah",
          "data-i": String(index),
          onclick: function () { playFrom(item, index); }
        }, [
          el("span", { class: "ayah-num", text: faNum(ayah.n) }),
          el("p", { class: "script", text: ayah.ar }),
          state.showTranslation ? el("p", { class: "tr", "data-tr": String(ayah.n), text: "…" }) : null
        ]);
      })),
      el("p", { class: "small center", text: "صوت: مشاری بن راشد العفاسی. با زدن هر آیه، خواندن از همان‌جا شروع می‌شود." })
    ]);
  }

  function ashuraView() {
    var chips = [
      ["salam", "سلام"],
      ["mosibat", "مصیبت"],
      ["laan", "صد لعن"],
      ["salam100", "صد سلام"],
      ["sajdah", "سجده"]
    ];
    return el("div", {}, [
      el("div", { class: "chips" }, chips.map(function (chip) {
        return el("button", {
          type: "button",
          class: "chip",
          onclick: function () {
            var node = document.getElementById("sec-" + chip[0]);
            if (node) node.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        }, [chip[1]]);
      })),
      el("div", { class: "segment" }, [
        el("button", { type: "button", class: state.ashuraShort ? "" : "on", onclick: function () { setShort(false); } }, ["صد بار کامل"]),
        el("button", { type: "button", class: state.ashuraShort ? "on" : "", onclick: function () { setShort(true); } }, ["یک بار و نود و نه بار کوتاه"])
      ]),
      el("p", { class: "small", text: state.ashuraShort
        ? "یک بار متن کامل را بخوانید و نود و نه بار جملهٔ کوتاه را بگویید. این شیوه در روایت برای کسی آمده که صد بار کامل برایش سخت است."
        : "هر بخش را به ترتیب بخوانید. روی لعن و سلام، هر بار که خواندید دکمهٔ شمارنده را بزنید."
      }),
      el("div", {}, window.ASHURA.sections.map(renderSection)),
      el("p", { class: "small", text: window.ASHURA.note })
    ]);
  }

  function renderSection(section) {
    var kids = [
      el("h2", { text: section.title }),
      el("p", { class: "muted", text: section.hint })
    ];
    if (section.counter) kids.push(counterBlock(section));
    else kids.push(el("p", { class: "script", text: section.arabic }));
    return el("section", { class: "card section" + (section.sajdah ? " sajdah" : ""), id: "sec-" + section.id }, kids);
  }

  function counterStorageKey(which) {
    return state.ashuraShort ? which + "Short" : which;
  }

  function counterMax() {
    return state.ashuraShort ? 99 : 100;
  }

  function getCount(which) {
    var bag = state.counts[isoLocal()] || {};
    return bag[counterStorageKey(which)] || 0;
  }

  function addCount(which, delta) {
    var max = counterMax();
    var current = getCount(which);
    if (delta > 0 && current >= max) {
      toast("شمارش این بخش تمام شده است.");
      return;
    }
    var next = Math.max(0, Math.min(max, current + delta));
    var day = isoLocal();
    var key = counterStorageKey(which);
    if (!state.counts[day]) state.counts[day] = {};
    if (next === 0) delete state.counts[day][key];
    else state.counts[day][key] = next;
    if (!Object.keys(state.counts[day]).length) delete state.counts[day];
    save();
    if (navigator.vibrate) navigator.vibrate(10);
    if (delta > 0 && next === max) toast(max === 100 ? "صد بار تمام شد." : "نود و نه بار تمام شد.");
    focusId = "plus-" + which;
    rerender();
  }

  async function resetCount(which) {
    var ok = await ask("شمارنده صفر شود؟");
    if (!ok) return;
    var day = isoLocal();
    var key = counterStorageKey(which);
    if (state.counts[day]) {
      delete state.counts[day][key];
      if (!Object.keys(state.counts[day]).length) delete state.counts[day];
    }
    save();
    rerender();
  }

  function counterBlock(section) {
    var count = getCount(section.counter);
    var max = counterMax();
    var done = count >= max;
    return el("div", {}, [
      el("p", { class: "script", text: section.arabic }),
      state.ashuraShort ? el("div", { class: "short-phrase" }, [
        el("p", { class: "small", text: "بعد از یک بار خواندن متن بالا، این جمله را نود و نه بار بگویید:" }),
        el("p", { class: "script", text: section.short })
      ]) : el("p", { class: "small center", text: "هر بار که متن بالا را خواندید، دکمه را بزنید." }),
      el("div", { class: "counter-card" + (done ? " full" : "") }, [
        el("div", { class: "counter-num", text: faNum(count) }),
        el("p", { class: "center", text: "از " + faNum(max) + " · مانده " + faNum(max - count) }),
        el("button", {
          type: "button",
          id: "plus-" + section.counter,
          class: "primary wide",
          text: done ? "تمام شد" : "یکی شمردم",
          onclick: function () { addCount(section.counter, 1); }
        }),
        el("div", { class: "actions" }, [
          el("button", { type: "button", class: "ghost", text: "یکی کم کن", onclick: function () { addCount(section.counter, -1); } }),
          el("button", { type: "button", class: "ghost", text: "از نو", onclick: function () { resetCount(section.counter); } })
        ])
      ])
    ]);
  }

  function setShort(value) {
    state.ashuraShort = value;
    save();
    rerender();
  }

  function customView(item) {
    if (!item.text) {
      return el("div", { class: "block" }, [
        el("p", { text: "برای این مورد متنی نوشته نشده. تیک روزانه‌اش روی صفحهٔ اول است." }),
        el("button", { type: "button", class: "primary", text: "نوشتن متن", onclick: function () { go("#/edit/" + item.id); } })
      ]);
    }
    return el("div", { class: "card" }, [
      el("p", { class: "custom-text", text: item.text }),
      el("button", { type: "button", class: "textbtn", text: "ویرایش متن", onclick: function () { go("#/edit/" + item.id); } })
    ]);
  }

  function chosenDate() {
    var dates = periodDates();
    if (selectedDate && dates.indexOf(selectedDate) !== -1) return selectedDate;
    var today = isoLocal();
    if (dates.indexOf(today) !== -1) return today;
    return dates[0];
  }

  function viewDays() {
    var dates = periodDates();
    var selected = chosenDate();
    var today = isoLocal();
    return el("section", {}, [
      el("h1", { class: "page-title", text: "چهل روز" }),
      el("p", { class: "muted", text: formatJalali(dates[0], false) + " تا " + formatJalali(dates[dates.length - 1], false) }),
      el("div", { class: "day-panel", id: "dayPanel" }, [
        el("h2", { text: "روز " + faNum(dates.indexOf(selected) + 1) + " · " + formatJalali(selected, true) }),
        selected > today ? el("p", { class: "small", text: "این روز هنوز نرسیده. اگر جلوتر خواندید، تیک بزنید." }) : null,
        el("div", { class: "chips" }, state.items.map(function (item) {
          var on = !!item.done[selected];
          return el("button", {
            type: "button",
            class: on ? "chip-toggle on" : "chip-toggle",
            onclick: function () { toggleDate(item.id, selected); }
          }, [on ? "✓ " + item.title : item.title]);
        })),
        el("div", { class: "actions" }, [
          el("button", { type: "button", class: "primary", text: "همه را خواندم", onclick: function () { markAll(selected, true); } }),
          el("button", { type: "button", class: "ghost", text: "پاک کردن این روز", onclick: function () { markAll(selected, false); } })
        ])
      ]),
      el("div", { class: "legend" }, [
        el("span", { class: "lg all", text: "همه" }),
        el("span", { class: "lg some", text: "بعضی" }),
        el("span", { class: "lg", text: "هنوز نه" })
      ]),
      el("div", { class: "grid" }, dates.map(function (date, index) { return dayCell(date, index, today, selected); }))
    ]);
  }

  function dayCell(date, index, today, selected) {
    var doneCount = state.items.filter(function (item) { return item.done[date]; }).length;
    var total = state.items.length;
    var cls = "cell";
    if (total && doneCount === total) cls += " all";
    else if (doneCount > 0) cls += " some";
    if (date === today) cls += " today";
    if (date === selected) cls += " selected";
    if (date > today) cls += " future";
    var marks = total > 6
      ? el("span", { class: "cell-tag", text: faNum(doneCount) + "/" + faNum(total) })
      : el("span", { class: "dots" }, state.items.map(function (item) {
          return el("i", { class: item.done[date] ? "dot on" : "dot" });
        }));
    return el("button", {
      type: "button",
      class: cls,
      onclick: function () { selectedDate = date; rerender(); }
    }, [
      el("span", { class: "cell-num", text: faNum(index + 1) }),
      date === today ? el("span", { class: "cell-tag", text: "امروز" }) : null,
      marks
    ]);
  }

  function viewSettings() {
    var end = addDays(state.startDate, TOTAL - 1);
    return el("section", {}, [
      el("h1", { class: "page-title", text: "تنظیمات" }),
      el("div", { class: "block" }, [
        el("h2", { text: "نام" }),
        el("input", {
          type: "text",
          maxlength: "40",
          value: state.name,
          placeholder: "اگر دوست دارید، اینجا نوشته شود",
          oninput: function (e) { state.name = e.target.value.slice(0, 40); save(); }
        })
      ]),
      el("div", { class: "block" }, [
        el("h2", { text: "شروع چهل روز" }),
        el("p", { class: "muted", text: "از " + formatJalali(state.startDate, true) + " تا " + formatJalali(end, false) }),
        el("p", { class: "small", text: "تیک‌ها روی تاریخ خودشان می‌مانند." }),
        el("input", {
          type: "date",
          value: state.startDate,
          onchange: function (e) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) return;
            state.startDate = e.target.value;
            save();
            rerender();
          }
        }),
        el("div", { class: "actions" }, [
          el("button", { type: "button", class: "ghost", text: "شروع از امروز", onclick: function () { setStart(0); } }),
          el("button", { type: "button", class: "ghost", text: "شروع از فردا", onclick: function () { setStart(1); } })
        ])
      ]),
      el("div", { class: "block" }, [
        el("h2", { text: "یادآوری" }),
        el("label", { class: "label", text: "ساعت" }),
        el("input", {
          type: "time",
          value: state.reminderTime,
          onchange: function (e) { state.reminderTime = e.target.value || "08:00"; save(); }
        }),
        el("p", { class: "small", text: "اگر این صفحه باز باشد و شما جای دیگری از رایانه کار کنید، سر همین ساعت یک پیام می‌آید." }),
        el("div", { class: "actions" }, [
          el("button", { type: "button", class: state.remindersOn ? "done" : "primary", text: state.remindersOn ? "یادآوری روشن است" : "روشن کردن یادآوری", onclick: enableReminder }),
          state.remindersOn ? el("button", { type: "button", class: "ghost", text: "خاموش", onclick: function () { state.remindersOn = false; save(); rerender(); } }) : null
        ]),
        el("p", { class: "small", text: "برای اینکه رایانه هر روز خودش برنامه را باز کند، در همین پوشه فایل «یادآوری» را یک بار باز کنید و ساعت را بنویسید. خاموش کردنش با فایل «خاموش کردن یادآوری» است." })
      ]),
      el("div", { class: "block" }, [
        el("h2", { text: "اندازهٔ نوشتهٔ قرآن و زیارت" }),
        el("p", { class: "script", text: "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ" }),
        el("div", { class: "actions" }, [
          el("button", { type: "button", class: "ghost", text: "بزرگ‌تر", onclick: function () { stepFont(1); } }),
          el("button", { type: "button", class: "ghost", text: "کوچک‌تر", onclick: function () { stepFont(-1); } })
        ]),
        el("div", { class: "actions" }, [
          el("button", {
            type: "button",
            class: state.showTranslation ? "done" : "ghost",
            text: state.showTranslation ? "ترجمه روشن است" : "ترجمه خاموش است",
            onclick: function () { state.showTranslation = !state.showTranslation; save(); rerender(); }
          }),
          el("button", {
            type: "button",
            class: state.dark ? "done" : "ghost",
            text: state.dark ? "حالت شب" : "حالت روز",
            onclick: function () { state.dark = !state.dark; save(); applyTheme(); rerender(); }
          })
        ])
      ]),
      el("div", { class: "block" }, [
        el("h2", { text: "موردها" }),
        el("div", {}, state.items.map(function (item, index) {
          return el("div", { class: "item-row" }, [
            el("span", { class: "name", text: item.title }),
            el("button", { type: "button", class: "icon-btn", text: "بالا", disabled: index === 0, onclick: function () { moveItem(item.id, -1); } }),
            el("button", { type: "button", class: "icon-btn", text: "پایین", disabled: index === state.items.length - 1, onclick: function () { moveItem(item.id, 1); } }),
            el("button", { type: "button", class: "ghost", text: "ویرایش", onclick: function () { go("#/edit/" + item.id); } })
          ]);
        })),
        el("button", { type: "button", class: "primary wide", text: "افزودن مورد جدید", onclick: function () { go("#/new"); } })
      ]),
      el("div", { class: "block" }, [
        el("h2", { text: "نگه‌داشتن تیک‌ها" }),
        el("p", { class: "small", text: "تیک‌ها روی همین رایانه و همین مرورگر می‌مانند. یک پروندهٔ پشتیبان هم بگیرید تا اگر صفحه پاک شد، برگردد." }),
        el("div", { class: "actions" }, [
          el("button", { type: "button", class: "ghost", text: "ذخیرهٔ پشتیبان", onclick: exportBackup }),
          el("button", { type: "button", class: "ghost", text: "بازگرداندن پشتیبان", onclick: function () { document.getElementById("importFile").click(); } })
        ]),
        el("input", { type: "file", id: "importFile", accept: "application/json", hidden: true, onchange: onImport }),
        el("button", { type: "button", class: "danger", text: "شروع دورهٔ تازه", onclick: newCycle })
      ])
    ]);
  }

  function setStart(offset) {
    var date = new Date();
    date.setDate(date.getDate() + offset);
    state.startDate = isoLocal(date);
    save();
    rerender();
  }

  function stepFont(delta) {
    var index = 0;
    var best = 99;
    FONT_STEPS.forEach(function (step, i) {
      var dist = Math.abs(step - state.fontScale);
      if (dist < best) { best = dist; index = i; }
    });
    var next = Math.min(FONT_STEPS.length - 1, Math.max(0, index + delta));
    state.fontScale = FONT_STEPS[next];
    save();
    applyTheme();
    rerender();
  }

  function moveItem(id, dir) {
    var index = state.items.findIndex(function (item) { return item.id === id; });
    var target = index + dir;
    if (index < 0 || target < 0 || target >= state.items.length) return;
    var item = state.items.splice(index, 1)[0];
    state.items.splice(target, 0, item);
    save();
    rerender();
  }

  async function enableReminder() {
    state.remindersOn = true;
    save();
    if (!("Notification" in window)) {
      toast("این مرورگر پیام جدا نشان نمی‌دهد. خودِ صفحه یادآوری است.");
      rerender();
      return;
    }
    try {
      var perm = await Notification.requestPermission();
      if (perm !== "granted") toast("اجازه داده نشد. هر بار که برنامه را باز کنید، روز را می‌بینید.");
    } catch (e) {
      toast("اجازهٔ پیام داده نشد.");
    }
    rerender();
  }

  function maybeNotify() {
    if (!state.remindersOn || !("Notification" in window) || Notification.permission !== "granted") return;
    if (!document.hidden) return;
    var now = new Date();
    var parts = (state.reminderTime || "08:00").split(":");
    var hh = Number(parts[0]);
    var mm = Number(parts[1]);
    var passed = now.getHours() > hh || (now.getHours() === hh && now.getMinutes() >= mm);
    if (!passed) return;
    var today = isoLocal(now);
    if (state.lastNotified === today) return;
    var phase = phaseOf(today);
    if (phase.mode !== "during") return;
    var pending = state.items.filter(function (item) { return !item.done[today]; });
    if (!pending.length) return;
    state.lastNotified = today;
    save();
    var note = new Notification("یادآوری چهل‌روز", {
      body: "امروز روز " + faNum(phase.day) + " است. مانده: " + pending.map(function (item) { return item.title; }).join("، ")
    });
    note.onclick = function () { window.focus(); note.close(); };
  }

  function exportBackup() {
    var blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    var link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "chehel-rooz-backup.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 1500);
    toast("پروندهٔ پشتیبان ذخیره شد.");
  }

  function onImport(e) {
    var file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    var reader = new FileReader();
    reader.onload = async function () {
      try {
        var data = JSON.parse(String(reader.result || ""));
        if (!data || !Array.isArray(data.items)) throw new Error("bad");
        var ok = await ask("تیک‌های الان با این پرونده عوض شود؟");
        if (!ok) return;
        state = normalize(data);
        save();
        applyTheme();
        toast("بازگردانی شد.");
        renderAt(false);
      } catch (err) {
        toast("این پرونده خوانده نشد.");
      }
    };
    reader.readAsText(file);
  }

  async function newCycle() {
    var ok = await ask("تیک‌های این دوره پاک شود و از امروز دورهٔ تازه شروع شود؟");
    if (!ok) return;
    state.startDate = isoLocal();
    state.counts = {};
    state.bookmark = {};
    state.items.forEach(function (item) { item.done = {}; });
    save();
    toast("دورهٔ تازه از امروز شروع شد.");
    go("#/");
  }

  function viewEdit(id) {
    var item = id ? state.items.filter(function (it) { return it.id === id; })[0] : null;
    if (id && !item) return el("p", { text: "این مورد پیدا نشد." });
    var isNew = !item;
    var builtin = !!(item && item.builtin);
    return el("form", { onsubmit: function (e) { e.preventDefault(); saveEdit(id); } }, [
      el("h1", { class: "page-title", text: isNew ? "افزودن" : "ویرایش" }),
      el("label", { class: "label", text: "نام" }),
      el("input", { id: "fTitle", type: "text", maxlength: "80", value: item ? item.title : "", required: true }),
      isNew ? el("div", { class: "suggest" }, SUGGESTIONS.map(function (name) {
        return el("button", { type: "button", class: "chip", onclick: function () {
          document.getElementById("fTitle").value = name;
        } }, [name]);
      })) : null,
      builtin ? el("p", { class: "muted", text: "متن این مورد داخل برنامه هست." }) : el("label", { class: "label", text: "متن، اگر دوست دارید همین‌جا بخوانید" }),
      builtin ? null : el("textarea", { id: "fText", maxlength: "20000", placeholder: "دعا یا ذکر را اینجا بگذارید. اگر خالی بماند، فقط تیک روزانه می‌ماند." }, [item && item.text ? item.text : ""]),
      el("div", { class: "actions" }, [
        el("button", { type: "submit", class: "primary", text: "ذخیره" }),
        el("button", { type: "button", class: "ghost", text: "انصراف", onclick: function () { go("#/"); } })
      ]),
      !isNew && !builtin ? el("button", { type: "button", class: "danger", text: "حذف این مورد", onclick: function () { removeItem(item.id); } }) : null
    ]);
  }

  function saveEdit(id) {
    var title = document.getElementById("fTitle").value.trim();
    if (!title) { toast("نام را بنویسید."); return; }
    var textNode = document.getElementById("fText");
    var text = textNode ? textNode.value : "";
    if (!id) {
      state.items.push({
        id: "c" + Date.now(),
        title: title.slice(0, 80),
        kind: "custom",
        builtin: false,
        text: text.slice(0, 20000),
        done: {}
      });
      save();
      toast("اضافه شد.");
      go("#/");
      return;
    }
    var item = state.items.filter(function (it) { return it.id === id; })[0];
    if (!item) return;
    item.title = title.slice(0, 80);
    if (!item.builtin) item.text = text.slice(0, 20000);
    save();
    toast("ذخیره شد.");
    go("#/");
  }

  async function removeItem(id) {
    var ok = await ask("این مورد و تیک‌هایش حذف شود؟");
    if (!ok) return;
    state.items = state.items.filter(function (item) { return item.id !== id; });
    save();
    go("#/");
  }

  function haltAudio() {
    player.token++;
    player.playing = false;
    player.itemId = null;
    player.index = -1;
    if (player.cancel) {
      var cancel = player.cancel;
      player.cancel = null;
      cancel();
    }
    player.audio.pause();
  }

  function playOne(url, token) {
    return new Promise(function (resolve) {
      var audio = player.audio;
      var settled = false;
      function finish(result) {
        if (settled) return;
        settled = true;
        audio.removeEventListener("ended", onEnd);
        audio.removeEventListener("error", onErr);
        if (player.cancel === cancel) player.cancel = null;
        resolve(result);
      }
      function cancel() { finish("cancelled"); }
      function onEnd() { finish(token === player.token ? "ok" : "cancelled"); }
      function onErr() { finish(token === player.token ? "error" : "cancelled"); }
      player.cancel = cancel;
      audio.addEventListener("ended", onEnd);
      audio.addEventListener("error", onErr);
      audio.src = url;
      var started = audio.play();
      if (started && started.then) started.then(function () {}, function () { finish(token === player.token ? "error" : "cancelled"); });
    });
  }

  async function playFrom(item, index) {
    var data = window.QURAN && window.QURAN[item.surah];
    if (!data) { toast("صوت این سوره آماده نیست."); return; }
    haltAudio();
    var token = ++player.token;
    player.itemId = item.id;
    player.playing = true;
    var btn = document.getElementById("playBtn");
    if (btn) btn.textContent = "توقف صوت";
    for (var i = index; i < data.ayahs.length; i++) {
      if (token !== player.token) return;
      player.index = i;
      if (!state.bookmark) state.bookmark = {};
      state.bookmark[item.id] = i;
      save();
      highlightAyah(i);
      var result;
      try {
        result = await playOne("https://cdn.islamic.network/quran/audio/128/ar.alafasy/" + data.ayahs[i].g + ".mp3", token);
      } catch (e) {
        result = "error";
      }
      if (token !== player.token || result === "cancelled") return;
      if (result !== "ok") {
        player.playing = false;
        var failed = document.getElementById("playBtn");
        if (failed) failed.textContent = "پخش صوت";
        toast("صوت پخش نشد. متن را می‌شود بدون صوت خواند.");
        return;
      }
    }
    if (token === player.token) {
      player.playing = false;
      var doneBtn = document.getElementById("playBtn");
      if (doneBtn) doneBtn.textContent = "پخش صوت";
      document.querySelectorAll(".ayah.playing").forEach(function (node) { node.classList.remove("playing"); });
    }
  }

  function onPlayClick(item) {
    if (player.playing && player.itemId === item.id) {
      haltAudio();
      var btn = document.getElementById("playBtn");
      if (btn) btn.textContent = "ادامهٔ صوت";
      player.itemId = item.id;
      return;
    }
    var start = player.itemId === item.id && player.index >= 0 ? player.index : (state.bookmark[item.id] || 0);
    playFrom(item, start);
  }

  function highlightAyah(index) {
    document.querySelectorAll(".ayah").forEach(function (node) {
      node.classList.toggle("playing", Number(node.getAttribute("data-i")) === index);
    });
    var current = document.querySelector(".ayah.playing");
    if (current) current.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  function hydrateTranslation(item, token) {
    if (!state.showTranslation || item.kind !== "quran") return;
    ensureTranslation(item.surah).then(function (map) {
      if (token !== trToken) return;
      if (parseRoute().id !== item.id) return;
      document.querySelectorAll("[data-tr]").forEach(function (node) {
        node.textContent = map[node.getAttribute("data-tr")] || "";
      });
      var status = document.getElementById("trStatus");
      if (status) status.textContent = "ترجمهٔ محمدمهدی فولادوند";
    }).catch(function () {
      if (token !== trToken) return;
      var status = document.getElementById("trStatus");
      if (status) status.textContent = "ترجمه الان دریافت نشد. متن عربی آماده است.";
    });
  }

  function ensureTranslation(surah) {
    var memKey = "map" + surah;
    if (ensureTranslation[memKey]) return Promise.resolve(ensureTranslation[memKey]);
    var storageKey = "chehel-tr-" + surah;
    try {
      var saved = localStorage.getItem(storageKey);
      if (saved) {
        ensureTranslation[memKey] = JSON.parse(saved);
        return Promise.resolve(ensureTranslation[memKey]);
      }
    } catch (e) {}
    return fetch("https://api.alquran.cloud/v1/surah/" + surah + "/fa.fooladvand").then(function (res) {
      if (!res.ok) throw new Error("bad");
      return res.json();
    }).then(function (json) {
      var map = {};
      (json.data.ayahs || []).forEach(function (ayah) { map[ayah.numberInSurah] = ayah.text; });
      ensureTranslation[memKey] = map;
      try { localStorage.setItem(storageKey, JSON.stringify(map)); } catch (e) {}
      return map;
    });
  }

  function updateTitle() {
    var today = isoLocal();
    var phase = phaseOf(today);
    if (phase.mode === "during") {
      var left = state.items.filter(function (item) { return !item.done[today]; }).length;
      document.title = left ? "روز " + faNum(phase.day) + " — مانده " + faNum(left) : "روز " + faNum(phase.day) + " تمام شد";
    } else document.title = "چهل‌روز";
  }

  function renderAt(keep) {
    var route = parseRoute();
    var savedY = window.scrollY;
    var sameRead = route.name === "read" && player.itemId && route.id === player.itemId && player.playing;
    if (!(route.name === "read" && player.itemId && route.id === player.itemId)) haltAudio();
    applyTheme();
    updateTitle();
    var body;
    var item = null;
    if (route.name === "home") body = viewHome();
    else if (route.name === "days") body = viewDays();
    else if (route.name === "settings") body = viewSettings();
    else if (route.name === "edit") body = viewEdit(route.id);
    else {
      item = state.items.filter(function (it) { return it.id === route.id; })[0] || null;
      body = viewRead(route.id);
    }
    var parts = [topbar(), el("main", { class: "wrap" }, [body])];
    parts.push(nav(route.name));
    document.getElementById("app").replaceChildren.apply(document.getElementById("app"), parts);
    if (keep) window.scrollTo(0, savedY);
    else window.scrollTo(0, 0);
    if (focusId) {
      var target = document.getElementById(focusId);
      focusId = null;
      if (target) target.focus({ preventScroll: true });
    }
    if (sameRead) requestAnimationFrame(function () { highlightAyah(player.index); });
    if (route.name === "read" && item && item.kind === "quran") hydrateTranslation(item, ++trToken);
  }

  function rerender() { renderAt(true); }

  applyTheme();
  window.addEventListener("hashchange", function () { renderAt(false); });
  window.addEventListener("visibilitychange", maybeNotify);
  setInterval(maybeNotify, 20000);
  if (!location.hash) location.hash = "#/";
  else renderAt(false);
})();
