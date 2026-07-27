// ── ÉCHELLE (ladder) — vue client ──────────────────────────────────────────
// Chacun reçoit un nombre secret 1..100 et un thème. On écrit un exemple à la
// bonne « ampleur ». L'hôte classe les réponses du plus petit au plus grand,
// à l'aveugle. On révèle : bien croissant = victoire collective.
let draft = '';
let lastRound = -1;

function injectCss(id, css) {
  if (document.getElementById('css-' + id)) return;
  const s = document.createElement('style');
  s.id = 'css-' + id;
  s.textContent = css;
  document.head.appendChild(s);
}

const CSS = `
.ladder-theme{ text-align:center; padding:14px 10px; }
.ladder-theme .lk{ font-size:.72rem; letter-spacing:.14em; text-transform:uppercase; color:var(--muted); }
.ladder-theme .lt{ font-size:1.7rem; font-weight:800; color:var(--gold-2); margin-top:6px; line-height:1.2; }
.ladder-number{ display:flex; flex-direction:column; align-items:center; gap:4px; padding:16px; }
.ladder-number .cap{ font-size:.72rem; letter-spacing:.1em; text-transform:uppercase; color:var(--muted); }
.ladder-number .big{ font-size:3.2rem; font-weight:900; color:var(--violet); line-height:1;
  text-shadow:0 2px 12px color-mix(in srgb, var(--violet) 45%, transparent); }
.ladder-list{ display:flex; flex-direction:column; gap:8px; }
.ladder-item{ display:flex; align-items:center; gap:10px; padding:10px 12px;
  background:var(--panel); border:1px solid var(--border); border-radius:12px; }
.ladder-item .pos{ width:24px; height:24px; flex:0 0 auto; display:flex; align-items:center; justify-content:center;
  border-radius:50%; background:var(--faint); color:var(--muted); font-size:.8rem; font-weight:700; }
.ladder-item .ans{ flex:1 1 auto; font-weight:600; }
.ladder-item .who{ color:var(--muted); font-size:.8rem; }
.ladder-item .arrows{ display:flex; flex-direction:column; gap:2px; }
.ladder-item .arrows button{ line-height:1; padding:1px 7px; }
.ladder-num{ flex:0 0 auto; min-width:44px; text-align:center; font-weight:900; font-size:1.15rem;
  color:var(--gold-2); opacity:0; transform:translateY(-6px); animation:ladderPop .45s ease forwards; }
@keyframes ladderPop{ to{ opacity:1; transform:translateY(0); } }
.ladder-scale{ display:flex; justify-content:space-between; font-size:.72rem; color:var(--muted); padding:0 4px 4px; }
`;

export function view(g, ctx) {
  const { h } = ctx;
  injectCss('ladder', CSS);
  if (g.round !== lastRound) { lastRound = g.round; draft = ''; }
  if (g.phase === 'answer') return answerView(g, ctx);
  if (g.phase === 'order') return orderView(g, ctx);
  if (g.phase === 'reveal') return revealView(g, ctx);
  if (g.phase === 'over') return overView(g, ctx);
  return h('div', {});
}

function themeBox(g, ctx) {
  const { h } = ctx;
  return h('div', { class: 'card ladder-theme' },
    h('div', { class: 'lk' }, 'Thème de la manche'),
    h('div', { class: 'lt' }, g.theme || '—'),
  );
}

function answerView(g, ctx) {
  const { h, gameSend } = ctx;
  const mine = g.players.find((p) => p.id === ctx.myId);
  const done = mine && mine.answered;
  const num = ctx.secret ? ctx.secret.ladderNumber : null;
  const w = h('div', { class: 'stack' });

  w.append(h('div', { class: 'phase-banner' },
    h('span', { class: 'kicker' }, `Manche ${g.round} / ${g.totalRounds}`),
    h('h2', {}, 'Trouvez le bon exemple'),
    h('p', {}, 'Petit nombre = petit / faible. Grand nombre = grand / fort.'),
  ));
  w.append(themeBox(g, ctx));

  if (num != null) {
    w.append(h('div', { class: 'card ladder-number' },
      h('div', { class: 'cap' }, 'Votre nombre secret'),
      h('div', { class: 'big' }, String(num)),
      h('div', { class: 'muted small' }, 'sur une échelle de 1 à 100'),
    ));
  }

  if (num == null) {
    w.append(h('div', { class: 'card center' }, h('p', { class: 'muted' }, 'Vous rejoindrez la prochaine manche.')));
  } else if (!done) {
    const inp = h('input', {
      class: 'input', id: 'ladder-input', maxlength: 60, placeholder: 'Un exemple à cette hauteur…',
      value: draft, autocomplete: 'off',
      oninput: (e) => { draft = e.target.value; },
      onkeydown: (e) => { if (e.key === 'Enter' && draft.trim()) { gameSend('answer', { text: draft.trim() }); draft = ''; } },
    });
    w.append(h('div', { class: 'card stack' }, inp,
      h('button', { class: 'btn btn-primary', onclick: () => { if (draft.trim()) { gameSend('answer', { text: draft.trim() }); draft = ''; } } }, '✔️ Valider ma réponse'),
    ));
  } else {
    w.append(h('div', { class: 'card center stack' },
      h('div', { style: 'font-size:1.5rem' }, '✅'),
      h('div', {}, 'Réponse envoyée — on attend les autres.'),
    ));
  }

  w.append(h('div', { class: 'card stack center' },
    h('div', { class: 'vote-progress' }, `${g.answeredCount} / ${g.total} ont répondu`),
    h('div', { class: 'vote-bar' }, h('i', { style: `width:${ctx.pct(g.answeredCount, g.total)}%` })),
  ));
  return w;
}

