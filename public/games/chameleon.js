// ── CHAMELEON — vue client ──────────────────────────────────────────────────
// 16 mots d'une catégorie affichés à tous ; un mot secret que tous connaissent
// sauf le Caméléon. Indices à tour de rôle, vote façon Undercover, puis le
// Caméléon démasqué tente de deviner le mot parmi les 16.
const ui = { key: '', clueDraft: '', voteSel: null };

function injectCss(id, css) {
  if (document.getElementById('css-' + id)) return;
  const s = document.createElement('style'); s.id = 'css-' + id; s.textContent = css; document.head.appendChild(s);
}

const CSS = `
.ch-cat{text-align:center;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--green)}
.ch-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.ch-w{position:relative;border:1px solid var(--border);border-radius:10px;background:var(--panel);
  padding:12px 6px;text-align:center;font-weight:700;font-size:.92rem;min-height:52px;display:flex;
  align-items:center;justify-content:center;transition:transform .1s,border-color .1s,box-shadow .1s}
.ch-w.secret{border-color:var(--green);box-shadow:0 0 0 2px rgba(107,191,89,.35) inset;background:rgba(107,191,89,.12)}
.ch-w.pick{cursor:pointer}
.ch-w.pick:hover{transform:translateY(-2px) scale(1.03);border-color:var(--gold);box-shadow:0 6px 16px rgba(0,0,0,.35)}
.ch-w .tagsec{position:absolute;top:-8px;left:50%;transform:translateX(-50%);font-size:.55rem;font-weight:800;
  background:var(--green);color:#06210a;border-radius:999px;padding:1px 7px;text-transform:uppercase;letter-spacing:.05em}
.ch-role{display:flex;justify-content:center}
.ch-turn{text-align:center;font-weight:700}
.ch-turn.mine{color:var(--green)}
.ch-clues{display:flex;flex-direction:column;gap:6px}
.ch-clue{display:flex;align-items:center;gap:8px;border:1px solid var(--border);border-radius:10px;padding:7px 10px}
.ch-clue .nm{font-weight:700}
.ch-clue .tx{margin-left:auto;color:var(--muted)}
.ch-votebar{height:8px;border-radius:4px;background:var(--faint);overflow:hidden}
.ch-votebar i{display:block;height:100%;background:linear-gradient(90deg,var(--green),var(--gold))}
.ch-vgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px}
.ch-vc{border:1px solid var(--border);border-radius:12px;padding:10px;text-align:center;background:var(--panel)}
.ch-vc.sel{border-color:var(--green);box-shadow:0 0 0 2px rgba(107,191,89,.4) inset}
.ch-vc.pick{cursor:pointer}
.ch-vc.dead{opacity:.5}
.ch-vc .av{font-size:1.4rem}
`;

export function view(g, ctx) {
  injectCss('chameleon', CSS);
  const { h } = ctx;
  if (!g || !g.words) return h('div', { class: 'card waiting' }, h('div', { class: 'spinner' }), 'Préparation…');
  const key = g.phase + '#' + g.round + '#' + g.cycle;
  if (key !== ui.key) { ui.key = key; if (g.phase === 'clues') { /* garde le brouillon */ } ui.voteSel = null; }

  const w = h('div', { class: 'stack' });
  w.append(h('div', { class: 'phase-banner', style: 'margin:0' },
    h('span', { class: 'kicker' }, `Manche ${g.round}/${g.totalRounds}`),
    h('h2', {}, '🦎 Chameleon'),
    h('div', { class: 'ch-cat' }, g.categorie),
  ));

  // Rappel secret (mot, ou statut Caméléon).
  const sec = ctx.secret || {};
  if (g.phase !== 'result') {
    if (sec.isChameleon) w.append(h('div', { class: 'role-chip', style: 'color:var(--green);border-color:var(--green);align-self:center' }, '🦎 Tu es le CAMÉLÉON — tu n’as aucun mot. Fais semblant !'));
    else if (sec.word) w.append(h('div', { class: 'role-chip', style: 'align-self:center' }, `Ton mot secret : ${sec.word}`));
  }

  // Grille des 16 mots.
  w.append(gridEl(g, ctx));

  if (g.phase === 'clues') cluesPhase(g, ctx, w);
  else if (g.phase === 'vote') votePhase(g, ctx, w);
  else if (g.phase === 'guess') guessPhase(g, ctx, w);
  else if (g.phase === 'result') resultPhase(g, ctx, w);

  return w;
}

