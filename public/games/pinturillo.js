// ── PINTURILLO — vue client (dessin & devinette) ────────────────────────────
// Canvas PERSISTANT (survit aux re-renders). Le dessinateur trace + envoie des
// segments ; les autres reçoivent en direct (messages {t:'draw'}) + un snapshot
// dans l'état pour la cohérence/reconnexion.
function injectCss(id, css) { if (document.getElementById('css-' + id)) return; const s = document.createElement('style'); s.id = 'css-' + id; s.textContent = css; document.head.appendChild(s); }

const W = 720, H = 480;
const COLORS = ['#111827', '#ef4444', '#f59e0b', '#f5d90a', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#8b5a2b', '#ffffff'];
const SIZES = [3, 6, 12, 22];

let canvasEl = null, cctx = null;
let drawnRound = -1, drawnCount = 0;
let color = '#111827', size = 6, eraser = false;
let drawing = false, curSeg = null;
let chatDraft = '';

function ensureCanvas() {
  if (canvasEl) return;
  canvasEl = document.createElement('canvas');
  canvasEl.width = W; canvasEl.height = H;
  canvasEl.className = 'pt-canvas';
  cctx = canvasEl.getContext('2d');
  cctx.lineCap = 'round'; cctx.lineJoin = 'round';
  clearCanvas();
}
function clearCanvas() { cctx.fillStyle = '#ffffff'; cctx.fillRect(0, 0, W, H); }
function drawSeg(c, w, pts) {
  if (!pts || pts.length === 0) return;
  cctx.strokeStyle = c; cctx.fillStyle = c; cctx.lineWidth = w;
  if (pts.length === 1) { cctx.beginPath(); cctx.arc(pts[0][0], pts[0][1], w / 2, 0, 6.29); cctx.fill(); return; }
  cctx.beginPath(); cctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) cctx.lineTo(pts[i][0], pts[i][1]);
  cctx.stroke();
}
function drawAll(strokes) { clearCanvas(); for (const s of strokes) drawSeg(s.c, s.w, s.p); }

// Reçoit les messages de dessin en direct.
function applyDraw(msg) {
  if (!cctx) return;
  if (msg.clear) { clearCanvas(); drawnCount = 0; return; }
  if (msg.full) { drawAll(msg.full); drawnCount = msg.full.length; return; }
  if (msg.seg) { drawSeg(msg.seg.c, msg.seg.w, msg.seg.p); drawnCount++; }
}

export function view(g, ctx) {
  const { h } = ctx;
  injectCss('pinturillo', CSS);
  ensureCanvas();
  ctx.setDrawHandler(applyDraw);

  const iAmDrawer = g.drawerId === ctx.myId;

  // Réconcilie le canvas avec l'instantané serveur.
  if (g.round !== drawnRound) { clearCanvas(); drawnRound = g.round; drawnCount = 0; }
  const strokes = g.strokes || [];
  if (strokes.length < drawnCount) { clearCanvas(); drawnCount = 0; }
  for (let i = drawnCount; i < strokes.length; i++) drawSeg(strokes[i].c, strokes[i].w, strokes[i].p);
  drawnCount = strokes.length;

  // (Dé)branche le tracé selon qu'on est dessinateur.
  setupDrawing(ctx, iAmDrawer && g.phase === 'draw');

  if (g.phase === 'over') return overView(g, ctx);
  return roundView(g, ctx, iAmDrawer);
}

function pos(e) {
  const r = canvasEl.getBoundingClientRect();
  return [(e.clientX - r.left) * (W / r.width), (e.clientY - r.top) * (H / r.height)];
}
function setupDrawing(ctx, active) {
  canvasEl.style.cursor = active ? 'crosshair' : 'default';
  if (!active) { canvasEl.onpointerdown = canvasEl.onpointermove = canvasEl.onpointerup = canvasEl.onpointerleave = null; drawing = false; return; }
  const flush = () => {
    if (!curSeg || curSeg.p.length < 1) return;
    ctx.send({ t: 'draw', type: 'seg', seg: { c: curSeg.c, w: curSeg.w, p: curSeg.p } });
    const last = curSeg.p[curSeg.p.length - 1];
    curSeg = { c: curSeg.c, w: curSeg.w, p: [last] };
  };
  canvasEl.onpointerdown = (e) => { e.preventDefault(); canvasEl.setPointerCapture?.(e.pointerId); drawing = true; const c = eraser ? '#ffffff' : color; const w = eraser ? 22 : size; const p = pos(e); curSeg = { c, w, p: [p] }; drawSeg(c, w, [p]); };
  canvasEl.onpointermove = (e) => { if (!drawing) return; const p = pos(e); const last = curSeg.p[curSeg.p.length - 1]; drawSeg(curSeg.c, curSeg.w, [last, p]); curSeg.p.push(p); if (curSeg.p.length >= 8) flush(); };
  canvasEl.onpointerup = () => { if (!drawing) return; flush(); drawing = false; curSeg = null; };
  canvasEl.onpointerleave = () => { if (drawing) { flush(); drawing = false; curSeg = null; } };
}

