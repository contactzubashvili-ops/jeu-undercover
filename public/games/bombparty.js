// ── BOMB PARTY — vue client ─────────────────────────────────────────────────
// Chacun son tour, un mot contenant la syllabe imposée avant que la bombe saute.
let draft = '';
let lastUsedCount = -1;
let lastLivesTotal = null;
let showBoom = false;
let tickerOn = false;

function injectCss(id, css) {
  if (document.getElementById('css-' + id)) return;
  const s = document.createElement('style');
  s.id = 'css-' + id;
  s.textContent = css;
  document.head.appendChild(s);
}

// Temps CACHÉ : le joueur ne voit pas de compte à rebours. On entretient la
// tension par des tressaillements ALÉATOIRES de la bombe (elle peut sauter à
// tout moment).
function installTicker() {
  if (tickerOn) return;
  tickerOn = true;
  setInterval(() => {
    const bomb = document.getElementById('bp-bomb');
    if (!bomb) return;
    const r = Math.random();
    bomb.classList.toggle('bp-warn', r < 0.20);
    bomb.classList.toggle('bp-crit', r < 0.06);
  }, 300);
}

const CSS = `
.bp-stage{ display:flex; flex-direction:column; align-items:center; gap:10px; padding:22px 12px; }
.bp-bomb{ display:flex; flex-direction:column; align-items:center; gap:6px; }
.bp-emoji{ font-size:3.4rem; line-height:1; display:inline-block; filter:drop-shadow(0 2px 6px rgba(0,0,0,.4));
  animation:bp-pulse 1.6s ease-in-out infinite; transform-origin:center bottom; }
.bp-bomb.bp-warn .bp-emoji{ animation:bp-pulse .8s ease-in-out infinite; }
.bp-bomb.bp-crit .bp-emoji{ animation:bp-shake .22s linear infinite; }
.bp-syl{ font-family:var(--font-title,serif); font-weight:800; font-size:3rem; letter-spacing:.12em; text-transform:uppercase;
  color:var(--gold); text-shadow:0 2px 0 rgba(0,0,0,.35); }
.bp-bomb.bp-crit ~ .bp-syl{ color:var(--red); }
.bp-syl-hint{ color:var(--muted); font-size:.85rem; }
.bp-hidden{ color:var(--muted); font-size:.8rem; font-style:italic; }
.bp-turn{ display:flex; align-items:center; gap:10px; justify-content:center; font-size:1.05rem; }
.bp-turn .bp-av{ font-size:1.6rem; }
.bp-players{ display:grid; grid-template-columns:repeat(auto-fill,minmax(120px,1fr)); gap:10px; }
.bp-player{ display:flex; flex-direction:column; align-items:center; gap:4px; padding:10px 8px; border:1px solid var(--border);
  border-radius:12px; background:var(--panel); transition:border-color .15s, box-shadow .15s; }
.bp-player.active{ border-color:var(--gold); box-shadow:0 0 0 2px rgba(255,176,32,.25) inset, 0 0 14px rgba(255,176,32,.2); }
.bp-player.dead{ opacity:.5; filter:grayscale(1); }
.bp-player.off{ opacity:.4; }
.bp-av{ font-size:1.8rem; line-height:1; }
.bp-nm{ font-size:.85rem; text-align:center; color:var(--ink); max-width:110px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.bp-hearts{ font-size:.95rem; letter-spacing:1px; min-height:1.1em; }
.bp-boom{ position:fixed; inset:0; display:flex; align-items:center; justify-content:center; pointer-events:none; z-index:60; }
.bp-boom span{ font-family:var(--font-title,serif); font-weight:900; font-size:5rem; color:var(--red); text-shadow:0 0 20px rgba(240,85,95,.6);
  animation:bp-boom .7s ease-out forwards; }
@keyframes bp-pulse{ 0%,100%{ transform:scale(1); } 50%{ transform:scale(1.09); } }
@keyframes bp-shake{ 0%,100%{ transform:translate(0,0) rotate(0); } 25%{ transform:translate(-3px,1px) rotate(-5deg); }
  75%{ transform:translate(3px,-1px) rotate(5deg); } }
@keyframes bp-boom{ 0%{ transform:scale(.3); opacity:0; } 18%{ opacity:1; } 55%{ transform:scale(1.2); opacity:1; } 100%{ transform:scale(1.5); opacity:0; } }
`;

export function view(g, ctx) {
  const { h } = ctx;
  injectCss('bombparty', CSS);
  installTicker();

  // Effet BOOM : total de vies qui baisse → une bombe a explosé.
  const total = (g.players || []).reduce((n, p) => n + (p.vies || 0), 0);
  showBoom = lastLivesTotal !== null && total < lastLivesTotal;
  lastLivesTotal = total;

  // On efface la saisie dès qu'un mot est validé (syllabe/joueur qui changent).
  if (g.usedCount !== lastUsedCount) { lastUsedCount = g.usedCount; draft = ''; }

  if (g.phase === 'over') return overView(g, ctx);
  return playView(g, ctx);
}

