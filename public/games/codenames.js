// ── CODENAMES — vue client (2 contre 2) ─────────────────────────────────────
// Grille de 25 mots. L'espion en chef voit les couleurs (clé secrète) et donne
// un indice (mot + nombre) ; son agent clique les mots. L'assassin = défaite.
const ui = { word: '', count: 1 };

function injectCss(id, css) {
  if (document.getElementById('css-' + id)) return;
  const s = document.createElement('style'); s.id = 'css-' + id; s.textContent = css; document.head.appendChild(s);
}

const CSS = `
.cn-scores{display:flex;gap:10px;justify-content:center}
.cn-score{flex:1;max-width:160px;text-align:center;border:1px solid var(--border);border-radius:12px;padding:8px}
.cn-score.red{border-color:#d64550}.cn-score.blue{border-color:#3d7fd6}
.cn-score.turn{box-shadow:0 0 0 2px currentColor inset}
.cn-score.red .n{color:#e06b74}.cn-score.blue .n{color:#5b95e0}
.cn-score .n{font-size:1.5rem;font-weight:800;line-height:1}
.cn-score .l{font-size:.66rem;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}
.cn-teams{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;font-size:.8rem}
.cn-team{border:1px solid var(--border);border-radius:10px;padding:6px 10px}
.cn-team.red{border-color:#d64550}.cn-team.blue{border-color:#3d7fd6}
.cn-team.on{box-shadow:0 0 0 2px currentColor inset}
.cn-team .who{font-weight:700}
.cn-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:6px}
.cn-cell{position:relative;border:1px solid var(--border);border-radius:8px;background:var(--panel);
  min-height:46px;display:flex;align-items:center;justify-content:center;text-align:center;
  font-weight:700;font-size:.74rem;padding:3px;transition:transform .1s,box-shadow .1s;word-break:break-word}
.cn-cell.pick{cursor:pointer}
.cn-cell.pick:hover{transform:translateY(-2px);box-shadow:0 6px 14px rgba(0,0,0,.35)}
/* Vue espion (cases non révélées teintées légèrement) */
.cn-cell.spy.t-red{border-color:#d64550;background:rgba(214,69,80,.14)}
.cn-cell.spy.t-blue{border-color:#3d7fd6;background:rgba(61,127,214,.14)}
.cn-cell.spy.t-neutral{border-color:#b9a88f;background:rgba(185,168,143,.12)}
.cn-cell.spy.t-assassin{border-color:#111;background:repeating-linear-gradient(45deg,#222,#222 5px,#333 5px,#333 10px);color:#fff}
/* Cases révélées (pleines) */
.cn-cell.rev{color:#fff;border-color:transparent}
.cn-cell.rev.t-red{background:#d64550}
.cn-cell.rev.t-blue{background:#3d7fd6}
.cn-cell.rev.t-neutral{background:#b9a88f;color:#2a2118}
.cn-cell.rev.t-assassin{background:#111;color:#ff5f5f}
.cn-cell.rev .word{opacity:.85;text-decoration:line-through}
.cn-clue{text-align:center}
.cn-clue .big{font-size:1.3rem;font-weight:800}
.cn-log{display:flex;flex-wrap:wrap;gap:5px;justify-content:center}
.cn-chip{font-size:.68rem;padding:3px 8px;border-radius:999px;border:1px solid var(--border);color:var(--muted)}
.cn-chip.t-red{border-color:#d64550;color:#e06b74}.cn-chip.t-blue{border-color:#3d7fd6;color:#5b95e0}
.cn-chip.t-assassin{border-color:#111;color:#ff5f5f}
.cn-num{display:flex;gap:5px;flex-wrap:wrap}
.cn-num button{width:34px;height:34px;border-radius:8px;border:1px solid var(--border);background:var(--panel);cursor:pointer;font-weight:700}
.cn-num button.on{border-color:var(--gold);background:rgba(230,180,40,.15)}
`;

export function view(g, ctx) {
  injectCss('codenames', CSS);
  const { h } = ctx;
  if (!g || !g.board) return h('div', { class: 'card waiting' }, h('div', { class: 'spinner' }), 'Distribution des mots…');
  if (g.phase === 'over') return overView(g, ctx);
  return playView(g, ctx);
}

function teamLine(g, ctx, team) {
  const { h, myId } = ctx;
  const t = g.teams[team];
  const nm = (pl, role) => pl ? `${role} ${pl.avatar || ''} ${pl.name}${pl.id === myId ? ' (toi)' : ''}` : '?';
  return h('div', { class: 'cn-team ' + team + (g.turn === team ? ' on' : ''), style: `color:${team === 'red' ? '#d64550' : '#3d7fd6'}` },
    h('div', { class: 'who' }, team === 'red' ? '🔴 Rouge' : '🔵 Bleue'),
    h('div', { class: 'muted small' }, nm(t.spy, '🕵️')),
    h('div', { class: 'muted small' }, nm(t.op, '🎯')),
  );
}

