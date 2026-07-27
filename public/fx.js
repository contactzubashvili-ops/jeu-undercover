// ─────────────────────────────────────────────────────────────────────────
//  FX — effets « wow » : sons (WebAudio, sans fichiers), confettis, et emotes
//  animées façon Mario Party (visibles par tout le monde). Réglages persistés.
// ─────────────────────────────────────────────────────────────────────────
const S = { anim: true, sound: true };
try { const s = JSON.parse(localStorage.getItem('uc_fx') || 'null'); if (s) { S.anim = s.anim !== false; S.sound = !!s.sound; } } catch {}

export const settings = S;
export function setAnim(v) { S.anim = !!v; save(); }
export function setSound(v) { S.sound = !!v; save(); if (S.sound) sound('click'); }
function save() { try { localStorage.setItem('uc_fx', JSON.stringify(S)); } catch {} apply(); }
export function apply() { document.body.classList.toggle('reduce-anim', !S.anim); }
apply();

// ── Sons (oscillateurs) ────────────────────────────────────────────────────
let audioCtx = null;
function ac() { if (!audioCtx) { try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch {} } return audioCtx; }
const SOUNDS = {
  click: [{ f: 520, d: 0.05, t: 'square', g: 0.04 }],
  submit: [{ f: 440, d: 0.06 }, { f: 680, d: 0.08, delay: 0.05 }],
  vote: [{ f: 300, d: 0.05 }, { f: 420, d: 0.06, delay: 0.05 }],
  join: [{ f: 500, d: 0.07 }, { f: 760, d: 0.09, delay: 0.06 }],
  eliminate: [{ f: 220, d: 0.16, t: 'sawtooth', g: 0.06 }],
  win: [{ f: 523, d: 0.1 }, { f: 659, d: 0.1, delay: 0.1 }, { f: 784, d: 0.2, delay: 0.2 }],
  lose: [{ f: 400, d: 0.16, t: 'sawtooth' }, { f: 240, d: 0.26, t: 'sawtooth', delay: 0.12 }],
  explosion: [{ f: 130, d: 0.32, t: 'sawtooth', g: 0.12 }, { f: 80, d: 0.3, t: 'square', g: 0.1, delay: 0.02 }],
  tick: [{ f: 900, d: 0.03, g: 0.03 }],
  emote: [{ f: 700, d: 0.05 }, { f: 1040, d: 0.06, delay: 0.04 }],
  reveal: [{ f: 660, d: 0.08 }, { f: 880, d: 0.12, delay: 0.07 }],
};
export function sound(name) {
  if (!S.sound) return;
  const ctx = ac(); if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume();
  const now = ctx.currentTime;
  for (const n of (SOUNDS[name] || [])) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = n.t || 'sine'; o.frequency.value = n.f;
    const t0 = now + (n.delay || 0), vol = n.g || 0.06;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + n.d);
    o.connect(g); g.connect(ctx.destination);
    o.start(t0); o.stop(t0 + n.d + 0.03);
  }
}

