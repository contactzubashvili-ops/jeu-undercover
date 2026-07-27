// ── WORD SCATTER — vue client ──────────────────────────────────────────────
// Un mot secret, ses lettres réparties entre les joueurs. Chacun ne voit que
// SES lettres (ctx.secret.letters). On les pose une à une aux extrémités de la
// séquence, qui doit rester une sous-chaîne du mot. Coopératif : on se guide
// par indices dans le chat, sans jamais nommer ses lettres.
let chatDraft = '';
let selIdx = null;
let lastBuilt = '';

function injectCss(id, css) {
  if (document.getElementById('css-' + id)) return;
  const s = document.createElement('style');
  s.id = 'css-' + id;
  s.textContent = css;
  document.head.appendChild(s);
}

const CSS = `
.ws-board{ display:flex; flex-wrap:wrap; gap:8px; justify-content:center; padding:6px 4px; }
.ws-cell{ width:44px; height:54px; display:flex; align-items:center; justify-content:center;
  border-radius:10px; font-size:1.5rem; font-weight:900; }
.ws-cell.filled{ color:var(--ink); border:1px solid var(--violet);
  background:color-mix(in srgb, var(--violet) 24%, var(--panel));
  box-shadow:0 3px 12px color-mix(in srgb, var(--violet) 35%, transparent); }
.ws-cell.empty{ color:var(--muted); border:1px dashed var(--border); background:var(--faint); }
.ws-cell.pop{ animation:wsPop .42s cubic-bezier(.2,.8,.3,1.4); }
@keyframes wsPop{ 0%{ transform:scale(.35) rotate(-8deg); opacity:0; } 100%{ transform:scale(1) rotate(0); opacity:1; } }
.ws-len{ text-align:center; font-size:.74rem; letter-spacing:.1em; text-transform:uppercase; color:var(--muted); }
.ws-tiles{ display:flex; flex-wrap:wrap; gap:8px; justify-content:center; }
.ws-tile{ width:46px; height:54px; display:flex; align-items:center; justify-content:center;
  border-radius:10px; font-size:1.4rem; font-weight:900; cursor:grab; color:var(--ink); touch-action:none;
  background:var(--panel); border:1px solid var(--border);
  transition:transform .12s ease, border-color .12s ease, box-shadow .12s ease; }
.ws-tile:active{ cursor:grabbing; }
.ws-drop{ width:34px; height:54px; display:flex; align-items:center; justify-content:center; border-radius:10px;
  font-size:1.2rem; color:var(--muted); border:2px dashed var(--border-strong); background:transparent; transition:all .12s; }
.ws-drop.over{ border-color:var(--gold); color:var(--gold-2); background:color-mix(in srgb, var(--gold) 18%, transparent); transform:scale(1.12); }
.ws-ghost{ position:fixed; z-index:90; transform:translate(-50%,-50%); pointer-events:none; width:46px; height:54px;
  display:flex; align-items:center; justify-content:center; border-radius:10px; font-size:1.4rem; font-weight:900;
  color:#17121e; background:var(--gold); box-shadow:0 8px 22px rgba(0,0,0,.55); }
.ws-tile:hover{ transform:translateY(-3px); border-color:var(--gold); }
.ws-tile.sel{ border-color:var(--gold-2); transform:translateY(-3px);
  background:color-mix(in srgb, var(--gold) 20%, var(--panel));
  box-shadow:0 0 0 2px color-mix(in srgb, var(--gold) 45%, transparent); }
.ws-place{ display:flex; gap:10px; }
.ws-place .btn{ flex:1 1 0; }
.ws-log{ display:flex; flex-direction:column; gap:6px; max-height:200px; overflow-y:auto; padding-right:4px; }
.ws-msg{ font-size:.9rem; line-height:1.45; }
.ws-msg .who{ color:var(--gold-2); font-weight:700; margin-right:6px; }
.ws-chatform{ display:flex; gap:8px; }
.ws-chatform .input{ flex:1 1 auto; }
.ws-players{ display:flex; flex-wrap:wrap; gap:8px; }
.ws-pcard{ display:flex; align-items:center; gap:8px; padding:8px 12px; border-radius:12px;
  background:var(--panel); border:1px solid var(--border); }
.ws-pcard.off{ opacity:.5; }
.ws-pcard .av{ font-size:1.25rem; }
.ws-pcard .nm{ font-weight:600; }
.ws-pcard .cnt{ margin-left:8px; font-weight:900; color:var(--gold-2); font-size:.9rem;
  padding:1px 8px; border-radius:999px; background:var(--faint); }
.ws-pcard .cnt.done{ color:var(--green); }
.ws-shake{ animation:wsShake .5s ease; }
@keyframes wsShake{ 0%,100%{ transform:translateX(0);} 20%{ transform:translateX(-9px);} 40%{ transform:translateX(9px);}
  60%{ transform:translateX(-5px);} 80%{ transform:translateX(5px);} }
`;