function roundView(g, ctx, iAmDrawer) {
  const { h } = ctx;
  const me = g.players.find((p) => p.id === ctx.myId);
  const w = h('div', { class: 'stack' });

  // En-tête : phase + dessinateur + timer + indice.
  const word = iAmDrawer ? (ctx.secret && ctx.secret.drawWord) : null;
  w.append(h('div', { class: 'pt-head' },
    h('div', {}, h('span', { class: 'kicker' }, `🎨 Manche ${g.round}/${g.totalDrawings}`),
      h('div', { class: 'pt-drawer' }, iAmDrawer ? 'À toi de dessiner !' : `${g.drawerName} dessine…`)),
    h('div', { class: 'pt-word' }, g.phase === 'reveal'
      ? h('span', {}, 'Mot : ', h('b', {}, g.reveal))
      : (iAmDrawer ? h('span', {}, 'Ton mot : ', h('b', { style: 'color:var(--gold-2)' }, word || '…'))
        : h('span', { class: 'pt-hint' }, (g.wordHint || '').split('').join(' ') + `  (${g.wordLength})`))),
    ctx.timerEl(g.timer),
  ));

  // Zone de dessin (le même canvas persistant).
  const stage = h('div', { class: 'pt-stage' });
  stage.appendChild(canvasEl);
  w.append(stage);

  // Outils (dessinateur seulement, en phase draw).
  if (iAmDrawer && g.phase === 'draw') {
    w.append(toolbar(ctx));
    w.append(h('button', { class: 'btn btn-primary btn-sm', style: 'align-self:center', onclick: () => ctx.gameSend('finish') }, '✅ Terminer la manche'));
  }

  // Chat + devinette + joueurs.
  w.append(h('div', { class: 'pt-bottom' }, chatBox(g, ctx, iAmDrawer, me), scoreBox(g, ctx)));

  if (g.phase === 'reveal') w.append(revealBanner(g, ctx));
  return w;
}

function toolbar(ctx) {
  const { h } = ctx;
  const swatches = h('div', { class: 'pt-swatches' }, ...COLORS.map((c) =>
    h('button', { class: 'pt-swatch' + (!eraser && c === color ? ' on' : ''), style: `background:${c}`, onclick: () => { color = c; eraser = false; ctx.rerender(); } })));
  const sizes = h('div', { class: 'pt-sizes' }, ...SIZES.map((s) =>
    h('button', { class: 'pt-size' + (!eraser && s === size ? ' on' : ''), onclick: () => { size = s; eraser = false; ctx.rerender(); } }, h('span', { style: `width:${s + 4}px;height:${s + 4}px` }))));
  return h('div', { class: 'pt-tools' },
    swatches, sizes,
    h('button', { class: 'btn btn-ghost btn-sm' + (eraser ? ' pt-eron' : ''), onclick: () => { eraser = !eraser; ctx.rerender(); } }, '🧽 Gomme'),
    h('button', { class: 'btn btn-ghost btn-sm', onclick: () => { ctx.send({ t: 'draw', type: 'undo' }); } }, '↩️'),
    h('button', { class: 'btn btn-danger btn-sm', onclick: () => { clearCanvas(); drawnCount = 0; ctx.send({ t: 'draw', type: 'clear' }); } }, '🗑️ Effacer'),
  );
}

function chatBox(g, ctx, iAmDrawer, me) {
  const { h, gameSend } = ctx;
  const list = h('div', { class: 'pt-chat' });
  for (const m of (g.chat || [])) {
    if (m.sys) list.append(h('div', { class: 'pt-sys' }, m.text));
    else list.append(h('div', { class: 'pt-msg' }, h('b', {}, m.name + ' : '), m.text));
  }
  const box = h('div', { class: 'card stack', style: 'flex:2;min-width:0' },
    h('div', { class: 'kicker' }, 'Chat & devinettes'), list);

  const iFound = me && me.hasGuessed;
  if (iAmDrawer) {
    box.append(h('p', { class: 'hint-line' }, 'Tu dessines — pas de triche 😄'));
  } else if (iFound) {
    box.append(h('div', { class: 'pt-found' }, '✅ Tu as trouvé le mot !'));
  } else if (g.phase === 'draw') {
    const inp = h('input', {
      class: 'input', id: 'pt-guess', maxlength: 40, placeholder: 'ta réponse…', value: chatDraft, autocomplete: 'off',
      oninput: (e) => { chatDraft = e.target.value; },
      onkeydown: (e) => { if (e.key === 'Enter' && chatDraft.trim()) { gameSend('guess', { text: chatDraft.trim() }); chatDraft = ''; } },
    });
    box.append(h('div', { style: 'display:flex;gap:8px' }, inp,
      h('button', { class: 'btn btn-primary btn-sm', onclick: () => { if (chatDraft.trim()) { gameSend('guess', { text: chatDraft.trim() }); chatDraft = ''; } } }, 'Envoyer')));
  }
  // auto-scroll
  setTimeout(() => { list.scrollTop = list.scrollHeight; }, 0);
  return box;
}

