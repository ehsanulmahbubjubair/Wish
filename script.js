/* =========================================================
   Wish — Interaction & Animation Logic (Vanilla JS)
   Personalized, shareable Birthday Surprise Creator.

   Modules (single responsibility):
     WishData    — encode/decode wish data in the URL
     Starfield   — ambient glowing stars + drifting particles
     Creator     — form validation + shareable link + copy/share
     Journey     — recipient step machine (envelope→letter→cake→finale)
     CakeCut     — pointer-based (mouse + touch) cake cutting
     Fireworks   — grand-finale canvas animation
     Sound       — Web Audio celebratory fanfare
   ========================================================= */

"use strict";

/* ---------- Configuration (occasion content) ---------- */
const CONFIG = {
  occasion: "birthday",
  keys: { to: "to", num: "num", from: "from", msg: "msg" },
  starfield: { starCount: 90, particleCount: 40 },
  fireworks: { durationMs: 5200, colors: ["#ff6ec7", "#b98cff", "#ffa6dc", "#d9c2ff", "#fff2a8"] },
  cake: { cutThreshold: 55 },
};

/* Respect user motion preferences everywhere. */
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- Small DOM helpers ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const announce = (msg) => {
  const region = $("#liveRegion");
  if (region) region.textContent = msg;
};

/* =========================================================
   WishData — store/retrieve wish info in the URL
   Trade-off: data is visible in the URL (not private, not
   tamper-proof). Kept in one module so a backend could later
   replace it with short link IDs without touching the app.
   ========================================================= */
const WishData = {
  encode(data) {
    const params = new URLSearchParams();
    if (data.to) params.set(CONFIG.keys.to, data.to);
    if (data.num) params.set(CONFIG.keys.num, data.num);
    if (data.from) params.set(CONFIG.keys.from, data.from);
    if (data.msg) params.set(CONFIG.keys.msg, data.msg);
    return params.toString();
  },

  buildLink(data) {
    // Absolute link built from the live location so it works after
    // deployment (GitHub Pages / Netlify / Vercel), not just localhost.
    const base = window.location.origin + window.location.pathname;
    const qs = this.encode(data);
    return qs ? `${base}?${qs}` : base;
  },

  decode(search = window.location.search) {
    const params = new URLSearchParams(search);
    return {
      to: (params.get(CONFIG.keys.to) || "").trim(),
      num: (params.get(CONFIG.keys.num) || "").trim(),
      from: (params.get(CONFIG.keys.from) || "").trim(),
      msg: (params.get(CONFIG.keys.msg) || "").trim(),
    };
  },

  /* Recipient mode only if the link actually carries wish data. */
  hasData(search = window.location.search) {
    const d = this.decode(search);
    return Boolean(d.to || d.num || d.from || d.msg);
  },
};

/* =========================================================
   Starfield — glowing stars + drifting particles (canvas)
   ========================================================= */
