// ── ASSASSIN — vue client ───────────────────────────────────────────────────
// Table ronde : chacun ne voit QUE son siège ; les autres sont masqués (« ? »).
// On clique un « ? » pour CHUCHOTER (chat privé de siège à siège) ou TIRER.
// Suspense de 5 s (croix + roulement de tambours) puis révélation des visages.

const ui = { round: -1, open: new Set(), active: null, drafts: {}, menu: null };

function injectCss(id, css) {
  if (document.getElementById('css-' + id)) return;
  const s = document.createElement('style');
  s.id = 'css-' + id; s.textContent = css; document.head.appendChild(s);
}

const CSS = `
.as-head{display:flex;flex-direction:column;gap:6px}
.as-target{display:flex;align-items:center;gap:10px;border:1px solid var(--red);border-radius:12px;
  padding:8px 12px;background:rgba(214,69,80,.08)}
.as-target .av{font-size:1.5rem}
.as-target .who{font-weight:800}
.as-word{display:flex;align-items:center;gap:8px;border:1px dashed var(--gold);border-radius:12px;
  padding:7px 12px;background:rgba(230,180,40,.08);font-weight:700}
.as-lock{font-size:.8rem;color:var(--muted)}
.as-table-wrap{position:relative;width:min(384px,86vw);aspect-ratio:1/1;margin:10px auto}
.as-center{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:34%;aspect-ratio:1/1;
  border-radius:50%;background:radial-gradient(circle at 40% 35%,var(--panel),var(--faint));
  border:1px solid var(--border);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
.as-center .ic{font-size:1.7rem;line-height:1}
.as-center .mn{font-size:.66rem;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-top:2px}
.as-seat{position:absolute;width:66px;transform:translate(-50%,-50%);text-align:center;z-index:2}
.as-tok{position:relative;width:54px;height:54px;margin:0 auto;border-radius:50%;
  border:2px solid var(--border);background:var(--panel);display:flex;align-items:center;justify-content:center;
  font-size:1.5rem;transition:transform .12s,box-shadow .12s,border-color .12s}
.as-tok.q{color:var(--muted);cursor:default}
.as-tok.q.aim{cursor:pointer}
.as-tok.q.aim:hover{transform:translateY(-2px) scale(1.06);border-color:var(--accent);box-shadow:0 6px 16px rgba(0,0,0,.35)}
.as-tok.me{border-color:var(--accent);box-shadow:0 0 0 3px rgba(143,124,246,.18)}
.as-tok.mine-shot{border-color:var(--red);box-shadow:0 0 0 3px rgba(214,69,80,.25)}
.as-tok.talk{border-color:var(--gold)}
.as-tok.rev{border-color:var(--border)}
.as-cross{position:absolute;inset:-4px;display:flex;align-items:center;justify-content:center;
  font-size:2.6rem;color:var(--red);pointer-events:none;animation:asShot .5s ease}
@keyframes asShot{0%{transform:scale(.4);opacity:0}55%{transform:scale(1.3)}100%{transform:scale(1);opacity:1}}
.as-lbl{font-size:.6rem;color:var(--muted);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.as-lbl.nm{color:var(--ink);font-weight:700}
.as-badge{position:absolute;top:-4px;right:-4px;min-width:16px;height:16px;padding:0 4px;border-radius:999px;
  background:var(--gold);color:#1a1206;font-size:.62rem;font-weight:800;display:flex;align-items:center;justify-content:center}
.as-menu{border:1px solid var(--accent);border-radius:12px;background:var(--panel);padding:10px;display:flex;
  flex-direction:column;gap:8px}
.as-menu .rowb{display:flex;gap:8px;flex-wrap:wrap}
.as-chat{border:1px solid var(--border);border-radius:12px;background:var(--panel);overflow:hidden}
.as-tabs{display:flex;gap:6px;flex-wrap:wrap;padding:8px;border-bottom:1px solid var(--faint)}
.as-tab{position:relative;font-size:.74rem;padding:4px 10px;border-radius:999px;border:1px solid var(--border);
  background:transparent;color:var(--muted);cursor:pointer}
.as-tab.on{border-color:var(--gold);color:var(--ink);background:rgba(230,180,40,.1)}
.as-msgs{display:flex;flex-direction:column;gap:6px;padding:10px;max-height:220px;overflow:auto}
.as-msg{max-width:82%;padding:6px 11px;border-radius:13px;font-size:.9rem;line-height:1.3;word-break:break-word}
.as-msg.them{align-self:flex-start;background:var(--faint)}
.as-msg.mine{align-self:flex-end;background:rgba(143,124,246,.22)}
.as-inrow{display:flex;gap:6px;padding:8px;border-top:1px solid var(--faint)}
.as-res{display:flex;flex-direction:column;gap:8px}
.as-res .line{display:flex;align-items:center;gap:8px;border:1px solid var(--border);border-radius:10px;padding:8px 10px}
.as-res .verdict{margin-left:auto;font-weight:800;white-space:nowrap}
.as-res .verdict.ok{color:var(--green)}
.as-res .verdict.no{color:var(--red)}
.as-teams{display:flex;flex-direction:column;gap:8px}
.as-team{border:1px solid var(--border);border-radius:10px;padding:8px 10px}
.as-team.fired{border-color:var(--red)}
.as-team .wd{font-weight:800}
.as-hint{font-size:.8rem;color:var(--muted);text-align:center}
.as-drum{display:flex;align-items:center;justify-content:center;gap:8px;font-weight:800;
  letter-spacing:.04em;color:var(--gold);text-transform:uppercase;font-size:.82rem}
.as-drum .dm{font-size:1.5rem;display:inline-block;animation:asDrum .18s linear infinite}
@keyframes asDrum{0%{transform:rotate(-12deg) translateY(0)}25%{transform:rotate(10deg) translateY(-2px)}
  50%{transform:rotate(-8deg) translateY(0)}75%{transform:rotate(12deg) translateY(-2px)}100%{transform:rotate(-12deg) translateY(0)}}
.reduce-anim .as-drum .dm{animation:none}
`;