// ── Sons custom par emote (synthèse) ───────────────────────────────────────
function glide(f0, f1, dur, type, g, delay) {
  const ctx = ac(); if (!ctx) return;
  const now = ctx.currentTime + (delay || 0);
  const o = ctx.createOscillator(), ga = ctx.createGain();
  o.type = type || 'sine';
  o.frequency.setValueAtTime(f0, now);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), now + dur);
  ga.gain.setValueAtTime(0.0001, now);
  ga.gain.linearRampToValueAtTime(g || 0.06, now + 0.012);
  ga.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  o.connect(ga); ga.connect(ctx.destination);
  o.start(now); o.stop(now + dur + 0.03);
}
function noiseBurst(dur, g, opts, delay) {
  const ctx = ac(); if (!ctx) return;
  const now = ctx.currentTime + (delay || 0);
  const n = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(); src.buffer = buf;
  const ga = ctx.createGain();
  ga.gain.setValueAtTime(0.0001, now);
  ga.gain.linearRampToValueAtTime(g || 0.1, now + 0.01);
  ga.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  if (opts && opts.freq) { const f = ctx.createBiquadFilter(); f.type = opts.type || 'lowpass'; f.frequency.value = opts.freq; src.connect(f); f.connect(ga); } else src.connect(ga);
  ga.connect(ctx.destination);
  src.start(now); src.stop(now + dur + 0.02);
}
export function emoteSound(emoji) {
  if (!S.sound) return; const ctx = ac(); if (!ctx) return; if (ctx.state === 'suspended') ctx.resume();
  switch (emoji) {
    case '👎': glide(300, 110, 0.55, 'sawtooth', 0.09); break;                                   // huée « wouuuu »
    case '💩': noiseBurst(0.32, 0.11, { type: 'lowpass', freq: 380 }); glide(95, 55, 0.34, 'sawtooth', 0.1); break; // prout
    case '😂': case '🤣': [0, 0.12, 0.24, 0.36].forEach((d, i) => glide(520 - i * 40, 430 - i * 40, 0.08, 'square', 0.05, d)); break; // rire
    case '😭': glide(760, 300, 0.5, 'sine', 0.07); break;                                          // pleurs
    case '🎉': case '👏': [523, 659, 784, 1046].forEach((f, i) => glide(f, f, 0.11, 'triangle', 0.06, i * 0.08)); break; // tada
    case '🔥': noiseBurst(0.42, 0.1, { type: 'bandpass', freq: 1100 }); break;                     // whoosh
    case '💀': glide(420, 150, 0.5, 'sawtooth', 0.07); glide(430, 160, 0.5, 'square', 0.04, 0.02); break; // sinistre
    case '😡': glide(210, 170, 0.32, 'sawtooth', 0.1); break;                                      // grognement
    case '😱': glide(500, 1250, 0.15, 'sawtooth', 0.07); glide(1250, 280, 0.25, 'sawtooth', 0.07, 0.15); break; // cri
    case '❤️': glide(140, 120, 0.09, 'sine', 0.1); glide(140, 120, 0.1, 'sine', 0.1, 0.24); break; // battement de cœur
    case '🐐': { const o = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain(); o.type = 'sawtooth'; o.frequency.value = 400; lfo.frequency.value = 20; lg.gain.value = 45; lfo.connect(lg); lg.connect(o.frequency); const now = ctx.currentTime; g.gain.setValueAtTime(0.0001, now); g.gain.linearRampToValueAtTime(0.07, now + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.5); o.connect(g); g.connect(ctx.destination); lfo.start(now); o.start(now); o.stop(now + 0.52); lfo.stop(now + 0.52); } break; // bêlement GOAT
    case '🤡': glide(520, 720, 0.1, 'square', 0.05); glide(720, 420, 0.1, 'square', 0.05, 0.1); glide(420, 820, 0.1, 'square', 0.05, 0.2); break; // clown
    case '🤯': noiseBurst(0.3, 0.12, { type: 'lowpass', freq: 600 }); glide(200, 950, 0.22, 'sawtooth', 0.06); break; // explosion de tête
    case '😎': glide(400, 620, 0.12, 'triangle', 0.06); glide(620, 620, 0.16, 'triangle', 0.06, 0.1); break; // cool
    case '🤔': glide(420, 520, 0.22, 'sine', 0.05); break;                                          // hmm
    case '🙄': glide(520, 400, 0.3, 'sine', 0.05); break;                                           // soupir
    default: glide(700, 1000, 0.07, 'sine', 0.06);
  }
}

// ── Confettis (canvas) ──────────────────────────────────────────────────────
let cvs = null, ctx2 = null, parts = [], raf = 0;
function ensureCanvas() {
  if (cvs) return;
  cvs = document.createElement('canvas');
  cvs.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:80';
  document.body.appendChild(cvs);
  ctx2 = cvs.getContext('2d');
  resize(); window.addEventListener('resize', resize);
}
function resize() { if (!cvs) return; cvs.width = innerWidth; cvs.height = innerHeight; }
const COLORS = ['#e9b949', '#8f7cf6', '#37d0a0', '#f0555f', '#ffcf6b', '#b3a4ff'];
export function confetti(n = 120) {
  if (!S.anim) return;
  ensureCanvas();
  for (let i = 0; i < n; i++) {
    parts.push({
      x: innerWidth / 2 + (Math.random() - 0.5) * 200, y: innerHeight / 3,
      vx: (Math.random() - 0.5) * 12, vy: Math.random() * -14 - 4,
      s: 4 + Math.random() * 6, c: COLORS[(Math.random() * COLORS.length) | 0],
      rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.4, life: 1,
    });
  }
  if (!raf) tick();
}
function tick() {
  raf = requestAnimationFrame(tick);
  ctx2.clearRect(0, 0, cvs.width, cvs.height);
  for (const p of parts) {
    p.vy += 0.35; p.x += p.vx; p.y += p.vy; p.vx *= 0.99; p.rot += p.vr; p.life -= 0.008;
    ctx2.save(); ctx2.globalAlpha = Math.max(0, p.life); ctx2.translate(p.x, p.y); ctx2.rotate(p.rot);
    ctx2.fillStyle = p.c; ctx2.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 1.6); ctx2.restore();
  }
  parts = parts.filter((p) => p.life > 0 && p.y < cvs.height + 40);
  if (!parts.length) { cancelAnimationFrame(raf); raf = 0; ctx2.clearRect(0, 0, cvs.width, cvs.height); }
}