function initStarfield() {
  const canvas = $("#backdropCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  let width = 0;
  let height = 0;
  let dpr = 1;
  const stars = [];
  const particles = [];

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function build() {
    stars.length = 0;
    particles.length = 0;
    const starCount = Math.round((CONFIG.starfield.starCount * Math.min(width, 1400)) / 1400);
    for (let i = 0; i < starCount; i++) {
      stars.push({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: Math.random() * 1.4 + 0.3,
        baseAlpha: Math.random() * 0.5 + 0.25,
        twinkleSpeed: Math.random() * 0.02 + 0.005,
        phase: Math.random() * Math.PI * 2,
        hue: Math.random() > 0.5 ? "255, 210, 240" : "200, 180, 255",
      });
    }
    for (let i = 0; i < CONFIG.starfield.particleCount; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: Math.random() * 2.2 + 0.6,
        vy: -(Math.random() * 0.25 + 0.05),
        vx: (Math.random() - 0.5) * 0.12,
        alpha: Math.random() * 0.4 + 0.15,
      });
    }
  }

  function draw(t) {
    ctx.clearRect(0, 0, width, height);
    for (const s of stars) {
      const alpha = prefersReducedMotion
        ? s.baseAlpha
        : s.baseAlpha + Math.sin(t * s.twinkleSpeed + s.phase) * 0.25;
      const a = Math.max(0, Math.min(1, alpha));
      ctx.beginPath();
      ctx.fillStyle = `rgba(${s.hue}, ${a})`;
      ctx.shadowColor = `rgba(${s.hue}, ${a})`;
      ctx.shadowBlur = 8;
      ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    for (const p of particles) {
      if (!prefersReducedMotion) {
        p.y += p.vy;
        p.x += p.vx;
        if (p.y < -10) {
          p.y = height + 10;
          p.x = Math.random() * width;
        }
        if (p.x < -10) p.x = width + 10;
        if (p.x > width + 10) p.x = -10;
      }
      ctx.beginPath();
      ctx.fillStyle = `rgba(217, 194, 255, ${p.alpha})`;
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    requestAnimationFrame(draw);
  }

  window.addEventListener("resize", () => {
    resize();
    build();
  });
  resize();
  build();
  requestAnimationFrame(draw);
}

/* =========================================================
   Creator — form handling, validation, shareable link
   ========================================================= */
function initCreator() {
  const form = $("#wishForm");
  const sharePanel = $("#sharePanel");
  const shareLink = $("#shareLink");
  if (!form) return;

  const fields = {
    to: { input: $("#recipientName"), error: $("#recipientNameError"), label: "Recipient's name" },
    num: { input: $("#birthdayNumber"), error: $("#birthdayNumberError"), label: "Birthday number" },
    from: { input: $("#senderName"), error: $("#senderNameError"), label: "Your name" },
    msg: { input: $("#message"), error: $("#messageError"), label: "Your message" },
  };

  function setError(key, message) {
    const f = fields[key];
    if (!f) return;
    f.error.textContent = message || "";
    f.input.classList.toggle("is-invalid", Boolean(message));
    f.input.setAttribute("aria-invalid", message ? "true" : "false");
  }

  function clearErrors() {
    Object.keys(fields).forEach((k) => setError(k, ""));
  }

  function validate(data) {
    clearErrors();
    let firstInvalid = null;
    const required = ["to", "num", "from", "msg"];
    for (const key of required) {
      if (!data[key]) {
        setError(key, `${fields[key].label} is required.`);
        if (!firstInvalid) firstInvalid = fields[key].input;
      }
    }
    // Basic sanity limit so generated URLs stay reasonable.
    if (data.msg && data.msg.length > 1000) {
      setError("msg", "Please keep the message under 1000 characters.");
      if (!firstInvalid) firstInvalid = fields.msg.input;
    }
    if (firstInvalid) {
      firstInvalid.focus();
      return false;
    }
    return true;
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = {
      to: fields.to.input.value.trim(),
      num: fields.num.input.value.trim(),
      from: fields.from.value || fields.from.input.value.trim(),
      msg: fields.msg.input.value.trim(),
    };
    data.from = fields.from.input.value.trim();

    if (!validate(data)) {
      announce("Please complete the required fields.");
      return;
    }

    const link = WishData.buildLink(data);
    shareLink.value = link;
    sharePanel.hidden = false;
    announce("Your shareable wish link is ready.");

    // Native share where available (mostly mobile), else Copy is primary.
    const nativeBtn = $("#nativeShareBtn");
    if (navigator.share) {
      nativeBtn.hidden = false;
      nativeBtn.onclick = async () => {
        try {
          await navigator.share({
            title: "A birthday surprise for you!",
            text: `${data.from} made you a birthday surprise 🎉`,
            url: link,
          });
        } catch (err) {
          /* user dismissed the share sheet — ignore */
        }
      };
    }

    sharePanel.scrollIntoView &&
      sharePanel.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "nearest" });
  });

  // Clear a field's error as the user corrects it.
  Object.values(fields).forEach((f) => {
    f.input.addEventListener("input", () => {
      if (f.input.classList.contains("is-invalid") && f.input.value.trim()) {
        setError(Object.keys(fields).find((k) => fields[k] === f), "");
      }
    });
  });

  // Copy link (with a graceful fallback for non-secure contexts).
  $("#copyBtn").addEventListener("click", async () => {
    const value = shareLink.value;
    let ok = false;
    try {
      await navigator.clipboard.writeText(value);
      ok = true;
    } catch (err) {
      shareLink.select();
      ok = document.execCommand && document.execCommand("copy");
    }
    announce(ok ? "Link copied to clipboard." : "Copy failed — please copy the link manually.");
    const btn = $("#copyBtn");
    const original = btn.textContent;
    btn.textContent = ok ? "Copied!" : "Press Ctrl+C";
    setTimeout(() => (btn.textContent = original), 1800);
  });

  // Open the generated link in a new tab to preview the recipient experience.
  $("#previewBtn").addEventListener("click", () => {
    window.open(shareLink.value, "_blank", "noopener");
  });

  // Reset back to a blank form for creating another wish.
  $("#resetBtn").addEventListener("click", () => {
    form.reset();
    clearErrors();
    sharePanel.hidden = true;
    shareLink.value = "";
    fields.to.input.focus();
  });
}