function gridEl(g, ctx) {
  const { h, gameSend } = ctx;
  const sec = ctx.secret || {};
  const canPick = g.phase === 'guess' && sec.isChameleon;
  const grid = h('div', { class: 'ch-grid' });
  for (const word of g.words) {
    const isSecretForMe = !sec.isChameleon && sec.word && norm(word) === norm(sec.word);
    const isRevealSecret = g.phase === 'result' && g.secret && norm(word) === norm(g.secret);
    const cell = h('div', {
      class: 'ch-w' + ((isSecretForMe || isRevealSecret) ? ' secret' : '') + (canPick ? ' pick' : ''),
      onclick: canPick ? () => { if (confirmPick(word)) gameSend('guess', { text: word }); } : undefined,
    }, word);
    if (isRevealSecret) cell.append(h('span', { class: 'tagsec' }, 'mot secret'));
    grid.append(cell);
  }
  return grid;
}
function confirmPick() { return true; } // clic direct (pas de popup)

function cluesPhase(g, ctx, w) {
  const { h, gameSend, myId } = ctx;
  const me = ctx.byId(myId);
  const active = ctx.byId(g.activeId);
  const myTurn = g.activeId === myId;
  w.append(h('div', { class: 'ch-turn' + (myTurn ? ' mine' : '') },
    active ? (myTurn ? '🖊️ À toi de donner un indice (un mot)' : `Au tour de ${active.avatar || ''} ${active.name}`) : 'Préparation…'));

  if (myTurn) {
    const send = () => { const v = (ui.clueDraft || '').trim(); if (!v) return; gameSend('clue', { text: v }); ui.clueDraft = ''; };
    const inp = h('input', { class: 'input', maxlength: 40, placeholder: 'Un mot lié au mot secret…', value: ui.clueDraft || '',
      oninput: (e) => { ui.clueDraft = e.target.value; }, onkeydown: (e) => { if (e.key === 'Enter') send(); } });
    w.append(h('div', { class: 'card stack' }, inp, h('button', { class: 'btn btn-primary', onclick: send }, '✔️ Valider mon indice')));
  }

  w.append(cluesList(g, ctx));

  // Prêt à voter (majorité).
  const d = g.discussion;
  if (g.voteReady && d) {
    const iReady = d.readyIds.includes(myId);
    const card = h('div', { class: 'card stack center' },
      h('div', { class: 'kicker' }, 'Prêt à voter ?'),
      h('div', { class: 'muted small' }, `${d.readyCount} / ${d.needed} nécessaires · ${d.totalAlive} en jeu`),
      h('div', { class: 'ch-votebar' }, h('i', { style: `width:${ctx.pct(d.readyCount, d.needed)}%` })),
    );
    if (me && me.alive) card.append(h('button', { class: iReady ? 'btn btn-primary' : 'btn btn-violet', onclick: () => gameSend('ready', { value: !iReady }) },
      iReady ? '✅ Prêt — on attend les autres' : '🗳️ Je suis prêt à voter'));
    w.append(card);
  }
  if (ctx.isHost) w.append(h('button', { class: 'btn btn-ghost btn-sm', style: 'align-self:center', onclick: () => gameSend('openVote') }, '🗳️ Ouvrir le vote maintenant'));
}

function cluesList(g, ctx) {
  const { h } = ctx;
  if (!g.clues || !g.clues.length) return h('div', {});
  const list = h('div', { class: 'ch-clues' });
  for (const c of g.clues) {
    const p = ctx.byId(c.id);
    list.append(h('div', { class: 'ch-clue' },
      h('span', { class: 'av' }, p ? p.avatar : '❓'),
      h('span', { class: 'nm' }, c.name + (g.cycle > 1 ? ` · tour ${c.cycle}` : '')),
      h('span', { class: 'tx' }, c.text)));
  }
  return h('div', { class: 'card stack' }, h('div', { class: 'kicker' }, `Indices (${g.clues.length})`), list);
}