function scoreBox(g, ctx) {
  const { h } = ctx;
  const rows = h('div', { class: 'stack', style: 'gap:6px' });
  [...g.players].sort((a, b) => b.score - a.score).forEach((p) => rows.append(h('div', { class: 'pt-prow' + (p.isDrawer ? ' draw' : '') },
    h('span', { class: 'av' }, p.avatar),
    h('span', { class: 'nm', style: 'flex:1;min-width:0' }, p.name, p.isDrawer ? ' 🖌️' : (p.hasGuessed ? ' ✅' : '')),
    h('span', { class: 'pts' }, String(p.score)),
  )));
  return h('div', { class: 'card stack', style: 'flex:1;min-width:0' }, h('div', { class: 'kicker' }, 'Scores'), rows);
}

function revealBanner(g, ctx) {
  const { h, gameSend, isHost } = ctx;
  const found = g.players.filter((p) => p.hasGuessed).length;
  const b = h('div', { class: 'card center stack fade-in' },
    h('div', { class: 'kicker' }, 'Manche terminée'),
    h('div', { style: 'font-size:1.3rem;font-weight:800' }, 'Le mot était : ', h('b', { style: 'color:var(--gold-2)' }, g.reveal)),
    h('p', { class: 'hint-line' }, `${found} joueur(s) ont trouvé.`),
  );
  if (isHost) b.append(h('button', { class: 'btn btn-primary btn-sm', onclick: () => gameSend('next') }, '➡️ Manche suivante'));
  return b;
}

function overView(g, ctx) {
  const { h, gameSend, isHost } = ctx;
  const rank = g.ranking || [...g.players].sort((a, b) => b.score - a.score);
  const w = h('div', { class: 'stack' });
  w.append(h('div', { class: 'win-banner fade-in' }, h('div', { style: 'font-size:3rem' }, '🏆'),
    h('div', { class: 'title', style: 'color:var(--gold-2)' }, rank[0] ? `${rank[0].name} gagne !` : 'Partie terminée')));
  const rows = h('div', { class: 'stack', style: 'gap:8px' });
  rank.forEach((p, i) => rows.append(h('div', { class: 'score-row' + (i === 0 ? ' top' : '') },
    h('div', { class: 'rank' }, String(i + 1)), h('div', { class: 'av' }, p.avatar),
    h('div', { class: 'nm' }, p.name), h('div', { class: 'pts' }, `${p.score} pts`))));
  w.append(h('div', { class: 'card stack' }, h('div', { class: 'kicker' }, 'Classement final'), rows));
  if (isHost) w.append(h('button', { class: 'btn btn-primary btn-lg', onclick: () => gameSend('restart') }, '🔁 Rejouer'));
  return w;
}

const CSS = `
.pt-head{ display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }
.pt-drawer{ font-weight:800; font-size:1.05rem; }
.pt-word{ font-size:1.1rem; }
.pt-hint{ letter-spacing:.18em; font-weight:800; font-family:monospace; color:var(--ink); }
.pt-stage{ display:flex; justify-content:center; }
.pt-canvas{ width:100%; max-width:640px; aspect-ratio:3/2; background:#fff; border-radius:14px; border:1px solid var(--border-strong); touch-action:none; box-shadow:var(--shadow); }
.pt-tools{ display:flex; align-items:center; gap:10px; flex-wrap:wrap; justify-content:center; }
.pt-swatches{ display:flex; gap:5px; flex-wrap:wrap; }
.pt-swatch{ width:26px; height:26px; border-radius:50%; border:2px solid rgba(255,255,255,.25); cursor:pointer; }
.pt-swatch.on{ border-color:var(--gold); transform:scale(1.15); box-shadow:0 0 10px rgba(233,185,73,.6); }
.pt-sizes{ display:flex; gap:5px; }
.pt-size{ width:34px; height:34px; border-radius:9px; border:1px solid var(--border); background:var(--panel); cursor:pointer; display:grid; place-items:center; }
.pt-size.on{ border-color:var(--gold); }
.pt-size span{ background:var(--ink); border-radius:50%; display:block; }
.pt-eron{ border-color:var(--gold)!important; color:var(--gold-2)!important; }
.pt-bottom{ display:flex; gap:12px; flex-wrap:wrap; }
.pt-chat{ max-height:180px; overflow-y:auto; display:flex; flex-direction:column; gap:4px; font-size:.9rem; }
.pt-msg{ background:var(--panel); border-radius:8px; padding:5px 9px; }
.pt-sys{ color:var(--green); font-weight:700; text-align:center; }
.pt-found{ color:var(--green); font-weight:800; text-align:center; padding:6px; }
.pt-prow{ display:flex; align-items:center; gap:8px; background:var(--panel); border:1px solid var(--border); border-radius:10px; padding:6px 10px; }
.pt-prow.draw{ border-color:rgba(255,126,182,.5); }
.pt-prow .av{ font-size:1.1rem; }
.pt-prow .pts{ font-weight:800; }
@media(max-width:640px){ .pt-bottom{ flex-direction:column; } }
`;