export function view(g, ctx) {
  injectCss('assassin', CSS);
  const { h } = ctx;
  if (!g || !g.seats) return h('div', { class: 'card waiting' }, h('div', { class: 'spinner' }), 'Préparation de la table…');
  if (g.round !== ui.round) { ui.round = g.round; ui.open = new Set(); ui.active = null; ui.drafts = {}; ui.menu = null; ui.sfxKey = null; }
  if (g.phase === 'over') return overView(g, ctx);
  if (g.phase === 'suspense' || g.phase === 'reveal') return revealView(g, ctx);
  return playView(g, ctx);
}

function seatPos(i, n) {
  const a = (-90 + (i * 360) / n) * Math.PI / 180;
  return { x: 50 + 40 * Math.cos(a), y: 50 + 40 * Math.sin(a) };
}

function tableEl(g, ctx, { interactive }) {
  const { h, gameSend } = ctx;
  const sec = ctx.secret || {};
  const mySeat = sec.seat;
  const n = g.n;
  const wrap = h('div', { class: 'as-table-wrap' });
  wrap.append(h('div', { class: 'as-center' },
    h('div', { class: 'ic' }, g.phase === 'suspense' ? '💥' : '🎯'),
    h('div', { class: 'mn' }, `Manche ${g.round}/${g.totalRounds}`),
  ));

  g.seats.forEach((s) => {
    const pos = seatPos(s.seat, n);
    const isMe = s.seat === mySeat;
    const seatWrap = h('div', { class: 'as-seat', style: `left:${pos.x}%;top:${pos.y}%` });
    let tok;
    if (s.revealed) {
      // Révélation : vrai visage + nom.
      tok = h('div', { class: 'as-tok rev' + (isMe ? ' me' : ''), style: `border-color:${s.color || 'var(--border)'}` }, s.avatar || '❓');
      if (s.killed) tok.append(h('span', { class: 'as-cross' }, '✖'));
      seatWrap.append(tok, h('div', { class: 'as-lbl nm' }, s.name + (isMe ? ' (toi)' : '')));
    } else if (isMe) {
      // Mon siège : je me vois.
      const me = ctx.byId(ctx.myId) || {};
      tok = h('div', { class: 'as-tok me' }, me.avatar || '🙂');
      if (sec.myShot === s.seat) tok.classList.add('mine-shot');
      seatWrap.append(tok, h('div', { class: 'as-lbl nm' }, 'toi'));
    } else {
      // Autre siège : masqué.
      const talking = ui.open.has(s.seat) || (sec.chats || []).some((c) => c.seat === s.seat);
      const aim = interactive;
      tok = h('div', {
        class: 'as-tok q' + (aim ? ' aim' : '') + (talking ? ' talk' : '') + (sec.myShot === s.seat ? ' mine-shot' : ''),
        onclick: aim ? () => { ui.menu = ui.menu === s.seat ? null : s.seat; ctx.rerender(); } : undefined,
      }, '?');
      if (s.killed) tok.append(h('span', { class: 'as-cross' }, '✖'));
      // Pastille de messages non lus (venant de ce siège).
      const ch = (sec.chats || []).find((c) => c.seat === s.seat);
      const nbThem = ch ? ch.messages.filter((m) => !m.mine).length : 0;
      if (nbThem && ui.active !== s.seat) tok.append(h('span', { class: 'as-badge' }, String(nbThem)));
      seatWrap.append(tok, h('div', { class: 'as-lbl' }, `Place ${s.seat + 1}`));
    }
    wrap.append(seatWrap);
  });
  return wrap;
}

