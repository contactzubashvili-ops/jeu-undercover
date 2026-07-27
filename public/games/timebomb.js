// ── TIME BOMB — vue client ──────────────────────────────────────────────────
// Désamorçage à rôles cachés. Ambiance tension / danger (rouge).
// Le coupeur actif révèle un fil chez un AUTRE joueur ; désamorcer les N fils
// = Gentils gagnent ; couper la bombe = Traîtres gagnent.
const seen = new Set(); // clés des cartes déjà révélées → anime la coupe une fois

function injectCss(id, css) {
  if (document.getElementById('css-' + id)) return;
  const s = document.createElement('style');
  s.id = 'css-' + id;
  s.textContent = css;
  document.head.appendChild(s);
}

const CSS = `
.tb-role{display:flex;justify-content:center;margin-bottom:2px}
.tb-counters{display:flex;gap:10px;flex-wrap:wrap;justify-content:center}
.tb-metric{flex:1;min-width:120px;text-align:center;border:1px solid var(--border);
  border-radius:12px;padding:10px 8px;background:var(--panel)}
.tb-metric .num{font-size:1.5rem;font-weight:800;line-height:1}
.tb-metric .lab{font-size:.72rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-top:4px}
.tb-metric.danger{border-color:var(--red)}
.tb-metric.danger .num{color:var(--red)}
.tb-metric.safe .num{color:var(--green)}
.tb-fuse{height:6px;border-radius:3px;background:var(--faint);overflow:hidden;margin-top:8px}
.tb-fuse i{display:block;height:100%;background:linear-gradient(90deg,var(--green),var(--gold));transition:width .4s}
.tb-turn{text-align:center;font-weight:700}
.tb-turn.mine{color:var(--red)}
.tb-players{display:flex;flex-direction:column;gap:10px}
.tb-p{border:1px solid var(--border);border-radius:12px;padding:10px;background:var(--panel)}
.tb-p.cutter{border-color:var(--red);box-shadow:0 0 0 1px var(--red) inset}
.tb-p .head{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.tb-p .av{font-size:1.25rem}
.tb-p .nm{font-weight:700}
.tb-p .tag{margin-left:auto;font-size:.7rem;text-transform:uppercase;letter-spacing:.05em;
  color:var(--red);border:1px solid var(--red);border-radius:999px;padding:2px 8px}
.tb-hand{display:flex;flex-wrap:wrap;gap:6px}
.tb-card{width:40px;height:56px;border-radius:8px;border:1px solid var(--border);
  display:flex;align-items:center;justify-content:center;font-size:1.3rem;
  background:repeating-linear-gradient(45deg,var(--faint),var(--faint) 5px,transparent 5px,transparent 10px);
  transition:transform .12s}
.tb-card.down.cuttable{cursor:pointer;border-color:var(--red)}
.tb-card.down.cuttable:hover{transform:translateY(-3px) scale(1.05);box-shadow:0 4px 12px rgba(0,0,0,.4)}
.tb-card.down.locked{opacity:.85}
.tb-card.down.mine{background:var(--panel);border-style:dashed}
.tb-card.down.mine.defuse{border-color:var(--green);color:var(--green)}
.tb-card.down.mine.bomb{border-color:var(--red);color:var(--red)}
.tb-card.down.mine.neutre{border-color:var(--faint);color:var(--muted)}
.tb-card.rev{background:var(--faint)}
.tb-card.rev.defuse{border-color:var(--green);background:rgba(80,200,120,.12)}
.tb-card.rev.bomb{border-color:var(--red);background:rgba(220,60,60,.18)}
.tb-card.rev.neutre{border-color:var(--border)}
.tb-card.flip{animation:tbFlip .5s ease}
@keyframes tbFlip{0%{transform:rotateY(90deg) scale(.9)}60%{transform:rotateY(-12deg) scale(1.08)}100%{transform:none}}
.tb-boom{animation:tbBoom .6s ease}
@keyframes tbBoom{0%{transform:scale(.6);opacity:0}50%{transform:scale(1.25)}100%{transform:scale(1);opacity:1}}
.tb-log{display:flex;flex-wrap:wrap;gap:6px;justify-content:center}
.tb-chip{font-size:.72rem;padding:3px 8px;border-radius:999px;border:1px solid var(--border);color:var(--muted)}
.tb-chip.defuse{border-color:var(--green);color:var(--green)}
.tb-chip.bomb{border-color:var(--red);color:var(--red)}
.tb-reveal-role{display:flex;align-items:center;gap:8px;padding:6px 4px;border-bottom:1px solid var(--faint)}
`;