function orderView(g, ctx) {
  const { h, gameSend, isHost } = ctx;
  const ordre = g.ordre || [];
  const w = h('div', { class: 'stack' });

  w.append(h('div', { class: 'phase-banner' },
    h('span', { class: 'kicker' }, `Manche ${g.round} / ${g.totalRounds}`),
    h('h2', {}, 'Classez du plus petit au plus grand'),
    h('p', {}, isHost ? 'Réordonnez les réponses selon leur nombre supposé, à l’aveugle.' : 'L’hôte classe les réponses…'),
  ));
  w.append(themeBox(g, ctx));

  w.append(h('div', { class: 'ladder-scale' }, h('span', {}, '↑ 1 (plus petit)'), h('span', {}, '100 (plus grand) ↓')));

  const list = h('div', { class: 'card ladder-list' });
  ordre.forEach((e, i) => {
    const item = h('div', { class: 'ladder-item' },
      h('div', { class: 'pos' }, String(i + 1)),
      h('div', { class: 'ans' }, e.answer, h('span', { class: 'who' }, ` — ${e.name}`)),
    );
    if (isHost) {
      item.append(h('div', { class: 'arrows' },
        h('button', { class: 'btn btn-ghost btn-sm', disabled: i === 0 ? true : undefined,
          onclick: () => { if (i > 0) gameSend('move', { id: e.id, dir: 'up' }); } }, '↑'),
        h('button', { class: 'btn btn-ghost btn-sm', disabled: i === ordre.length - 1 ? true : undefined,
          onclick: () => { if (i < ordre.length - 1) gameSend('move', { id: e.id, dir: 'down' }); } }, '↓'),
      ));
    }
    list.append(item);
  });
  w.append(list);

  if (isHost) w.append(h('button', { class: 'btn btn-primary btn-lg', onclick: () => gameSend('validate') }, '✅ Valider le classement'));
  else w.append(h('p', { class: 'hint-line' }, 'L’hôte classe… patientez.'));
  return w;
}

function revealView(g, ctx) {
  const { h, gameSend, isHost } = ctx;
  const reveal = g.reveal || [];
  const w = h('div', { class: 'stack' });

  w.append(h('div', { class: 'win-banner fade-in', style: `border-color:${g.gagne ? 'var(--green)' : 'var(--red)'}` },
    h('div', { style: 'font-size:2.6rem' }, g.gagne ? '🎉' : '💥'),
    h('div', { class: 'title', style: `color:${g.gagne ? 'var(--green)' : 'var(--red)'}` },
      g.gagne ? 'Victoire collective !' : 'Échec collectif'),
    h('p', { class: 'muted' }, g.gagne ? 'Les nombres sont bien croissants. +1 pour tout le monde.' : 'Les nombres ne montent pas dans l’ordre.'),
  ));
  w.append(themeBox(g, ctx));

  const list = h('div', { class: 'card ladder-list' });
  reveal.forEach((e, i) => {
    list.append(h('div', { class: 'ladder-item' },
      h('div', { class: 'pos' }, String(i + 1)),
      h('div', { class: 'ans' }, e.answer, h('span', { class: 'who' }, ` — ${e.name}`)),
      h('div', { class: 'ladder-num', style: `animation-delay:${i * 0.18}s` }, String(e.number)),
    ));
  });
  w.append(list);

  w.append(scores(g, ctx));
  if (isHost) w.append(h('button', { class: 'btn btn-primary btn-lg', onclick: () => gameSend('next') }, g.round >= g.totalRounds ? '🏁 Voir le classement' : '➡️ Manche suivante'));
  else w.append(h('p', { class: 'hint-line' }, 'L’hôte lance la suite…'));
  return w;
}

function overView(g, ctx) {
  const { h, gameSend, isHost } = ctx;
  const rank = g.ranking || [];
  const w = h('div', { class: 'stack' });
  const champ = rank[0];
  w.append(h('div', { class: 'win-banner fade-in' },
    h('div', { style: 'font-size:3rem' }, '🪜'),
    h('div', { class: 'title', style: 'color:var(--gold-2)' }, 'Partie terminée'),
    h('p', { class: 'muted' }, champ ? `${champ.score} point${champ.score > 1 ? 's' : ''} d’équipe` : ''),
  ));
  w.append(scores(g, ctx, true));
  if (isHost) w.append(h('button', { class: 'btn btn-primary btn-lg', onclick: () => gameSend('restart') }, '🔁 Rejouer'));
  return w;
}

function scores(g, ctx, final) {
  const { h } = ctx;
  const ranked = [...g.players].sort((a, b) => b.score - a.score);
  const rows = h('div', { class: 'stack', style: 'gap:8px' });
  ranked.forEach((p, i) => rows.append(h('div', { class: 'score-row' + (final && i === 0 ? ' top' : '') },
    h('div', { class: 'rank' }, String(i + 1)),
    h('div', { class: 'av' }, p.avatar),
    h('div', { class: 'nm' }, p.name),
    h('div', { class: 'pts' }, `${p.score} pt${p.score > 1 ? 's' : ''}`),
  )));
  return h('div', { class: 'card stack' }, h('div', { class: 'kicker' }, 'Scores'), rows);
}