export function view(g, ctx) {
  const { h } = ctx;
  injectCss('wordscatter', CSS);

  // Détecte la lettre qui vient d'être posée, pour l'animer une seule fois.
  let animIndex = null;
  const built = g.built || '';
  if (built.length === lastBuilt.length + 1) {
    if (lastBuilt && built.endsWith(lastBuilt)) animIndex = 0;
    else if (built.startsWith(lastBuilt)) animIndex = built.length - 1;
  }
  lastBuilt = built;

  if (g.phase === 'won') return endView(g, ctx, true);
  if (g.phase === 'lost') return endView(g, ctx, false);
  return playView(g, ctx, animIndex);
}

function boardView(g, ctx, animIndex) {
  const { h } = ctx;
  const built = g.built || '';
  const len = g.wordLength || built.length;
  const board = h('div', { class: 'ws-board' });
  // Zone de dépôt au début, lettres posées, zone de dépôt à la fin, puis vides.
  board.append(h('div', { class: 'ws-drop', 'data-side': 'start', title: 'Déposer au début' }, '＋'));
  for (let i = 0; i < built.length; i++) board.append(h('div', { class: 'ws-cell filled' + (i === animIndex ? ' pop' : '') }, built[i]));
  board.append(h('div', { class: 'ws-drop', 'data-side': 'end', title: 'Déposer à la fin' }, '＋'));
  for (let i = built.length; i < len; i++) board.append(h('div', { class: 'ws-cell empty' }, '·'));
  return h('div', { class: 'card stack' },
    h('div', { class: 'ws-len' }, `${built.length} / ${len} lettres · glisse une lettre sur un ＋`),
    board,
  );
}

// Glisser-déposer d'une lettre (souris + tactile). Tap simple = sélection.
function startDrag(e, letter, idx, ctx) {
  e.preventDefault();
  const ghost = document.createElement('div');
  ghost.className = 'ws-ghost'; ghost.textContent = letter;
  document.body.appendChild(ghost);
  const sx = e.clientX, sy = e.clientY;
  const move = (g) => { moveGhost(ghost, g.clientX, g.clientY); highlightDrop(g.clientX, g.clientY); };
  const up = (u) => {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    ghost.remove(); clearDropHighlight();
    const side = dropSideAt(u.clientX, u.clientY);
    if (side) { ctx.gameSend('place', { letter, side }); selIdx = null; }
    else if (Math.abs(u.clientX - sx) + Math.abs(u.clientY - sy) < 8) { selIdx = (selIdx === idx ? null : idx); } // tap
    ctx.rerender();
  };
  moveGhost(ghost, sx, sy);
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
}
function moveGhost(g, x, y) { g.style.left = x + 'px'; g.style.top = y + 'px'; }
function dropSideAt(x, y) { const el = document.elementFromPoint(x, y); const z = el && el.closest ? el.closest('.ws-drop') : null; return z ? z.getAttribute('data-side') : null; }
function highlightDrop(x, y) { clearDropHighlight(); const el = document.elementFromPoint(x, y); const z = el && el.closest ? el.closest('.ws-drop') : null; if (z) z.classList.add('over'); }
function clearDropHighlight() { document.querySelectorAll('.ws-drop.over').forEach((z) => z.classList.remove('over')); }

function playView(g, ctx, animIndex) {
  const { h, gameSend } = ctx;
  const letters = ctx.secret ? (ctx.secret.letters || []) : [];
  if (selIdx != null && selIdx >= letters.length) selIdx = null;

  const w = h('div', { class: 'stack' });

  w.append(h('div', { class: 'phase-banner' },
    h('span', { class: 'kicker' }, 'Word Scatter'),
    h('h2', {}, 'Reconstituez le mot, ensemble'),
    h('p', {}, 'Glisse tes lettres sur un ＋ (début ou fin). La séquence doit rester un morceau du mot.'),
  ));

  w.append(boardView(g, ctx, animIndex));

  // Mes lettres (privées) + contrôle de pose.
  const tiles = h('div', { class: 'ws-tiles' });
  if (!letters.length) {
    tiles.append(h('p', { class: 'muted small' }, 'Toutes vos lettres sont posées.'));
  } else {
    letters.forEach((L, i) => {
      tiles.append(h('div', {
        class: 'ws-tile' + (selIdx === i ? ' sel' : ''),
        onpointerdown: (e) => startDrag(e, L, i, ctx),
      }, L));
    });
  }

  const myLetters = h('div', { class: 'card stack' },
    h('div', { class: 'kicker' }, 'Vos lettres'),
    tiles,
  );

  if (selIdx != null && letters[selIdx] != null) {
    const L = letters[selIdx];
    myLetters.append(h('div', { class: 'ws-place' },
      h('button', { class: 'btn btn-violet', onclick: () => { gameSend('place', { letter: L, side: 'start' }); selIdx = null; } }, `◀ Poser « ${L} » au début`),
      h('button', { class: 'btn btn-violet', onclick: () => { gameSend('place', { letter: L, side: 'end' }); selIdx = null; } }, `Poser « ${L} » à la fin ▶`),
    ));
  } else if (letters.length) {
    myLetters.append(h('p', { class: 'hint-line' }, 'Glisse une lettre sur un ＋ — ou tape-la puis choisis début/fin.'));
  }
  w.append(myLetters);

  w.append(h('p', { class: 'hint-line' }, '🤫 Ne dites jamais vos lettres — donnez seulement des indices.'));

  // Chat de coordination.
  w.append(chatView(g, ctx));

  // Joueurs et lettres restantes.
  w.append(playersView(g, ctx));
  return w;
}