/* =========================================================
   Journey — recipient step machine (envelope → letter → cake → finale)
   ========================================================= */
function initJourney() {
  const views = {
    creator: $("#creatorView"),
    recipient: $("#recipientView"),
  };
  const steps = {
    envelope: $("#envelopeStep"),
    letter: $("#letterStep"),
    cake: $("#cakeStep"),
    finale: $("#finaleStep"),
  };

  function showStep(name) {
    Object.entries(steps).forEach(([key, el]) => {
      if (!el) return;
      const active = key === name;
      el.hidden = !active;
      el.classList.toggle("is-active", active);
    });
  }

  function enterRecipientMode(data) {
    views.creator.hidden = true;
    views.creator.classList.remove("is-active");
    views.recipient.hidden = false;
    views.recipient.classList.add("is-active");

    populateLetter(data);
    resetJourney();
    showStep("envelope");
    $("#envelopeBtn").focus({ preventScroll: true });
  }

  function resetJourney() {
    const cake = $("#cake");
    if (cake) {
      cake.classList.remove("is-cut", "is-cutting", "is-dragging");
    }
    // Reset the envelope so a replay can open it again.
    const env = $("#envelopeBtn");
    if (env) {
      env.classList.remove("is-open");
      env.setAttribute("aria-expanded", "false");
    }
    showStep("envelope");
  }

  function populateLetter(data) {
    const to = data.to || "friend";
    const num = data.num ? data.num : "";
    const from = data.from || "Someone special";

    $("#letterSalutation").textContent = `Dear ${to},`;
    $("#letterHeading").textContent = num
      ? `Happy ${num} Birthday!`
      : "Happy Birthday!";
    $("#letterMessage").textContent =
      data.msg || "Wishing you a wonderful day filled with love and joy.";
    $("#letterSignature").textContent = `— ${from}`;

    // Finale personalization
    $("#finaleHeading").textContent = num
      ? `Happy ${num} Birthday, ${to}! 🎉`
      : `Happy Birthday, ${to}! 🎉`;
    $("#finaleSubtitle").textContent = from
      ? `With love from ${from}.`
      : "Wishing you the best day ever.";
  }

  /* --- Wiring --- */
  // Envelope opens -> letter
  $("#envelopeBtn").addEventListener("click", () => {
    const env = $("#envelopeBtn");
    if (env.classList.contains("is-open")) return;
    env.classList.add("is-open");
    env.setAttribute("aria-expanded", "true");
    announce("Your letter is ready to read.");
    const delay = prefersReducedMotion ? 150 : 1000;
    window.setTimeout(() => {
      showStep("letter");
      $("#toCakeBtn").focus({ preventScroll: true });
    }, delay);
  });

  // Letter -> cake
  $("#toCakeBtn").addEventListener("click", () => {
    showStep("cake");
    $("#cake").focus({ preventScroll: true });
  });

  // Replay -> back to envelope
  $("#replayBtn").addEventListener("click", () => {
    resetJourney();
    showStep("envelope");
    $("#envelopeBtn").focus({ preventScroll: true });
  });

  return { enterRecipientMode, showStep };
}