function votePhase(g, ctx, w) {
  const { h, gameSend, myId } = ctx;
  const me = ctx.byId(myId);
  const grid = h('div', { class: 'ch-vgrid' });
  for (const p of g.players) {
    if (!p.inGame) continue;
    const selectable = me && me.alive && p.alive && p.id !== myId && !me.hasVoted;
    const cell = h('div', { class: 'ch-vc' + (p.alive ? '' : ' dead') + (ui.voteSel === p.id ? ' sel' : '') + (selectable ? ' pick' : ''),
      onclick: selectable ? () => { ui.voteSel = p.id; ctx.rerender(); } : undefined },
      h('div', { class: 'av' }, p.avatar || '❓'),
      h('div', { class: 'nm' }, p.name + (p.id === myId ? ' (toi)' : '')),
      h('div', { class: 'muted small' }, !p.alive ? 'éliminé' : (p.hasVoted ? '✓ a voté' : '')));
    grid.append(cell);
  }
  w.append(h('div', { class: 'card stack' }, grid,
    h('div', { class: 'muted small' }, `${g.vote ? g.vote.votedCount : 0} / ${g.vote ? g.vote.totalVoters : 0} ont voté`)));
  w.append(cluesList(g, ctx));
  if (me && me.alive && !me.hasVoted) {
    w.append(h('button', { class: 'btn btn-primary btn-lg', disabled: ui.voteSel ? undefined : '',
      onclick: () => { if (ui.voteSel) gameSend('vote', { targetId: ui.voteSel }); } },
      ui.voteSel ? `Confirmer : éliminer ${(ctx.byId(ui.voteSel) || {}).name}` : 'Sélectionne un joueur'));
  } else if (me && !me.alive) w.append(h('p', { class: 'hint-line' }, '👻 Éliminé — tu observes.'));
  else w.append(h('p', { class: 'hint-line' }, '✅ Vote enregistré, on attend les autres…'));
}

function guessPhase(g, ctx, w) {
  const { h, myId } = ctx;
  const sec = ctx.secret || {};
  if (sec.isChameleon) {
    w.append(h('div', { class: 'phase-banner', style: 'margin:0' },
      h('span', { class: 'kicker' }, 'Démasqué !'),
      h('h2', {}, '🦎 Dernière chance'),
      h('p', {}, 'Tu es le Caméléon. Clique le MOT SECRET dans la grille : si tu vises juste, tu gagnes la manche.')));
  } else {
    w.append(h('div', { class: 'card waiting' }, h('div', { class: 'spinner' }),
      h('div', { class: 'dots-anim' }, `${g.guessing ? g.guessing.name : 'Le Caméléon'} tente de deviner le mot`)));
  }
}

function resultPhase(g, ctx, w) {
  const { h, gameSend, isHost, myId } = ctx;
  const chamWin = g.mancheWinner === 'chameleon';
  w.append(h('div', { class: 'win-banner fade-in' },
    h('div', { style: 'font-size:2.6rem' }, chamWin ? '🦎' : '🎯'),
    h('div', { class: 'title', style: `color:var(--${chamWin ? 'gold' : 'green'})` }, chamWin ? 'LE CAMÉLÉON GAGNE' : 'LES JOUEURS GAGNENT'),
    h('p', { class: 'muted' }, `Le Caméléon était ${g.chameleonName}. Le mot secret : ${g.secret}.`
      + (g.guessWord ? ` Il a proposé « ${g.guessWord} ».` : '')),
  ));
  // Scores.
  const ranked = [...g.players].sort((a, b) => b.score - a.score);
  const rows = h('div', { class: 'stack', style: 'gap:6px' });
  ranked.forEach((p, i) => rows.append(h('div', { class: 'score-row' + (i === 0 ? ' top' : '') },
    h('div', { class: 'rank' }, String(i + 1)), h('div', { class: 'av' }, p.avatar || '❓'),
    h('div', { class: 'nm' }, p.name + (p.id === myId ? ' (toi)' : '') + (p.id === g.chameleonId ? ' 🦎' : '')),
    h('div', { class: 'pts' }, `${p.score} pt${Math.abs(p.score) > 1 ? 's' : ''}`))));
  w.append(h('div', { class: 'card stack' }, h('div', { class: 'kicker' }, 'Scores'), rows));

  if (isHost) {
    if (g.over) w.append(h('button', { class: 'btn btn-danger btn-lg', onclick: () => gameSend('restart') }, '🔁 Rejouer'));
    else w.append(h('button', { class: 'btn btn-primary btn-lg', onclick: () => gameSend('next') }, '▶ Manche suivante'));
  } else w.append(h('p', { class: 'hint-line' }, g.over ? 'L’hôte peut relancer…' : 'Manche suivante bientôt…'));
}

function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(); }