function playView(g, ctx) {
  const { h, gameSend, myId } = ctx;
  const me = g.players.find((p) => p.id === myId) || {};
  const key = (ctx.secret && ctx.secret.spymaster) ? ctx.secret.key : null;
  const iAmCurrentSpy = me.role === 'spy' && me.team === g.turn && g.step === 'clue';
  const iAmCurrentOp = me.role === 'op' && me.team === g.turn && g.step === 'guess';
  const w = h('div', { class: 'stack' });

  // En-tête : scores + tours.
  w.append(h('div', { class: 'cn-scores' },
    h('div', { class: 'cn-score red' + (g.turn === 'red' ? ' turn' : ''), style: 'color:#d64550' },
      h('div', { class: 'n' }, `${g.totals.red - g.found.red}`), h('div', { class: 'l' }, 'Rouge restants')),
    h('div', { class: 'cn-score blue' + (g.turn === 'blue' ? ' turn' : ''), style: 'color:#3d7fd6' },
      h('div', { class: 'n' }, `${g.totals.blue - g.found.blue}`), h('div', { class: 'l' }, 'Bleu restants')),
  ));
  w.append(h('div', { class: 'cn-teams' }, teamLine(g, ctx, 'red'), teamLine(g, ctx, 'blue')));
  if (key) w.append(h('p', { class: 'hint-line' }, '👑 Tu es ESPION EN CHEF — tu vois les couleurs. Donne un indice à ton agent (sans dire un mot de la grille).'));

  // Grille 5×5.
  const grid = h('div', { class: 'cn-grid' });
  for (const c of g.board) {
    const shown = c.revealed ? c.type : (key ? key[c.i] : null);
    const cls = 'cn-cell' + (c.revealed ? ' rev' : (shown ? ' spy' : '')) + (shown ? ' t-' + shown : '') + (iAmCurrentOp && !c.revealed ? ' pick' : '');
    grid.append(h('div', {
      class: cls,
      onclick: (iAmCurrentOp && !c.revealed) ? () => gameSend('guess', { index: c.i }) : undefined,
    }, h('span', { class: 'word' }, c.word)));
  }
  w.append(grid);

  // Zone d'indice / d'action.
  if (g.step === 'clue') {
    if (iAmCurrentSpy) {
      const send = () => { const word = (ui.word || '').trim(); if (!word || /\s/.test(word)) return; gameSend('clue', { word, count: ui.count }); ui.word = ''; };
      const nums = h('div', { class: 'cn-num' }, ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) =>
        h('button', { class: n === ui.count ? 'on' : '', onclick: () => { ui.count = n; ctx.rerender(); } }, String(n))));
      w.append(h('div', { class: 'card stack' },
        h('div', { class: 'kicker' }, 'Ton indice'),
        h('input', { class: 'input', maxlength: 24, placeholder: 'Un seul mot…', value: ui.word || '', oninput: (e) => { ui.word = e.target.value; }, onkeydown: (e) => { if (e.key === 'Enter') send(); } }),
        h('div', { class: 'muted small' }, 'Combien de mots visés ?'), nums,
        h('button', { class: 'btn btn-primary', onclick: send }, '📣 Donner l’indice'),
      ));
    } else {
      const spy = g.teams[g.turn].spy;
      w.append(h('div', { class: 'card center' }, h('div', { class: 'dots-anim' }, `L’espion en chef ${g.turn === 'red' ? 'rouge' : 'bleu'} (${spy ? spy.name : '?'}) réfléchit à son indice`)));
    }
  } else if (g.step === 'guess' && g.clue) {
    const card = h('div', { class: 'card stack cn-clue' },
      h('div', { class: 'kicker' }, `Indice de l’équipe ${g.turn === 'red' ? 'rouge' : 'bleue'}`),
      h('div', { class: 'big' }, `${g.clue.word} — ${g.clue.count}`),
      h('div', { class: 'muted small' }, `Essais restants : ${g.guessesLeft}`),
    );
    if (iAmCurrentOp) card.append(h('button', { class: 'btn btn-ghost', onclick: () => gameSend('endTurn') }, '✋ Terminer le tour'));
    else card.append(h('p', { class: 'hint-line' }, me.team === g.turn ? 'Ton agent devine…' : 'À l’équipe adverse de jouer.'));
    w.append(card);
  }

  // Journal des mots retournés.
  if (g.log && g.log.length) {
    const log = h('div', { class: 'cn-log' });
    g.log.forEach((r) => log.append(h('span', { class: 'cn-chip t-' + r.type }, r.word)));
    w.append(h('div', { class: 'card stack' }, h('div', { class: 'kicker' }, 'Mots retournés'), log));
  }
  return w;
}

function overView(g, ctx) {
  const { h, gameSend, isHost, myId } = ctx;
  const w = h('div', { class: 'stack' });
  const red = g.winner === 'red';
  const iWon = (g.players.find((p) => p.id === myId) || {}).team === g.winner;
  w.append(h('div', { class: 'win-banner fade-in' },
    h('div', { style: 'font-size:2.6rem' }, red ? '🔴' : '🔵'),
    h('div', { class: 'title', style: `color:${red ? '#d64550' : '#3d7fd6'}` }, `L’équipe ${red ? 'ROUGE' : 'BLEUE'} gagne`),
    h('p', { class: 'muted' }, iWon ? 'Bravo, mission accomplie !' : 'Dommage — l’assassin ou l’adversaire a eu le dernier mot.'),
  ));
  // Grille révélée.
  const grid = h('div', { class: 'cn-grid' });
  for (const c of g.board) grid.append(h('div', { class: 'cn-cell rev t-' + c.type }, h('span', { class: 'word' }, c.word)));
  w.append(h('div', { class: 'card stack' }, h('div', { class: 'kicker' }, 'La grille complète'), grid));
  w.append(h('div', { class: 'cn-teams' }, teamLine(g, ctx, 'red'), teamLine(g, ctx, 'blue')));
  if (isHost) w.append(h('button', { class: 'btn btn-danger btn-lg', onclick: () => gameSend('restart') }, '🔁 Rejouer'));
  else w.append(h('p', { class: 'hint-line' }, 'L’hôte peut relancer une partie…'));
  return w;
}