function actionMenu(g, ctx) {
  const { h, gameSend } = ctx;
  const seat = ui.menu;
  if (seat == null) return '';
  const tir = () => { gameSend('shoot', { seat }); ui.menu = null; ctx.rerender(); }; // tir direct (classique) / verrouillage (équipes, re-clic = annuler)
  const parle = () => { ui.open.add(seat); ui.active = seat; ui.menu = null; ctx.rerender(); };
  const locked = (ctx.secret || {}).myShot === seat;
  return h('div', { class: 'as-menu' },
    h('div', { style: 'font-weight:700' }, `Place ${seat + 1}`),
    h('div', { class: 'rowb' },
      h('button', { class: 'btn btn-ghost btn-sm', onclick: parle }, '💬 Chuchoter'),
      h('button', { class: 'btn btn-danger btn-sm', onclick: tir },
        g.mode === 'classic' ? '🔫 Tirer' : (locked ? '🔓 Annuler la visée' : '🔒 Viser (tir en binôme)')),
      h('button', { class: 'btn btn-ghost btn-sm', onclick: () => { ui.menu = null; ctx.rerender(); } }, '✖'),
    ),
    g.mode === 'teams' ? h('div', { class: 'as-hint' }, 'En équipes, le tir ne part que lorsque les deux membres ont visé.') : '',
  );
}

function chatPanel(g, ctx) {
  const { h, gameSend } = ctx;
  const sec = ctx.secret || {};
  // Union des fils ouverts par moi et de ceux où l'on m'a écrit.
  const seats = new Set([...ui.open]);
  (sec.chats || []).forEach((c) => seats.add(c.seat));
  if (!seats.size) return '';
  const list = [...seats].sort((a, b) => a - b);
  if (ui.active == null || !seats.has(ui.active)) ui.active = list[0];

  const tabs = h('div', { class: 'as-tabs' }, ...list.map((s) => {
    const ch = (sec.chats || []).find((c) => c.seat === s);
    const nbThem = ch ? ch.messages.filter((m) => !m.mine).length : 0;
    const t = h('button', { class: 'as-tab' + (s === ui.active ? ' on' : ''), onclick: () => { ui.active = s; ctx.rerender(); } }, `Place ${s + 1}`);
    if (nbThem && s !== ui.active) t.append(h('span', { class: 'as-badge', style: 'position:static;margin-left:6px' }, String(nbThem)));
    return t;
  }));

  const seat = ui.active;
  const ch = (sec.chats || []).find((c) => c.seat === seat);
  const msgs = h('div', { class: 'as-msgs' });
  if (ch && ch.messages.length) ch.messages.forEach((m) => msgs.append(h('div', { class: 'as-msg ' + (m.mine ? 'mine' : 'them') }, m.text)));
  else msgs.append(h('div', { class: 'as-hint' }, `Chuchotez à la Place ${seat + 1}… (elle verra que « Place ${(sec.seat ?? 0) + 1} » lui parle)`));

  const send = () => {
    const v = (ui.drafts[seat] || '').trim();
    if (!v) return;
    gameSend('whisper', { seat, text: v });
    ui.drafts[seat] = '';
    ctx.rerender();
  };
  const input = h('input', {
    class: 'input', maxlength: 240, placeholder: 'Message privé…', value: ui.drafts[seat] || '',
    oninput: (e) => { ui.drafts[seat] = e.target.value; },
    onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); send(); } },
  });
  const row = h('div', { class: 'as-inrow' }, input, h('button', { class: 'btn btn-primary btn-sm', onclick: send }, 'Envoyer'));
  return h('div', { class: 'stack' },
    h('div', { class: 'kicker' }, '💬 Chuchotements'),
    h('div', { class: 'as-chat' }, tabs, msgs, row),
  );
}