/* =========================================================
   CakeCut — pointer-based cutting (mouse + touch, one code path)
   A downward drag across the cake triggers the cut. A visible
   knife follows the pointer. Keyboard (Enter/Space) and the
   fallback button also cut, for accessibility.
   ========================================================= */
function initCakeCut(onCut) {
  const cake = $("#cake");
  if (!cake) return;

  let dragging = false;
  let startY = 0;
  let startX = 0;
  let cutDone = false;

  function begin(x, y) {
    if (cutDone) return;
    dragging = true;
    startY = y;
    startX = x;
    cake.classList.add("is-dragging");
  }

  function move(x, y) {
    if (!dragging) return;
    const dy = y - startY;
    const dx = x - startX;
    // Follow pointer with the knife (vertical position only).
    const knife = $("#cakeKnife");
    if (knife) {
      knife.style.transform = `translateY(${Math.max(0, dy)}px) scaleY(${Math.min(
        1.4,
        0.6 + Math.abs(dy) / 120
      )})`;
    }
    // Cut requires a clear downward swipe.
    if (dy > CONFIG.cake.cutThreshold && Math.abs(dx) < Math.abs(dy)) {
      dragging = false;
      cake.classList.remove("is-dragging");
      onCut();
    }
  }

  function end() {
    if (!dragging) return;
    dragging = false;
    cake.classList.remove("is-dragging");
  }

  // Pointer Events unify mouse, touch, and pen.
  cake.addEventListener("pointerdown", (e) => {
    if (cutDone) return;
    cake.setPointerCapture && cake.setPointerCapture(e.pointerId);
    begin(e.clientX, e.clientY);
  });
  cake.addEventListener("pointermove", (e) => {
    if (dragging) move(e.clientX, e.clientY);
  });
  cake.addEventListener("pointerup", end);
  cake.addEventListener("pointercancel", end);
  cake.addEventListener("lostpointercapture", end);

  // Prevent the browser from treating the drag as a scroll/selection.
  cake.addEventListener("touchstart", (e) => e.preventDefault(), { passive: false });
  cake.addEventListener("contextmenu", (e) => e.preventDefault());

  // Keyboard + accessible role activation.
  cake.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onCut();
    }
  });

  return {
    isDone: () => cutDone,
    reset: () => {
      cutDone = false;
      dragging = false;
      const knife = $("#cakeKnife");
      if (knife) knife.style.transform = "";
    },
    markCut: () => {
      cutDone = true;
    },
  };
}

/* =========================================================
   Fireworks — grand-finale canvas animation
   Launches rockets that burst into colored particles, then
   stops automatically. Honors reduced-motion (brief/skip).
   ========================================================= */