const ICONS = { defuse: '✂️', bomb: '💣', neutre: '⚪' };

export function view(g, ctx) {
  const { h } = ctx;
  injectCss('timebomb', CSS);
  if (g.phase === 'over') return overView(g, ctx);
  return playView(g, ctx);
}

function roleChip(role, h) {
  if (role === 'traitres') return h('div', { class: 'role-chip', style: 'color:var(--red);border-color:var(--red)' }, '🕵️ Vous êtes TRAÎTRE — faites exploser la bombe');
  if (role === 'gentils') return h('div', { class: 'role-chip', style: 'color:var(--green);border-color:var(--green)' }, '🛡️ Vous êtes DÉSAMORCEUR — coupez tous les bons fils');
  return h('div', { class: 'role-chip muted' }, 'Rôle inconnu');
}

function playView(g, ctx) {
  const { h, gameSend, myId } = ctx;
  const w = h('div', { class: 'stack' });

  // Bandeau + rôle secret.
  w.append(h('div', { class: 'phase-banner' },
    h('span', { class: 'kicker' }, `Manche ${g.round} / ${g.totalRounds}`),
    h('h2', {}, '💣 Time Bomb'),
    h('p', {}, 'Coupez les fils. Désamorcez avant l’explosion.'),
  ));
  w.append(h('div', { class: 'tb-role' }, roleChip(ctx.secret ? ctx.secret.role : null, h)));
  w.append(h('p', { class: 'hint-line' }, '👁️ Tu vois TES fils (en pointillés) — pas ceux des autres.'));

  // Compteurs.
  const fusePct = ctx.pct(g.defuseFound, g.defuseTotal);
  w.append(h('div', { class: 'card stack' },
    h('div', { class: 'tb-counters' },
      h('div', { class: 'tb-metric safe' },
        h('div', { class: 'num' }, `${g.defuseFound}/${g.defuseTotal}`),
        h('div', { class: 'lab' }, 'Fils désamorcés')),
      h('div', { class: 'tb-metric' },
        h('div', { class: 'num' }, `${g.round}/${g.totalRounds}`),
        h('div', { class: 'lab' }, 'Manche')),
      h('div', { class: 'tb-metric danger' },
        h('div', { class: 'num' }, '1'),
        h('div', { class: 'lab' }, 'Bombe cachée')),
    ),
    h('div', { class: 'tb-fuse' }, h('i', { style: `width:${fusePct}%` })),
  ));

  // À qui de couper ?
  const cutter = ctx.byId(g.cutterId);
  const cutterName = cutter ? cutter.name : '?';
  const myTurn = g.cutterId === myId;
  w.append(h('div', { class: 'card' },
    h('div', { class: 'tb-turn' + (myTurn ? ' mine' : '') },
      myTurn ? '✂️ À VOUS de couper un fil chez un autre joueur' : `En attente : c’est à ${cutterName} de couper`),
  ));

  // Grille des joueurs et de leurs fils.
  const list = h('div', { class: 'tb-players' });
  for (const p of g.players) {
    const row = h('div', { class: 'tb-p' + (p.isCutter ? ' cutter' : '') });
    const head = h('div', { class: 'head' },
      h('span', { class: 'av' }, p.avatar || '❓'),
      h('span', { class: 'nm' }, p.name + (p.id === myId ? ' (vous)' : '')),
    );
    if (p.isCutter) head.append(h('span', { class: 'tag' }, 'coupeur'));
    row.append(head);

    const hand = h('div', { class: 'tb-hand' });
    p.cards.forEach((c, idx) => {
      const key = `${g.round}:${p.id}:${idx}`;
      if (c.revealed) {
        const isNew = !seen.has(key);
        if (isNew) seen.add(key);
        hand.append(h('div', {
          class: 'tb-card rev ' + c.type + (isNew ? ' flip' : ''),
          title: c.type === 'defuse' ? 'Fil désamorcé' : c.type === 'bomb' ? 'BOMBE' : 'Fil neutre',
        }, ICONS[c.type] || '⚪'));
      } else if (p.id === myId && ctx.secret && ctx.secret.myCards && ctx.secret.myCards[idx]) {
        // MES fils : je vois leur type (personne d'autre ne le voit).
        const t = ctx.secret.myCards[idx].type;
        hand.append(h('div', { class: 'tb-card down mine ' + t, title: 'Ton fil (visible par toi seul)' }, ICONS[t] || '⚪'));
      } else {
        const cuttable = myTurn && p.id !== myId;
        hand.append(h('div', {
          class: 'tb-card down ' + (cuttable ? 'cuttable' : 'locked'),
          title: cuttable ? 'Couper ce fil' : 'Fil caché',
          onclick: cuttable ? () => gameSend('cut', { targetId: p.id, index: idx }) : undefined,
        }, '🔒'));
      }
    });
    row.append(hand);
    list.append(row);
  }
  w.append(h('div', { class: 'card stack' }, h('div', { class: 'kicker' }, 'Les fils'), list));

  // Journal public des coupes.
  if (g.revealed && g.revealed.length) {
    const log = h('div', { class: 'tb-log' });
    g.revealed.forEach((r) => log.append(
      h('span', { class: 'tb-chip ' + r.type }, `${ICONS[r.type] || '⚪'} ${r.fromName}`)));
    w.append(h('div', { class: 'card stack' }, h('div', { class: 'kicker' }, 'Fils déjà coupés'), log));
  }

  return w;
}