function playView(g, ctx) {
  const { h } = ctx;
  const sec = ctx.secret || {};
  const w = h('div', { class: 'stack' });

  // Bandeau + rappel de cible + mot d'équipe.
  const head = h('div', { class: 'as-head' });
  head.append(h('div', { class: 'phase-banner', style: 'margin:0' },
    h('span', { class: 'kicker' }, g.mode === 'teams' ? 'Assassin — binômes secrets' : 'Assassin — chacun sa cible'),
    h('h2', {}, g.phase === 'suspense' ? '💥 Coup de feu !' : '🎯 Trouve ta cible'),
  ));
  if (g.phase === 'play' && sec.target) {
    head.append(h('div', { class: 'as-target' },
      h('span', { class: 'av' }, sec.target.avatar || '❓'),
      h('div', {}, h('div', { class: 'muted small' }, 'Ta cible à abattre'), h('div', { class: 'who' }, sec.target.name)),
    ));
  }
  if (g.mode === 'teams' && sec.teamWord) {
    head.append(h('div', { class: 'as-word' }, '🔑', `Mot de ton équipe : ${sec.teamWord}`,
      sec.teamLocked ? h('span', { class: 'as-lock' }, ` · binôme prêt : ${sec.teamLocked.locked}/${sec.teamLocked.size}`) : ''));
  }
  w.append(head);

  w.append(tableEl(g, ctx, { interactive: true }));
  w.append(h('p', { class: 'as-hint' }, 'Tous les autres sont masqués. Clique une « ? » pour chuchoter ou tirer.'));
  if (g.coercedClassic) w.append(h('p', { class: 'hint-line' }, '⚠️ Nombre de joueurs impair : cette partie se joue en mode classique.'));
  const menu = actionMenu(g, ctx);
  if (menu) w.append(menu);
  w.append(chatPanel(g, ctx));
  w.append(scoreboard(g, ctx));
  return w;
}

// Suspense (croix, identités masquées) puis révélation des vrais visages.
function revealView(g, ctx) {
  const { h, gameSend, isHost } = ctx;
  const w = h('div', { class: 'stack' });
  const suspense = g.phase === 'suspense';
  // Sons : roulement de tambours à l'entrée du suspense, puis verdict au révélé.
  if (suspense && ui.sfxKey !== 'susp') { ui.sfxKey = 'susp'; ctx.fx.drumroll && ctx.fx.drumroll(4.8); }
  if (!suspense && ui.sfxKey !== 'rev') {
    ui.sfxKey = 'rev';
    const mien = (g.results || []).find((r) => r.shooterId === ctx.myId);
    if (ctx.fx.sound) ctx.fx.sound(mien ? (mien.correct ? 'win' : 'lose') : 'reveal');
  }
  w.append(h('div', { class: 'phase-banner', style: 'margin:0' },
    h('span', { class: 'kicker' }, `Manche ${g.round}/${g.totalRounds}`),
    h('h2', {}, suspense ? '💥 Coup de feu !' : '🎭 Révélation'),
    h('p', {}, suspense ? 'Qui a été touché ? Les visages se dévoilent…' : 'Voici qui était assis où.'),
  ));
  if (suspense) w.append(h('div', { class: 'as-drum' }, h('span', { class: 'dm' }, '🥁'), 'Roulement de tambours…'));
  w.append(tableEl(g, ctx, { interactive: false }));
  if (!suspense) {
    w.append(resultsCard(g, ctx));
    w.append(teamsCard(g, ctx));
  }
  w.append(scoreboard(g, ctx));
  if (!suspense) {
    if (isHost) w.append(h('button', { class: 'btn btn-primary btn-lg', onclick: () => gameSend('next') },
      g.round >= g.totalRounds ? '🏁 Voir le classement' : '▶ Manche suivante'));
    else w.append(h('p', { class: 'as-hint' }, 'Manche suivante dans un instant…'));
  }
  return w;
}

