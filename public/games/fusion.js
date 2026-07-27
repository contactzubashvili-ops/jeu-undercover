// ── FUSION — vue client ────────────────────────────────────────────────────
// Trouvez le mot qui relie deux mots. Les réponses identiques se regroupent.
let draft = '';
let lastRound = -1;
let mergeSel = null;

export function view(g, ctx) {
  const { h } = ctx;
  if (g.round !== lastRound) { lastRound = g.round; draft = ''; mergeSel = null; }
  if (g.phase === 'submit') return submitView(g, ctx);
  if (g.phase === 'reveal') return revealView(g, ctx);
  if (g.phase === 'over') return overView(g, ctx);
  return h('div', {});
}

function promptBox(g, ctx) {
  const { h } = ctx;
  return h('div', { class: 'fusion-prompt' },
    h('span', { class: 'fw' }, g.prompt ? g.prompt[0] : '?'),
    h('span', { class: 'plus' }, '+'),
    h('span', { class: 'fw' }, g.prompt ? g.prompt[1] : '?'),
  );
}

function submitView(g, ctx) {
  const { h, gameSend, me, isHost } = ctx;
  const mine = g.players.find((p) => p.id === ctx.myId);
  const done = mine && mine.submitted;
  const w = h('div', { class: 'stack' });
  w.append(h('div', { class: 'phase-banner' },
    h('span', { class: 'kicker' }, `Manche ${g.round} / ${g.totalRounds}`),
    h('h2', {}, 'Quel mot relie ces deux-là ?'),
    h('p', {}, 'Trouvez le même mot que les autres pour marquer.'),
  ));
  w.append(h('div', { class: 'card center stack' }, promptBox(g, ctx), g.timer ? ctx.timerEl(g.timer) : ''));

  if (!done) {
    const inp = h('input', {
      class: 'input', id: 'fusion-input', maxlength: 40, placeholder: 'Votre mot d’association…',
      value: draft, autocomplete: 'off',
      oninput: (e) => { draft = e.target.value; },
      onkeydown: (e) => { if (e.key === 'Enter' && draft.trim()) { gameSend('submit', { text: draft.trim() }); draft = ''; } },
    });
    w.append(h('div', { class: 'card stack' }, inp,
      h('button', { class: 'btn btn-primary', onclick: () => { if (draft.trim()) { gameSend('submit', { text: draft.trim() }); draft = ''; } } }, '✔️ Valider ma réponse'),
    ));
  } else {
    w.append(h('div', { class: 'card center stack' },
      h('div', { style: 'font-size:1.5rem' }, '✅'),
      h('div', {}, 'Réponse envoyée — on attend les autres.'),
    ));
  }

  w.append(h('div', { class: 'card stack center' },
    h('div', { class: 'vote-progress' }, `${g.submittedCount} / ${g.totalPlayers} ont répondu`),
    h('div', { class: 'vote-bar' }, h('i', { style: `width:${ctx.pct(g.submittedCount, g.totalPlayers)}%` })),
    isHost ? h('button', { class: 'btn btn-ghost btn-sm', onclick: () => gameSend('forceReveal') }, 'Révéler maintenant (hôte)') : '',
  ));
  return w;
}

function revealView(g, ctx) {
  const { h, gameSend, isHost } = ctx;
  const w = h('div', { class: 'stack' });
  w.append(h('div', { class: 'phase-banner' }, h('span', { class: 'kicker' }, `Manche ${g.round} / ${g.totalRounds}`), h('h2', {}, 'Les réponses !')));
  w.append(h('div', { class: 'card center' }, promptBox(g, ctx)));

  const grid = h('div', { class: 'fusion-groups' });
  for (const grp of (g.groups || [])) {
    const card = h('div', {
      class: 'fusion-group' + (grp.scored ? ' scored' : '') + (mergeSel === grp.key ? ' sel' : ''),
      onclick: isHost ? () => {
        if (!mergeSel) { mergeSel = grp.key; ctx.rerender(); }
        else if (mergeSel === grp.key) { mergeSel = null; ctx.rerender(); }
        else { gameSend('merge', { a: mergeSel, b: grp.key }); mergeSel = null; }
      } : undefined,
    },
      h('div', { class: 'fg-answer' }, grp.answer),
      h('div', { class: 'fg-players' }, ...grp.players.map((p) => h('span', { class: 'fg-av', title: p.name }, p.avatar))),
      grp.scored ? h('div', { class: 'fg-pts' }, '+1') : '',
    );
    grid.append(card);
  }
  w.append(h('div', { class: 'card stack' }, grid,
    isHost ? h('p', { class: 'hint-line' }, mergeSel ? 'Cliquez un 2ᵉ groupe pour le fusionner avec le sélectionné.' : 'Astuce hôte : cliquez deux groupes équivalents pour les fusionner.') : '',
  ));

  w.append(scores(g, ctx));
  if (isHost) w.append(h('button', { class: 'btn btn-primary btn-lg', onclick: () => gameSend('next') }, g.round >= g.totalRounds ? '🏁 Voir le classement' : '➡️ Manche suivante'));
  else w.append(h('p', { class: 'hint-line' }, 'L’hôte lance la suite…'));
  return w;
}

function overView(g, ctx) {
  const { h, gameSend, isHost } = ctx;
  const rank = g.ranking || [];
  const w = h('div', { class: 'stack' });
  const teamWin = g.teamMode && g.teamRanking && g.teamRanking[0];
  const champ = rank[0];
  w.append(h('div', { class: 'win-banner fade-in' },
    h('div', { style: 'font-size:3rem' }, '🏆'),
    h('div', { class: 'title', style: 'color:var(--gold-2)' },
      teamWin ? `Équipe ${teamWin.team} gagne !` : (champ ? `${champ.name} gagne !` : 'Partie terminée')),
  ));
  if (g.teamMode && g.teamRanking) {
    const rows = h('div', { class: 'stack', style: 'gap:8px' });
    g.teamRanking.forEach((t, i) => rows.append(h('div', { class: 'score-row' + (i === 0 ? ' top' : '') },
      h('div', { class: 'rank' }, String(i + 1)),
      h('div', { class: 'nm' }, `Équipe ${t.team}`),
      h('div', { class: 'pts' }, `${t.score} pt${t.score > 1 ? 's' : ''}`),
    )));
    w.append(h('div', { class: 'card stack' }, h('div', { class: 'kicker' }, 'Classement des équipes'), rows));
  }
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