function chatView(g, ctx) {
  const { h, gameSend } = ctx;
  const log = h('div', { class: 'ws-log' });
  const msgs = g.chat || [];
  if (!msgs.length) {
    log.append(h('p', { class: 'muted small' }, 'Aucun indice pour l’instant. Lancez la discussion !'));
  } else {
    msgs.forEach((m) => log.append(h('div', { class: 'ws-msg' },
      h('span', { class: 'who' }, `${m.name} :`),
      h('span', {}, m.text),
    )));
  }

  const send = () => {
    const t = chatDraft.trim();
    if (!t) return;
    gameSend('chat', { text: t });
    chatDraft = '';
    ctx.rerender();
  };

  const inp = h('input', {
    class: 'input', id: 'ws-chat', maxlength: 200, placeholder: 'Un indice (sans nommer vos lettres)…',
    value: chatDraft, autocomplete: 'off',
    oninput: (e) => { chatDraft = e.target.value; },
    onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); send(); } },
  });

  return h('div', { class: 'card stack' },
    h('div', { class: 'kicker' }, 'Indices'),
    log,
    h('div', { class: 'ws-chatform' }, inp,
      h('button', { class: 'btn btn-primary', onclick: send }, 'Envoyer'),
    ),
  );
}

function playersView(g, ctx) {
  const { h } = ctx;
  const grid = h('div', { class: 'ws-players' });
  (g.players || []).forEach((p) => {
    grid.append(h('div', { class: 'ws-pcard' + (p.connected === false ? ' off' : '') },
      h('span', { class: 'av' }, p.avatar),
      h('span', { class: 'nm' }, p.name + (p.isHost ? ' 👑' : '')),
      h('span', { class: 'cnt' + (p.lettersLeft === 0 ? ' done' : '') }, `${p.lettersLeft} ✉`),
    ));
  });
  return h('div', { class: 'card stack' },
    h('div', { class: 'kicker' }, 'Lettres restantes par joueur'),
    grid,
  );
}

function endView(g, ctx, won) {
  const { h, gameSend, isHost } = ctx;
  const word = g.reveal || g.built || '';
  const w = h('div', { class: 'stack' });

  const banner = h('div', {
    class: 'win-banner fade-in' + (won ? '' : ' ws-shake'),
    style: `border-color:${won ? 'var(--green)' : 'var(--red)'}`,
  },
    h('div', { style: 'font-size:2.8rem' }, won ? '🎉' : '💥'),
    h('div', { class: 'title', style: `color:${won ? 'var(--green)' : 'var(--red)'}` },
      won ? 'MOT COMPLÉTÉ !' : 'PERDU'),
    h('p', { class: 'muted' }, won
      ? 'Toutes les lettres au bon endroit — bravo l’équipe !'
      : 'La séquence ne collait plus au mot secret.'),
  );
  w.append(banner);

  // Le mot révélé, lettre à lettre.
  const board = h('div', { class: 'ws-board' });
  for (const ch of word) board.append(h('div', { class: 'ws-cell filled' }, ch));
  w.append(h('div', { class: 'card stack' },
    h('div', { class: 'ws-len' }, won ? 'Le mot' : 'Le mot secret était'),
    board,
  ));

  if (!won) {
    w.append(h('p', { class: 'hint-line' }, `Votre séquence : ${g.built || '(vide)'}`));
  }

  w.append(playersView(g, ctx));

  if (isHost) w.append(h('button', { class: 'btn btn-primary btn-lg', onclick: () => gameSend('restart') }, '🔁 Rejouer'));
  else w.append(h('p', { class: 'hint-line' }, 'L’hôte peut relancer une partie…'));
  return w;
}