// ── Flash plein écran (explosion / erreur) ──────────────────────────────────
export function flash(color = 'rgba(240,85,95,0.5)', ms = 260) {
  if (!S.anim) return;
  const d = document.createElement('div');
  d.style.cssText = `position:fixed;inset:0;z-index:79;pointer-events:none;background:${color};opacity:0;transition:opacity ${ms / 2}ms`;
  document.body.appendChild(d);
  requestAnimationFrame(() => { d.style.opacity = '1'; setTimeout(() => { d.style.opacity = '0'; setTimeout(() => d.remove(), ms); }, ms / 2); });
}

// ── Emotes animées façon Mario Party (visibles par tous) ────────────────────
let emoteLayer = null;
function ensureEmoteLayer() {
  if (emoteLayer) return;
  emoteLayer = document.createElement('div');
  emoteLayer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:82;overflow:hidden';
  document.body.appendChild(emoteLayer);
  const st = document.createElement('style');
  st.textContent = `
    @keyframes emoteFly { 0%{transform:translateY(40px) scale(.2);opacity:0} 12%{transform:translateY(-10px) scale(1.25);opacity:1} 22%{transform:translateY(0) scale(1)} 80%{opacity:1} 100%{transform:translateY(-70px) scale(1);opacity:0} }
    @keyframes emoteWob { 0%,100%{margin-left:0} 25%{margin-left:-12px} 75%{margin-left:12px} }
    .emote-pop{ position:absolute; bottom:14%; display:flex; flex-direction:column; align-items:center; animation:emoteFly 2.6s cubic-bezier(.2,.9,.3,1) forwards; }
    .emote-pop .em{ font-size:clamp(3rem,11vw,5rem); animation:emoteWob 0.6s ease-in-out infinite; filter:drop-shadow(0 6px 14px rgba(0,0,0,.5)); }
    .emote-pop .emote-img{ width:clamp(80px,22vw,150px); height:auto; border-radius:14px; box-shadow:0 8px 20px rgba(0,0,0,.55); display:block; }
    .emote-pop .who{ margin-top:2px; font-size:.8rem; font-weight:800; padding:3px 10px; border-radius:999px; background:rgba(10,10,16,.8); white-space:nowrap; }
    body.reduce-anim .emote-pop{ animation:none; opacity:1; transition:opacity .3s; }
  `;
  document.head.appendChild(st);
}
export function flyEmote(emoji, from, color, img) {
  ensureEmoteLayer();
  const el = document.createElement('div');
  el.className = 'emote-pop';
  el.style.left = (10 + Math.random() * 76) + '%';
  el.innerHTML = `<div class="em"></div><div class="who"></div>`;
  const em = el.querySelector('.em');
  if (img) { const im = document.createElement('img'); im.className = 'emote-img'; im.src = img; im.alt = ''; em.appendChild(im); }
  else em.textContent = emoji;
  const who = el.querySelector('.who');
  who.textContent = from || '';
  who.style.color = color || '#fff';
  emoteLayer.appendChild(el);
  emoteSound(img ? '' : emoji);
  const ttl = S.anim ? 2600 : 1400;
  if (!S.anim) { el.style.bottom = (15 + Math.random() * 40) + '%'; setTimeout(() => { el.style.opacity = '0'; }, ttl - 300); }
  setTimeout(() => el.remove(), ttl);
}