function initFireworks() {
  const canvas = $("#fireworksCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  let width = 0;
  let height = 0;
  let dpr = 1;
  let rockets = [];
  let particles = [];
  let rafId = null;
  let endAt = 0;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = rect.width || window.innerWidth;
    height = rect.height || window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function launchRocket() {
    const x = width * (0.2 + Math.random() * 0.6);
    const targetY = height * (0.15 + Math.random() * 0.35);
    rockets.push({
      x,
      y: height + 10,
      vx: (Math.random() - 0.5) * 1.2,
      vy: -(Math.random() * 3 + 7),
      targetY,
      color: CONFIG.fireworks.colors[Math.floor(Math.random() * CONFIG.fireworks.colors.length)],
    });
  }

  function explode(x, y, color) {
    const count = prefersReducedMotion ? 18 : 46;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.2;
      const speed = Math.random() * 4 + 2;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        alpha: 1,
        decay: Math.random() * 0.015 + 0.008,
        color,
      });
    }
  }

  function frame() {
    ctx.clearRect(0, 0, width, height);

    rockets.forEach((r) => {
      r.x += r.vx;
      r.y += r.vy;
      r.vy += 0.06; // gravity
      ctx.globalAlpha = 1;
      ctx.fillStyle = r.color;
      ctx.fillRect(r.x - 1.5, r.y - 4, 3, 8);
    });
    rockets = rockets.filter((r) => {
      if (r.vy >= 0 || r.y <= r.targetY) {
        explode(r.x, r.y, r.color);
        return false;
      }
      return true;
    });

    particles.forEach((p) => {
      p.vx *= 0.99;
      p.vy = p.vy * 0.99 + 0.03;
      p.x += p.vx;
      p.y += p.vy;
      p.alpha -= p.decay;
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    particles = particles.filter((p) => p.alpha > 0);

    const now = performance.now();
    if (now < endAt && Math.random() < 0.08) launchRocket();

    const done = now >= endAt && rockets.length === 0 && particles.length === 0;
    if (!done) {
      rafId = requestAnimationFrame(frame);
    } else {
      ctx.clearRect(0, 0, width, height);
    }
  }

  window.addEventListener("resize", () => {
    if (rafId) resize();
  });

  return function start() {
    if (rafId) cancelAnimationFrame(rafId);
    rockets = [];
    particles = [];
    resize();
    endAt = performance.now() + (prefersReducedMotion ? 1200 : CONFIG.fireworks.durationMs);
    if (prefersReducedMotion) {
      // Brief, calm burst instead of a full show.
      for (let i = 0; i < 3; i++) {
        window.setTimeout(
          () => explode(width / 2, height / 2, CONFIG.fireworks.colors[i % CONFIG.fireworks.colors.length]),
          i * 250
        );
      }
    } else {
      launchRocket();
      launchRocket();
    }
    rafId = requestAnimationFrame(frame);
  };
}

/* =========================================================
   Sound — synthesized celebratory fanfare (Web Audio API)
   Created/resumed inside a user gesture to satisfy autoplay
   rules. No audio files or dependencies. A persisted toggle
   lets users opt out.
   ========================================================= */
const Sound = {
  ctx: null,
  enabled: localStorage.getItem("wish:sound") !== "off",

  ensureContext() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    return this.ctx;
  },

  tone(freq, start, duration, type = "triangle", gain = 0.2) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(gain, start + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(g).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.05);
  },

  /* A short, cheerful major arpeggio fanfare.
     Wrapped defensively so an audio failure never blocks the finale. */
  play() {
    if (!this.enabled) return;
    try {
      const ctx = this.ensureContext();
      if (!ctx) return;
      const t = ctx.currentTime + 0.02;
      const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
      notes.forEach((f, i) => this.tone(f, t + i * 0.12, 0.5));
      this.tone(1318.51, t + 0.5, 0.6, "sine", 0.12); // E6 sparkle
    } catch (err) {
      /* Audio is a nice-to-have; never let it break the celebration. */
    }
  },
};

/* =========================================================
   Boot — decide mode from the URL and wire everything up
   ========================================================= */
document.addEventListener("DOMContentLoaded", () => {
  initStarfield();

  if (WishData.hasData()) {
    const data = WishData.decode();
    const fireworks = initFireworks();
    const journey = initJourney();

    // Single cut action shared by the swipe gesture, keyboard,
    // and the accessible fallback button.
    let cutDone = false;
    function doCut() {
      if (cutDone) return;
      cutDone = true;

      const cake = $("#cake");
      cake.classList.add("is-cut");

      Sound.play(); // plays within the user's cut gesture
      const delay = prefersReducedMotion ? 200 : 900;
      window.setTimeout(() => {
        fireworks(); // initFireworks() returns the start function itself
        journey.showStep("finale");
        $("#replayBtn").focus({ preventScroll: true });
        cutDone = false; // allow cutting again on replay
      }, delay);
    }

    initCakeCut(doCut);
    $("#cutFallbackBtn").addEventListener("click", doCut);

    journey.enterRecipientMode(data);
  } else {
    initCreator();
  }
});