function overView(g, ctx) {
  const { h, gameSend, isHost } = ctx;
  const w = h('div', { class: 'stack' });
  const gentilsWin = g.winnerTeam === 'gentils';

  w.append(h('div', { class: 'win-banner fade-in' },
    h('div', { class: 'tb-boom', style: 'font-size:3rem' }, gentilsWin ? '🛡️' : '💥'),
    h('div', { class: 'title', style: `color:var(--${gentilsWin ? 'green' : 'red'})` },
      gentilsWin ? 'LES GENTILS DÉSAMORCENT LA BOMBE' : 'LES TRAÎTRES GAGNENT'),
    h('p', { class: 'muted' }, gentilsWin
      ? 'Tous les fils de désamorçage ont été coupés à temps.'
      : g.bombFound ? 'La bombe a explosé.' : 'Le temps est écoulé : la bombe n’a pas été désamorcée.'),
  ));

  // Révélation de tous les rôles.
  const roles = h('div', { class: 'stack', style: 'gap:0' });
  g.players.forEach((p) => roles.append(h('div', { class: 'tb-reveal-role' },
    h('span', { class: 'av', style: 'font-size:1.2rem' }, p.avatar || '❓'),
    h('span', { style: 'font-weight:700' }, p.name),
    h('span', {
      class: 'role-chip',
      style: `margin-left:auto;color:var(--${p.role === 'traitres' ? 'red' : 'green'});border-color:var(--${p.role === 'traitres' ? 'red' : 'green'})`,
    }, p.role === 'traitres' ? '🕵️ Traître' : '🛡️ Désamorceur'),
  )));
  w.append(h('div', { class: 'card stack' }, h('div', { class: 'kicker' }, 'Les vrais rôles'), roles));

  // Scores.
  const ranked = [...g.players].sort((a, b) => b.score - a.score);
  const rows = h('div', { class: 'stack', style: 'gap:8px' });
  ranked.forEach((p, i) => rows.append(h('div', { class: 'score-row' + (i === 0 ? ' top' : '') },
    h('div', { class: 'rank' }, String(i + 1)),
    h('div', { class: 'av' }, p.avatar || '❓'),
    h('div', { class: 'nm' }, p.name),
    h('div', { class: 'pts' }, `${p.score} pt${p.score > 1 ? 's' : ''}`),
  )));
  w.append(h('div', { class: 'card stack' }, h('div', { class: 'kicker' }, 'Scores'), rows));

  if (isHost) w.append(h('button', { class: 'btn btn-danger btn-lg', onclick: () => gameSend('restart') }, '🔁 Rejouer'));
  else w.append(h('p', { class: 'hint-line' }, 'L’hôte peut relancer une partie…'));
  return w;
}