function scoreboard(g, ctx) {
  const { h } = ctx;
  const ranked = [...g.players].sort((a, b) => b.score - a.score);
  const rows = h('div', { class: 'stack', style: 'gap:6px' });
  ranked.forEach((p, i) => rows.append(h('div', { class: 'score-row' + (i === 0 && p.score !== 0 ? ' top' : '') },
    h('div', { class: 'rank' }, String(i + 1)),
    h('div', { class: 'av' }, p.avatar || '❓'),
    h('div', { class: 'nm' }, p.name + (p.id === ctx.myId ? ' (toi)' : '')),
    h('div', { class: 'pts' }, `${p.score > 0 ? '+' : ''}${p.score} pt${Math.abs(p.score) > 1 ? 's' : ''}`),
  )));
  return h('div', { class: 'card stack' }, h('div', { class: 'kicker' }, 'Scores'), rows);
}

function resultsCard(g, ctx) {
  const { h } = ctx;
  if (!g.results || !g.results.length) return '';
  const box = h('div', { class: 'as-res' });
  g.results.forEach((r) => box.append(h('div', { class: 'line' },
    h('span', {}, `${r.shooterName} visait `, h('b', {}, r.targetName), ` — a touché `, h('b', {}, r.hitName)),
    h('span', { class: 'verdict ' + (r.correct ? 'ok' : 'no') }, r.correct ? `✅ +${r.delta}` : `❌ ${r.delta}`),
  )));
  return h('div', { class: 'card stack' }, h('div', { class: 'kicker' }, 'Le tir'), box);
}

function teamsCard(g, ctx) {
  const { h } = ctx;
  if (g.mode !== 'teams' || !g.teamsReveal) return '';
  const box = h('div', { class: 'as-teams' });
  g.teamsReveal.forEach((t) => box.append(h('div', { class: 'as-team' + (t.fired ? ' fired' : '') },
    h('div', {}, h('span', { class: 'wd' }, `🔑 ${t.word}`), t.fired ? h('span', { class: 'muted small' }, '  — a tiré') : ''),
    h('div', { style: 'display:flex;gap:12px;margin-top:4px;flex-wrap:wrap' }, ...t.members.map((m) =>
      h('span', {}, `${m.avatar || '❓'} ${m.name} `, h('span', { class: 'muted small' }, `(Place ${m.seat + 1})`)))),
  )));
  return h('div', { class: 'card stack' }, h('div', { class: 'kicker' }, 'Les équipes'), box);
}

function overView(g, ctx) {
  const { h, gameSend, isHost } = ctx;
  const w = h('div', { class: 'stack' });
  const ranked = g.ranking || [...g.players].sort((a, b) => b.score - a.score);
  const champ = ranked[0];
  w.append(h('div', { class: 'win-banner fade-in' },
    h('div', { style: 'font-size:3rem' }, '🏆'),
    h('div', { class: 'title' }, champ ? `${champ.avatar || ''} ${champ.name} l’emporte` : 'Fin de la partie'),
    h('p', { class: 'muted' }, `${g.totalRounds} manche(s) — le meilleur tireur gagne.`),
  ));
  const rows = h('div', { class: 'stack', style: 'gap:8px' });
  ranked.forEach((p, i) => rows.append(h('div', { class: 'score-row' + (i === 0 ? ' top' : '') },
    h('div', { class: 'rank' }, String(i + 1)),
    h('div', { class: 'av' }, p.avatar || '❓'),
    h('div', { class: 'nm' }, p.name + (p.id === ctx.myId ? ' (toi)' : '')),
    h('div', { class: 'pts' }, `${p.score > 0 ? '+' : ''}${p.score} pt${Math.abs(p.score) > 1 ? 's' : ''}`),
  )));
  w.append(h('div', { class: 'card stack' }, h('div', { class: 'kicker' }, 'Classement final'), rows));
  if (isHost) w.append(h('button', { class: 'btn btn-danger btn-lg', onclick: () => gameSend('restart') }, '🔁 Rejouer'));
  else w.append(h('p', { class: 'hint-line' }, 'L’hôte peut relancer une partie…'));
  return w;
}