function playView(g, ctx) {
  const { h, gameSend } = ctx;
  const w = h('div', { class: 'stack' });

  w.append(h('div', { class: 'phase-banner' },
    h('span', { class: 'kicker' }, '🧨 Bomb Party'),
    h('h2', {}, 'Un mot avant l’explosion !'),
    h('p', {}, `Trouvez vite un mot qui contient la syllabe. ${g.usedCount || 0} mot${(g.usedCount || 0) > 1 ? 's' : ''} joué${(g.usedCount || 0) > 1 ? 's' : ''}.`),
  ));

  // Scène : bombe qui vibre + syllabe géante + minuteur.
  w.append(h('div', { class: 'card' },
    h('div', { class: 'bp-stage' },
      h('div', { class: 'bp-bomb', id: 'bp-bomb' }, h('span', { class: 'bp-emoji' }, '💣')),
      h('div', { class: 'bp-syl' }, g.syllabe ? String(g.syllabe).toUpperCase() : '…'),
      h('div', { class: 'bp-syl-hint' }, 'syllabe imposée'),
      h('div', { class: 'bp-hidden' }, '🙈 temps caché — ça peut sauter à tout moment !'),
    ),
  ));

  const mine = (g.players || []).find((p) => p.id === ctx.myId);
  const iAmAlive = mine && mine.alive;
  const myTurn = g.activeId === ctx.myId;

  if (myTurn && iAmAlive) {
    const send = () => { const t = draft.trim(); if (t) { gameSend('word', { text: t }); } };
    const inp = h('input', {
      class: 'input', id: 'bomb-input', maxlength: 30, autocomplete: 'off',
      placeholder: `un mot avec « ${g.syllabe || '?'} »…`, value: draft,
      oninput: (e) => { draft = e.target.value; },
      onkeydown: (e) => { if (e.key === 'Enter') send(); },
    });
    w.append(h('div', { class: 'card stack' }, inp,
      h('button', { class: 'btn btn-primary btn-lg', onclick: send }, '💥 Valider'),
    ));
  } else {
    const act = (g.players || []).find((p) => p.id === g.activeId);
    w.append(h('div', { class: 'card' },
      h('div', { class: 'bp-turn' },
        h('span', { class: 'bp-av' }, act ? act.avatar : '⏳'),
        h('span', {}, act ? `Au tour de ${act.name}…` : 'En attente…'),
      ),
      !iAmAlive ? h('p', { class: 'hint-line' }, '💀 Vous êtes éliminé — vous regardez la fin.') : '',
    ));
  }

  if (g.lastWord) {
    w.append(h('p', { class: 'hint-line' }, `Dernier mot validé : « ${g.lastWord} »`));
  }

  w.append(h('div', { class: 'card stack' },
    h('div', { class: 'kicker' }, 'Joueurs'),
    playersGrid(g, ctx),
  ));

  if (showBoom) w.append(boomOverlay(ctx));
  return w;
}

function playersGrid(g, ctx) {
  const { h } = ctx;
  const grid = h('div', { class: 'bp-players' });
  for (const p of (g.players || [])) {
    let cls = 'bp-player';
    if (p.isActive) cls += ' active';
    if (!p.alive) cls += ' dead';
    if (p.connected === false) cls += ' off';
    const hearts = p.alive
      ? h('span', { class: 'bp-hearts' }, '❤️'.repeat(Math.max(0, p.vies)) || '—')
      : h('span', { class: 'bp-hearts' }, '💀');
    grid.append(h('div', { class: cls },
      h('span', { class: 'bp-av' }, p.avatar),
      h('span', { class: 'bp-nm' }, p.name + (p.id === ctx.myId ? ' (vous)' : '')),
      hearts,
    ));
  }
  return grid;
}

function boomOverlay(ctx) {
  const { h } = ctx;
  return h('div', { class: 'bp-boom' }, h('span', {}, 'BOOM 💥'));
}

function overView(g, ctx) {
  const { h, gameSend, isHost } = ctx;
  const rank = g.ranking || [...(g.players || [])];
  const champ = rank.find((p) => p.id === g.winnerId) || rank[0];
  const w = h('div', { class: 'stack' });

  w.append(h('div', { class: 'win-banner fade-in' },
    h('div', { style: 'font-size:3rem' }, '🏆'),
    h('div', { class: 'title', style: 'color:var(--gold-2)' },
      champ ? `${champ.name} survit à la bombe !` : 'Partie terminée'),
  ));

  const rows = h('div', { class: 'stack', style: 'gap:8px' });
  rank.forEach((p, i) => rows.append(h('div', { class: 'score-row' + (i === 0 ? ' top' : '') },
    h('div', { class: 'rank' }, String(i + 1)),
    h('div', { class: 'av' }, p.avatar),
    h('div', { class: 'nm' }, p.name + (p.id === ctx.myId ? ' (vous)' : '')),
    h('div', { class: 'pts' }, p.alive ? `${p.vies} ❤️` : '💀'),
  )));
  w.append(h('div', { class: 'card stack' }, h('div', { class: 'kicker' }, 'Classement'), rows));

  if (isHost) w.append(h('button', { class: 'btn btn-primary btn-lg', onclick: () => gameSend('restart') }, '🔁 Rejouer'));
  else w.append(h('p', { class: 'hint-line' }, 'L’hôte peut relancer une partie…'));
  return w;
}
