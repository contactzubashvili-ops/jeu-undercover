// ══════════════════════════════════════════════════════════════════════════
//  UNDERCOVER — client (SPA). Rend l'état autoritaire reçu du serveur.
//  Le client n'a AUCUN secret des autres joueurs : il n'affiche que ce que
//  le serveur lui envoie (son propre {role, word} + l'état public).
// ══════════════════════════════════════════════════════════════════════════
import { createNet } from '/net.js';
import * as fx from '/fx.js';

const app = document.getElementById('app');
const toastEl = document.getElementById('toast');
const statutEl = document.getElementById('statut');

const ROLE = {
  civil:      { name: 'Civil',        icon: '🛡️', theme: 'role-civil' },
  undercover: { name: 'Undercover',   icon: '🎭', theme: 'role-undercover' },
  mrwhite:    { name: 'Mister White', icon: '👻', theme: 'role-mrwhite' },
};
const PHASE_INFO = {
  clues:      { kicker: 'Phase des indices', titre: 'Donnez votre indice', sous: 'Un mot, sans dire le vôtre. Écoutez les autres.' },
  discussion: { kicker: 'Discussion',        titre: 'Qui vous semble suspect ?', sous: 'Débattez… puis viendra le vote.' },
  vote:       { kicker: 'Vote',              titre: 'Désignez un suspect', sous: 'Les votes restent secrets jusqu’au dépouillement.' },
};

// ── État client ────────────────────────────────────────────────────────────
const S = {
  view: 'home',           // home | create | join   (avant d'être en partie)
  code: null, token: null, playerId: null,
  state: null,            // dernier instantané public
  secret: null,           // { role, word } — le mien uniquement
  nameDraft: '', codeDraft: '',
  clueDraft: '', guessDraft: '', ladderThemeDraft: '',
  config: { mode: 'both', difficulty: 'any', category: 'any', clueSeconds: 45, discussionSeconds: 90, voteSeconds: 45, rounds: 3 },
  facettes: null,
  roleRevealed: false,
  voteSel: null,
  netStatus: 'connecting',
  lastPhaseKey: null,
};

// Identifiants persistants (reconnexion après refresh / coupure).
const CREDS = 'undercover_creds';
function saveCreds() { try { localStorage.setItem(CREDS, JSON.stringify({ code: S.code, token: S.token, playerId: S.playerId })); } catch {} }
function loadCreds() { try { const c = JSON.parse(localStorage.getItem(CREDS) || 'null'); if (c && c.code && c.token) { S.code = c.code; S.token = c.token; S.playerId = c.playerId; } } catch {} }
function clearCreds() { try { localStorage.removeItem(CREDS); } catch {} S.code = S.token = S.playerId = null; S.state = S.secret = null; }

// Pseudo mémorisé pour la prochaine partie.
try { S.nameDraft = localStorage.getItem('undercover_name') || ''; } catch {}

// Overlays (déclarés tôt : majStatut() les référence dès la connexion réseau).
let emoteFab = null, settingsPanel = null, emotePalette = null, avatarPanel = null;
let drawHandler = null; // vue Pinturillo : reçoit les messages {t:'draw'} en direct

// ── Réseau ─────────────────────────────────────────────────────────────────
const net = createNet({
  onStatus(st) {
    S.netStatus = st;
    if (st === 'open' && S.code && S.token && !inLobbyLocal()) {
      net.send({ t: 'reconnect', code: S.code, token: S.token });
    }
    majStatut();
  },
  onMessage: handleMessage,
});
function inLobbyLocal() { return false; } // toujours tenter la reconnexion à l'ouverture

function handleMessage(msg) {
  switch (msg.t) {
    case 'joined':
      S.code = msg.code; S.token = msg.token; S.playerId = msg.playerId;
      saveCreds();
      break;
    case 'emote':
      fx.flyEmote(msg.emoji, msg.from, msg.color, msg.img);
      return;
    case 'draw':
      if (drawHandler) drawHandler(msg);
      return;
    case 'room':
      fxReact(S.state, msg.state);
      S.state = msg.state;
      if (msg.you) S.playerId = msg.you;
      // Réinitialise l'état local à chaque changement de phase.
      const key = S.state.phase + '#' + S.state.round + '#' + S.state.cycle;
      if (key !== S.lastPhaseKey) {
        S.lastPhaseKey = key;
        S.voteSel = null;
        if (S.state.phase === 'reveal') S.roleRevealed = false;
        if (S.state.phase !== 'clues') S.clueDraft = '';
      }
      render();
      break;
    case 'secret':
      // Secret privé : on garde TOUS les champs (selon le jeu : word, role,
      // letters, ladderNumber, drawWord…). `hasWord` sert à Undercover.
      S.secret = Object.assign({}, msg, { hasWord: msg.word != null });
      render();
      break;
    case 'error':
      if (msg.message === 'expired') {
        clearCreds(); S.view = 'home'; toast('La partie a expiré ou n’existe plus.', true); render();
      } else {
        toast(msg.message, true);
      }
      break;
  }
}

function send(obj) { net.send(obj); }

// ── Rendu principal ──────────────────────────────────────────────────────
function render() {
  const foc = captureFocus();
  app.innerHTML = '';
  let node;
  if (S.state && S.code) {
    node = renderRoom();
  } else {
    node = ({ home: viewHome, create: viewCreate, join: viewJoin }[S.view] || viewHome)();
  }
  app.appendChild(node);
  restoreFocus(foc);
  majStatut();
}

function renderRoom() {
  const st = S.state;
  switch (st.phase) {
    case 'lobby':        return viewLobby();
    case 'ingame':       return viewModuleGame();
    case 'reveal':       return viewReveal();
    case 'clues':        return viewClues();
    case 'discussion':   return viewDiscussion();
    case 'vote':         return viewVote();
    case 'voteReveal':   return viewVoteReveal();
    case 'mrWhiteGuess': return viewMrWhite();
    case 'roundEnd':     return viewRoundEnd();
    case 'gameEnd':      return viewGameEnd();
    default:             return viewLobby();
  }
}

// ── Jeux « modules » : chargement dynamique de la vue par jeu ──────────────
const gameViewCache = {};
function viewModuleGame() {
  const st = S.state;
  const id = st.selectedGameId;
  const view = gameViewCache[id];
  const w = h('div', { class: 'wrap wrap-wide stack' });
  w.append(moduleTopbar());
  if (!view) {
    import(`/games/${id}.js`).then((m) => { gameViewCache[id] = m.view; render(); }).catch((e) => console.error('vue jeu:', e));
    w.append(h('div', { class: 'card waiting' }, h('div', { class: 'spinner' }), 'Chargement du jeu…'));
    return w;
  }
  try { w.append(view(st.game || {}, makeCtx())); }
  catch (e) { console.error(e); w.append(h('div', { class: 'card' }, 'Erreur d’affichage du jeu.')); }
  return w;
}

function moduleTopbar() {
  const st = S.state;
  const g = (st.games || []).find((x) => x.id === st.selectedGameId) || {};
  const isHost = st.hostId === S.playerId;
  return h('div', { class: 'topbar' },
    h('span', { class: 'brand' }, `${g.icon || '🎮'} ${g.name || 'Jeu'}`),
    h('span', { class: 'spacer' }),
    isHost ? h('button', { class: 'btn btn-ghost btn-sm', onclick: () => { if (confirm('Revenir au salon et arrêter la partie ?')) send({ t: 'backToLobby' }); } }, '↩ Salon') : '',
  );
}

// Contexte passé aux vues de jeu (helpers partagés).
function makeCtx() {
  const st = S.state;
  return {
    h, send,
    gameSend: (action, extra = {}) => send({ t: 'game', action, ...extra }),
    state: st,
    me: st.players.find((p) => p.id === S.playerId),
    myId: S.playerId,
    isHost: st.hostId === S.playerId,
    players: st.players,
    byId: (id) => st.players.find((p) => p.id === id),
    secret: S.secret,
    pct, secLeft, timerEl,
    rerender: render,
    fx: { sound: fx.sound, confetti: fx.confetti, flash: fx.flash },
    setDrawHandler: (fn) => { drawHandler = fn; },
    card: (...kids) => h('div', { class: 'card stack' }, ...kids),
  };
}

// Élément minuteur (mis à jour par le tick global).
function timerEl(timer) {
  if (!timer || !timer.endsAt) return h('span', {});
  return h('span', { class: 'timer', id: 'timerbox' }, h('span', { class: 'ico' }, '⏱️'),
    h('span', { id: 'timerval', 'data-ends': String(timer.endsAt) }, secLeft(timer.endsAt) + 's'));
}

// ── Vues : accueil / créer / rejoindre ─────────────────────────────────────
function viewHome() {
  const w = h('div', { class: 'wrap center stack' });
  w.append(
    h('div', { class: 'fade-in' },
      h('div', { class: 'logo brand' }, h('span', { class: 'logo-eye' }, '🕵️'), ' Undercover'),
      h('p', { class: 'tagline' }, 'Tout le monde connaît le mot. ', h('b', {}, 'Sauf deux joueurs.')),
    ),
    h('div', { class: 'card stack mt' },
      h('p', { class: 'muted small' }, 'La plateforme de jeux entre amis. On commence par Undercover — d’autres jeux arrivent. Créez un salon, invitez vos amis, jouez en temps réel.'),
      h('button', { class: 'btn btn-primary btn-lg', onclick: () => go('create') }, '✨ Créer un salon'),
      h('button', { class: 'btn btn-lg', onclick: () => go('join') }, '🔑 Rejoindre un salon'),
    ),
    h('p', { class: 'hint-line mt' }, 'Sur téléphone, tablette ou ordinateur · aucun compte requis'),
  );
  return w;
}

function viewCreate() {
  const w = h('div', { class: 'wrap stack fade-in' });
  w.append(
    backHeader('Créer un salon'),
    h('div', { class: 'card stack' },
      field('Votre pseudo', inputName()),
      h('div', { class: 'err-msg', id: 'formerr' }),
      h('button', { class: 'btn btn-primary btn-lg', onclick: doCreate }, '🎬 Créer le salon'),
      h('p', { class: 'hint-line' }, 'Vous choisirez le jeu et ses réglages une fois dans le salon.'),
    ),
  );
  return w;
}

function viewJoin() {
  const w = h('div', { class: 'wrap stack fade-in' });
  const codeInput = h('input', {
    class: 'input input-code', id: 'code-input', maxlength: 6, autocapitalize: 'characters',
    autocomplete: 'off', spellcheck: 'false', placeholder: 'ABCD12', value: S.codeDraft,
    oninput: (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); S.codeDraft = e.target.value; },
  });
  w.append(
    backHeader('Rejoindre une partie'),
    h('div', { class: 'card stack' },
      field('Votre pseudo', inputName()),
      field('Code de la partie', codeInput),
      h('div', { class: 'err-msg', id: 'formerr' }),
      h('button', { class: 'btn btn-violet btn-lg', onclick: doJoin }, '🚪 Rejoindre le salon'),
    ),
  );
  return w;
}

// ── Vue : salle d'attente (lobby) ──────────────────────────────────────────
function viewLobby() {
  const st = S.state;
  const me = myPlayer();
  const isHost = st.hostId === S.playerId;
  const connectes = st.players.filter((p) => p.connected).length;
  const comp = st.composition;
  const g = (st.games || []).find((x) => x.id === st.selectedGameId);
  const jouable = g && g.available;
  const w = h('div', { class: 'wrap wrap-wide stack' });

  w.append(gameTopbar('Salon'));

  // Code + partage
  const link = `${location.origin}/?p=${st.code}`;
  w.append(h('div', { class: 'card stack' },
    h('div', { class: 'kicker center' }, 'Code du salon'),
    h('div', { class: 'codebox' }, h('span', { class: 'code' }, st.code)),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn btn-sm', style: 'width:100%', onclick: (e) => copy(st.code, e.target) }, '📋 Copier le code'),
      h('button', { class: 'btn btn-sm', style: 'width:100%', onclick: (e) => copy(link, e.target) }, '🔗 Copier le lien'),
    ),
  ));

  // Menu de sélection des jeux + panneau du jeu choisi
  w.append(gameMenu(st, isHost));
  w.append(selectedGamePanel(st, isHost));

  // Joueurs
  const grid = h('div', { class: 'players' });
  for (const p of st.players) grid.append(lobbyPlayerCard(p, isHost));
  w.append(h('div', { class: 'card stack' },
    h('div', { style: 'display:flex;align-items:center;gap:10px;flex-wrap:wrap' },
      h('span', { class: 'panel-title' }, 'Joueurs'),
      h('span', { class: 'pill' }, h('b', {}, String(connectes)), ' connecté' + (connectes > 1 ? 's' : '')),
      h('span', { class: 'spacer' }),
      jouable ? h('span', { class: 'pill' }, compoTexte(comp)) : '',
    ),
    grid,
  ));

  // Palmarès du salon (profils + historique) dès qu'une partie a été jouée.
  if (st.history && st.history.length) w.append(palmaresPanel(st));

  // Actions
  const minJ = g ? g.min : st.minPlayers;
  if (isHost) {
    const canStart = jouable && connectes >= minJ;
    w.append(h('div', { class: 'card stack' },
      h('button', { class: 'btn btn-primary btn-lg', disabled: !canStart ? '' : undefined, onclick: () => send({ t: 'start' }) },
        !jouable ? '🔒 Ce jeu arrive bientôt' : (canStart ? `▶️ Lancer ${g.name}` : `En attente de ${minJ} joueurs…`)),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn btn-ghost', onclick: () => setReady(!me?.ready) }, me?.ready ? '✅ Prêt' : '☑️ Me déclarer prêt'),
        h('button', { class: 'btn btn-danger', onclick: leaveGame }, '✖ Quitter'),
      ),
      h('p', { class: 'hint-line' }, 'Vous êtes l’hôte : choisissez le jeu, réglez, puis lancez.'),
    ));
  } else {
    w.append(h('div', { class: 'card stack center' },
      h('button', { class: me?.ready ? 'btn btn-primary btn-lg' : 'btn btn-violet btn-lg', onclick: () => setReady(!me?.ready) },
        me?.ready ? '✅ Vous êtes prêt — en attente de l’hôte' : '☑️ Je suis prêt'),
      h('button', { class: 'btn btn-ghost', onclick: leaveGame }, 'Quitter'),
      h('p', { class: 'hint-line' }, 'L’hôte choisit le jeu et lancera la partie.'),
    ));
  }
  return w;
}

// Grille de cartes de jeux (menu de sélection).
function gameMenu(st, isHost) {
  const cards = h('div', { class: 'game-grid' });
  for (const g of (st.games || [])) {
    const sel = g.id === st.selectedGameId;
    const card = h('div', {
      class: 'game-card' + (sel ? ' sel' : '') + (g.available ? '' : ' soon'),
      style: `--accent:${g.accent}`,
      onclick: (isHost && g.available) ? () => send({ t: 'selectGame', gameId: g.id }) : undefined,
    },
      h('div', { class: 'game-ic' }, g.icon),
      h('div', { class: 'game-nm' }, g.name),
      h('div', { class: 'game-tg' }, g.tagline),
      h('div', { class: 'game-meta' }, `${g.min}–${g.max} joueurs · ${g.durMin}–${g.durMax} min`),
      g.available
        ? (sel ? h('div', { class: 'game-badge on' }, '✓ Choisi') : (isHost ? h('div', { class: 'game-badge' }, 'Choisir') : ''))
        : h('div', { class: 'game-badge soon' }, 'Bientôt'),
    );
    cards.append(card);
  }
  return h('div', { class: 'card stack' }, h('div', { class: 'kicker' }, 'Choisissez un jeu'), cards);
}

// Panneau du jeu sélectionné : description + réglages (éditables par l'hôte).
function selectedGamePanel(st, isHost) {
  const g = (st.games || []).find((x) => x.id === st.selectedGameId);
  if (!g) return h('div', {});
  const head = h('div', { style: 'display:flex;align-items:center;gap:12px' },
    h('div', { class: 'game-ic', style: `--accent:${g.accent}` }, g.icon),
    h('div', {}, h('div', { class: 'panel-title' }, g.name), h('div', { class: 'muted small' }, g.description)),
  );
  const body = h('div', { class: 'card stack' }, head);
  if (g.id === 'undercover') body.append(undercoverConfig(st, isHost));
  else if (g.id === 'fusion') body.append(fusionConfig(st, isHost));
  else if (g.id === 'pinturillo') body.append(pinturilloConfig(st, isHost));
  else if (g.id === 'ladder') body.append(ladderConfig(st, isHost));
  else if (g.id === 'timebomb') body.append(timebombConfig(st, isHost));
  else if (!g.available) body.append(h('p', { class: 'hint-line' }, '⏳ Ce jeu arrive très bientôt sur la plateforme.'));
  return body;
}

function timebombConfig(st, isHost) {
  const c = st.config;
  const conn = st.players.filter((p) => p.connected).length;
  const auto = Math.floor(conn / 2);
  const cur = c.timebombTraitors || 0;
  if (!isHost) return h('div', { class: 'muted small' }, `Traîtres : ${cur === 0 ? `auto (${auto})` : cur}`);
  return h('div', { class: 'stack' },
    field('Nombre de traîtres (0 = auto)', cfgNum('timebombTraitors', cur, 0, Math.max(1, conn - 1))),
    h('p', { class: 'hint-line' }, `Auto = ${auto} pour ${conn} joueur(s). On ne peut pas recouper celui qui vient de couper.`),
  );
}

function ladderConfig(st, isHost) {
  const c = st.config;
  const themes = c.ladderThemes || [];
  if (!isHost) return h('div', { class: 'muted small' }, `${c.rounds} manche(s) · ${themes.length ? themes.length + ' échelle(s) perso' : 'échelles par défaut'}`);
  const add = () => { const v = (S.ladderThemeDraft || '').trim(); if (!v) return; send({ t: 'config', patch: { ladderThemes: [...themes, v] } }); S.ladderThemeDraft = ''; };
  const inp = h('input', { class: 'input', id: 'ladder-theme-input', maxlength: 80, placeholder: 'ex. Puissance dans Naruto', value: S.ladderThemeDraft || '', oninput: (e) => { S.ladderThemeDraft = e.target.value; }, onkeydown: (e) => { if (e.key === 'Enter') add(); } });
  const chips = h('div', { class: 'chip-row' }, ...themes.map((t, i) => h('button', { class: 'chip on', title: 'Retirer', onclick: () => send({ t: 'config', patch: { ladderThemes: themes.filter((_, j) => j !== i) } }) }, t + ' ✕')));
  return h('div', { class: 'stack' },
    field('Manches', cfgNum('rounds', c.rounds, 1, 10)),
    h('div', { class: 'field' },
      h('label', { class: 'lbl-row' }, h('span', {}, 'Échelles perso'), h('span', { class: 'muted small' }, themes.length ? `${themes.length} ajoutée(s)` : 'aucune')),
      h('div', { style: 'display:flex;gap:8px' }, inp, h('button', { class: 'btn btn-primary btn-sm', onclick: add }, 'Ajouter')),
      themes.length ? chips : '',
    ),
    themes.length ? toggleRow('N’utiliser que mes échelles', c.ladderOnlyCustom, (v) => send({ t: 'config', patch: { ladderOnlyCustom: v } })) : '',
  );
}

function pinturilloConfig(st, isHost) {
  const c = st.config;
  if (!isHost) return h('div', { class: 'muted small' }, `${c.rounds} tour(s) · ${(c.roundSeconds || 0) === 0 ? 'temps illimité' : (c.roundSeconds + 's / dessin')}`);
  return h('div', { class: 'grid-2' },
    field('Tours (par joueur)', cfgNum('rounds', c.rounds, 1, 8)),
    field('Temps/dessin (s, 0 = ∞)', cfgNum('roundSeconds', c.roundSeconds == null ? 75 : c.roundSeconds, 0, 300)),
  );
}

const FUSION_THEMES = [
  { key: 'general', label: 'Général', icon: '🎲' },
  { key: 'anime', label: 'Animés & Mangas', icon: '🍥' },
  { key: 'jeuxvideo', label: 'Jeux vidéo', icon: '🎮' },
  { key: 'jdr', label: 'JDR & Fantasy', icon: '🐉' },
  { key: 'cinema', label: 'Ciné & Séries', icon: '🎬' },
];

function fusionConfig(st, isHost) {
  const c = st.config;
  const selThemes = new Set(c.fusionThemes || []);
  if (!isHost) {
    return h('div', { class: 'muted small' },
      `${c.rounds} manche(s) · ${c.teamMode ? 'en équipes' : 'chacun pour soi'} · thèmes : ${selThemes.size || 'tous'}`);
  }
  return h('div', { class: 'stack' },
    field('Type de duos', segmented('fusionMode', [['classic', 'Mots proches'], ['random', 'Aléatoire'], ['both', 'Les deux']], c.fusionMode || 'classic')),
    h('div', { class: 'grid-2' },
      field('Manches', cfgNum('rounds', c.rounds, 1, 20)),
      field('Temps/manche (s, 0 = ∞)', cfgNum('submitSeconds', c.submitSeconds || 0, 0, 300)),
    ),
    h('div', { class: 'field' },
      h('label', { class: 'lbl-row' }, h('span', {}, 'Thèmes'), h('span', { class: 'muted small' }, selThemes.size ? `${selThemes.size} choisi(s)` : 'tous par défaut')),
      h('div', { class: 'chip-row' }, ...FUSION_THEMES.map((t) => {
        const on = selThemes.has(t.key);
        return h('button', { class: 'chip' + (on ? ' on' : ''), onclick: () => { const n = new Set(selThemes); on ? n.delete(t.key) : n.add(t.key); send({ t: 'config', patch: { fusionThemes: [...n] } }); } }, `${t.icon} ${t.label}`);
      })),
    ),
    toggleRow('Jouer en équipes', c.teamMode, (v) => send({ t: 'config', patch: { teamMode: v } })),
    c.teamMode ? teamAssign(st) : '',
  );
}

function teamAssign(st) {
  const teams = st.config.teams || {};
  const conn = st.players.filter((p) => p.connected);
  const cycle = (pid) => { const cur = teams[pid]; const next = cur === 'A' ? 'B' : (cur === 'B' ? null : 'A'); const nt = { ...teams }; if (next) nt[pid] = next; else delete nt[pid]; send({ t: 'config', patch: { teams: nt } }); };
  const random = () => { const sh = [...conn].sort(() => Math.random() - 0.5); const nt = {}; sh.forEach((p, i) => { nt[p.id] = i % 2 === 0 ? 'A' : 'B'; }); send({ t: 'config', patch: { teams: nt } }); };
  const grid = h('div', { class: 'players' }, ...conn.map((p) => {
    const t = teams[p.id];
    return h('div', { class: 'pcard team-' + (t || 'none'), style: `--pc:${p.color};cursor:pointer`, onclick: () => cycle(p.id) },
      h('div', { class: 'av', style: `border-color:${p.color}` }, p.avatar),
      h('div', { style: 'min-width:0' }, h('div', { class: 'nm' }, p.name), h('div', { class: 'sub' }, t ? 'Équipe ' + t : 'sans équipe')),
      h('span', { class: 'team-badge team-' + (t || 'none') }, t || '—'),
    );
  }));
  return h('div', { class: 'stack' },
    h('div', { class: 'lbl-row' }, h('span', { class: 'muted small' }, 'Cliquez un joueur pour changer d’équipe'), h('button', { class: 'btn btn-ghost btn-sm', onclick: random }, '🎲 Équipes aléatoires')),
    grid,
  );
}

function undercoverConfig(st, isHost) {
  const c = st.config;
  const selected = new Set(c.categories || []);
  if (!isHost) {
    const nb = selected.size;
    return h('div', { class: 'muted small' },
      `Mode : ${modeLabel(c.mode)} · Thèmes : ${nb ? nb + ' choisi' + (nb > 1 ? 's' : '') : 'tous'} · ${c.rounds} manche(s)`);
  }
  return h('div', { class: 'stack' },
    field('Mode de jeu', segmented('mode', [
      ['both', 'Classique'], ['undercover', 'Undercover'], ['mrwhite', 'Mister White'],
    ], c.mode)),
    h('div', { class: 'field' },
      h('label', { class: 'lbl-row' },
        h('span', {}, 'Thèmes en jeu'),
        h('span', { class: 'muted small' }, selected.size ? `${selected.size} sélectionné${selected.size > 1 ? 's' : ''}` : 'tous par défaut'),
      ),
      themeChips(selected),
      selected.size ? h('button', { class: 'btn btn-ghost btn-sm', style: 'align-self:flex-start', onclick: () => send({ t: 'config', patch: { categories: [] } }) }, '✕ Tout décocher') : '',
    ),
    h('div', { class: 'grid-2' },
      field('Manches', cfgNum('rounds', c.rounds, 1, 20)),
      field('Indice (s, 0 = ∞)', cfgNum('clueSeconds', c.clueSeconds, 0, 300)),
    ),
    field('Temps de vote (s, 0 = ∞)', cfgNum('voteSeconds', c.voteSeconds, 0, 300)),
    toggleRow('Lancer le vote quand +50 % sont prêts', c.voteReady, (v) => send({ t: 'config', patch: { voteReady: v } })),
  );
}

// Mode segmenté (pilules) — remplace le menu déroulant.
function segmented(key, pairs, current) {
  const row = h('div', { class: 'segmented' });
  for (const [val, lbl] of pairs) {
    row.append(h('button', { class: 'seg' + (val === current ? ' on' : ''), onclick: () => send({ t: 'config', patch: { [key]: val } }) }, lbl));
  }
  return row;
}

// Chips de thèmes groupés, multi-sélection. `configKey` = clé de config visée
// ('categories' pour Undercover, 'fusionThemes' pour Fusion).
function themeChips(selectedSet, configKey = 'categories') {
  const groups = (S.facettes && S.facettes.groupes) || [];
  const wrap = h('div', { class: 'themes' });
  if (!groups.length) return h('p', { class: 'muted small' }, 'Chargement des thèmes…');
  for (const g of groups) {
    wrap.append(h('div', { class: 'theme-group-h' }, `${g.icon} ${g.label}`));
    const row = h('div', { class: 'chip-row' });
    for (const cat of g.categories) {
      const on = selectedSet.has(cat);
      row.append(h('button', {
        class: 'chip' + (on ? ' on' : ''),
        onclick: () => {
          const next = new Set(selectedSet);
          if (on) next.delete(cat); else next.add(cat);
          send({ t: 'config', patch: { [configKey]: [...next] } });
        },
      }, cat));
    }
    wrap.append(row);
  }
  return wrap;
}

// Interrupteur on/off.
function toggleRow(label, on, cb) {
  return h('div', { class: 'toggle-row', onclick: () => cb(!on) },
    h('span', {}, label),
    h('span', { class: 'toggle' + (on ? ' on' : '') }, h('i', {})),
  );
}

function cfgNum(key, val, min, max) {
  return h('input', { class: 'input', type: 'number', min, max, value: val, inputmode: 'numeric', onchange: (e) => send({ t: 'config', patch: { [key]: parseInt(e.target.value || '0', 10) } }) });
}
function modeLabel(m) { return m === 'both' ? 'Classique' : m === 'undercover' ? 'Undercover' : 'Mister White'; }

function palmaresPanel(st) {
  const gname = (id) => { const g = (st.games || []).find((x) => x.id === id); return g ? `${g.icon} ${g.name}` : id; };
  const ranked = [...st.players].filter((p) => p.stats).sort((a, b) => b.stats.totalPoints - a.stats.totalPoints);
  const profs = h('div', { class: 'stack', style: 'gap:8px' });
  ranked.forEach((p, i) => profs.append(h('div', { class: 'score-row' + (i === 0 && p.stats.totalPoints > 0 ? ' top' : '') },
    h('div', { class: 'rank' }, String(i + 1)),
    h('div', { class: 'av' }, p.avatar),
    h('div', {}, h('div', { class: 'nm' }, p.name), h('div', { class: 'wl' }, `${p.stats.wins} v · ${p.stats.gamesPlayed} parties`)),
    h('div', { class: 'pts' }, `${p.stats.totalPoints} pts`),
  )));
  const hist = h('div', { class: 'stack', style: 'gap:6px' });
  for (const e of st.history.slice(0, 6)) {
    hist.append(h('div', { class: 'hist-row' },
      h('span', { class: 'hist-game' }, gname(e.game)),
      h('span', { class: 'hist-win' }, e.winners.length ? '🏆 ' + e.winners.join(', ') : '—'),
    ));
  }
  return h('div', { class: 'card stack' },
    h('div', { class: 'kicker' }, 'Palmarès du salon'),
    profs,
    h('div', { class: 'kicker', style: 'margin-top:6px' }, 'Dernières parties'),
    hist,
  );
}

function lobbyPlayerCard(p, isHost) {
  const isMe = p.id === S.playerId;
  const card = h('div', { class: 'pcard' + (p.connected ? '' : ' disc'), style: `--pc:${p.color}` + (isMe ? ';cursor:pointer' : ''), title: isMe ? 'Changer de personnage' : undefined, onclick: isMe ? toggleAvatars : undefined });
  card.append(
    h('div', { class: 'av', style: `border-color:${p.color}` }, p.avatar),
    h('div', { style: 'min-width:0' },
      h('div', { class: 'nm' }, p.name, p.isHost ? h('span', { class: 'host-badge' }, ' ★') : ''),
      h('div', { class: 'sub' }, isMe ? '🎭 toi — clique pour changer' : (p.isHost ? 'Hôte' : (p.connected ? 'Connecté' : 'Déconnecté…'))),
    ),
    h('span', { class: 'tag ' + (p.ready ? 'ready' : 'wait') }, p.ready ? 'Prêt' : 'En attente'),
  );
  if (isHost && !p.isHost) {
    card.append(h('button', { class: 'kick', title: 'Exclure', onclick: () => send({ t: 'kick', targetId: p.id }) }, '✕'));
  }
  return card;
}

// ── Vue : révélation du rôle ───────────────────────────────────────────────
function viewReveal() {
  const st = S.state;
  const isHost = st.hostId === S.playerId;
  const sec = S.secret;
  const w = h('div', { class: 'wrap stack' });
  w.append(gameTopbar(`Manche ${st.round}`));

  const hasWord = sec && sec.hasWord;
  w.append(h('div', { class: 'phase-banner' },
    h('span', { class: 'kicker' }, 'Distribution des mots'),
    h('h2', {}, S.roleRevealed ? (hasWord ? 'Votre mot' : 'Mister White') : 'Votre mot est caché'),
    h('p', {}, S.roleRevealed ? 'Mémorisez-le, puis cachez-le avant de passer l’appareil.' : 'Touchez la carte pour le découvrir. Ne le montrez à personne.'),
  ));

  const flip = h('div', { class: 'flip' + (S.roleRevealed ? ' is-flipped' : ''), onclick: () => { S.roleRevealed = !S.roleRevealed; render(); } });
  // Face avant (cachée)
  flip.append(h('div', { class: 'face face-front' },
    h('div', { class: 'q' }, '❓'),
    h('div', { class: 'hint' }, 'Toucher pour révéler'),
  ));
  // Face arrière : on ne révèle PAS le camp — seulement le mot (ou son absence).
  const back = h('div', { class: 'face face-back ' + (!sec ? '' : (hasWord ? 'role-secret' : 'role-mrwhite')) });
  if (!sec) {
    back.append(h('div', { class: 'waiting' }, h('div', { class: 'spinner' }), 'Réception du mot…'));
  } else if (hasWord) {
    back.append(h('div', { class: 'role-icon' }, '🗝️'));
    back.append(h('div', { class: 'role-name', style: 'font-size:1.05rem;color:var(--muted);letter-spacing:.06em' }, 'Votre mot secret'));
    back.append(h('div', { class: 'role-word', style: 'color:var(--gold-2)' }, sec.word));
    back.append(h('div', { class: 'role-sub' }, 'Donnez des indices sans le dire. Attention : votre mot est peut-être différent de celui des autres…'));
  } else {
    back.append(h('div', { class: 'role-icon' }, '👻'));
    back.append(h('div', { class: 'role-name' }, 'Mister White'));
    back.append(h('div', { class: 'role-sub' }, 'Vous n’avez aucun mot. Écoutez les indices, devinez le mot des autres et bluffez pour ne pas être démasqué.'));
  }
  flip.append(back);
  w.append(h('div', { class: 'reveal-area' }, flip));

  w.append(h('div', { class: 'btn-row' },
    h('button', { class: 'btn btn-ghost', onclick: () => { S.roleRevealed = false; render(); } }, '🙈 Cacher'),
  ));

  if (isHost) {
    w.append(h('div', { class: 'card stack mt' },
      h('button', { class: 'btn btn-primary btn-lg', onclick: () => send({ t: 'startClues' }) }, '🎙️ Lancer le tour d’indices'),
      h('p', { class: 'hint-line' }, 'Quand chacun a vu son rôle, lancez les indices.'),
    ));
  } else {
    w.append(h('p', { class: 'hint-line mt' }, 'L’hôte lancera le tour d’indices dans un instant…'));
  }
  return w;
}

// ── Vue : indices ──────────────────────────────────────────────────────────
function viewClues() {
  const st = S.state;
  const me = myPlayer();
  const isHost = st.hostId === S.playerId;
  const active = st.players.find((p) => p.id === st.activeClueId);
  const myTurn = st.activeClueId === S.playerId && me?.alive;
  const w = h('div', { class: 'wrap wrap-wide stack' });

  w.append(gameTopbar(`Manche ${st.round}`), phaseBanner('clues'), timerRow());

  w.append(h('div', { class: 'active-turn' + (myTurn ? ' mine' : '') },
    active
      ? (myTurn
        ? h('div', {}, h('div', { class: 'kicker' }, 'C’est à vous'), h('div', { class: 'who' }, 'Donnez votre indice'))
        : h('div', {}, h('div', { class: 'kicker' }, 'Au tour de'), h('div', { class: 'who' }, `${active.avatar} ${active.name}`)))
      : 'Préparation…',
  ));

  if (myTurn) {
    const inp = h('input', {
      class: 'input', id: 'clue-input', maxlength: 40, placeholder: 'Un seul mot, sans dire le vôtre…',
      value: S.clueDraft, autocomplete: 'off',
      oninput: (e) => { S.clueDraft = e.target.value; },
      onkeydown: (e) => { if (e.key === 'Enter') submitClue(); },
    });
    w.append(h('div', { class: 'card stack' }, inp,
      h('button', { class: 'btn btn-primary', onclick: submitClue }, '✔️ Valider mon indice'),
      mySecretReminder(),
    ));
  } else if (me?.alive) {
    w.append(mySecretReminder());
  } else {
    w.append(h('p', { class: 'hint-line' }, '👻 Vous êtes éliminé — vous observez la partie.'));
  }

  // Tous les indices (historique permanent, à travers les tours qui bouclent).
  if (st.clues.length) {
    const list = h('div', { class: 'clue-list' });
    for (const c of st.clues) {
      const p = st.players.find((x) => x.id === c.playerId);
      list.append(h('div', { class: 'clue-item' },
        h('div', { class: 'av' }, p ? p.avatar : '❓'),
        h('div', { class: 'cn' }, c.name),
        h('div', { class: 'ct' }, c.text),
      ));
    }
    w.append(h('div', { class: 'card stack' }, h('div', { class: 'kicker' }, `Indices (${st.clues.length})`), list));
  }

  // Prêt à voter — disponible À TOUT MOMENT pendant les indices.
  const d = st.discussion || {};
  if (d.enabled) {
    const iReady = d.readyIds && d.readyIds.includes(S.playerId);
    const card = h('div', { class: 'card stack center' },
      h('div', { class: 'kicker' }, 'Prêt à voter ?'),
      h('div', { class: 'vote-progress' }, `${d.readyCount} / ${d.needed} nécessaires · ${d.totalAlive} en jeu`),
      h('div', { class: 'vote-bar' }, h('i', { style: `width:${pct(d.readyCount, d.needed)}%` })),
    );
    if (me && me.alive) {
      card.append(h('button', { class: iReady ? 'btn btn-primary' : 'btn btn-violet', onclick: () => send({ t: 'voteReady', value: !iReady }) },
        iReady ? '✅ Prêt — on attend les autres' : '🗳️ Je suis prêt à voter'));
    }
    card.append(h('p', { class: 'hint-line' }, 'Le vote part dès que la majorité est prête — sinon on continue les indices à l’infini !'));
    w.append(card);
  }
  if (isHost) w.append(h('button', { class: 'btn btn-ghost btn-sm', style: 'align-self:center', onclick: () => send({ t: 'openVote' }) }, '🗳️ Ouvrir le vote maintenant'));

  w.append(playersStrip());

  if (isHost && active) {
    w.append(h('button', { class: 'btn btn-ghost btn-sm', style: 'align-self:center', onclick: () => send({ t: 'passClue' }) }, `⏭️ Passer le tour de ${active.name}`));
  }
  return w;
}

// ── Vue : discussion ───────────────────────────────────────────────────────
function viewDiscussion() {
  const st = S.state;
  const me = myPlayer();
  const isHost = st.hostId === S.playerId;
  const d = st.discussion || {};
  const w = h('div', { class: 'wrap wrap-wide stack' });
  w.append(gameTopbar(`Manche ${st.round}`), phaseBanner('discussion'));

  // Récap de tous les indices de la manche
  const list = h('div', { class: 'clue-list' });
  for (const c of st.clues) {
    const p = st.players.find((x) => x.id === c.playerId);
    list.append(h('div', { class: 'clue-item' },
      h('div', { class: 'av' }, p ? p.avatar : '❓'),
      h('div', { class: 'cn' }, `${c.name}${st.cycle > 1 ? ' · tour ' + c.cycle : ''}`),
      h('div', { class: 'ct' }, c.text),
    ));
  }
  if (st.clues.length) w.append(h('div', { class: 'card stack' }, h('div', { class: 'kicker' }, 'Tous les indices'), list));
  w.append(mySecretReminder());

  // Prêt à voter (majorité) — remplace le minuteur.
  if (d.enabled) {
    const iReady = d.readyIds && d.readyIds.includes(S.playerId);
    const card = h('div', { class: 'card stack center' },
      h('div', { class: 'kicker' }, 'Prêt à voter ?'),
      h('div', { class: 'vote-progress' }, `${d.readyCount} / ${d.needed} nécessaires · ${d.totalAlive} en jeu`),
      h('div', { class: 'vote-bar' }, h('i', { style: `width:${pct(d.readyCount, d.needed)}%` })),
    );
    if (me && me.alive) {
      card.append(h('button', { class: iReady ? 'btn btn-primary' : 'btn btn-violet', onclick: () => send({ t: 'voteReady', value: !iReady }) },
        iReady ? '✅ Prêt — on attend les autres' : '🗳️ Je suis prêt à voter'));
    } else {
      card.append(h('p', { class: 'hint-line' }, '👻 Éliminé — vous observez.'));
    }
    card.append(h('p', { class: 'hint-line' }, 'Le vote se lance dès que plus de la moitié des joueurs sont prêts.'));
    w.append(card);
  }

  if (isHost) {
    w.append(h('button', { class: 'btn btn-ghost btn-sm', style: 'align-self:center', onclick: () => send({ t: 'openVote' }) }, '🗳️ Ouvrir le vote maintenant'));
  } else if (!d.enabled) {
    w.append(h('p', { class: 'hint-line' }, 'L’hôte ouvrira le vote sous peu…'));
  }

  w.append(playersStrip());
  return w;
}

// ── Vue : vote ─────────────────────────────────────────────────────────────
function viewVote() {
  const st = S.state;
  const me = myPlayer();
  const w = h('div', { class: 'wrap wrap-wide stack' });
  w.append(gameTopbar(`Manche ${st.round}`), phaseBanner('vote'), timerRow());

  if (st.vote?.secondTour) {
    w.append(h('p', { class: 'hint-line' }, '⚖️ Égalité : second tour entre les joueurs à départager.'));
  }

  const iVoted = me?.hasVoted;
  const alive = me?.alive;
  const candidates = st.vote?.candidates;

  const grid = h('div', { class: 'vote-grid' });
  for (const p of st.players) {
    if (!p.alive) {
      grid.append(voteCard(p, 'dead', false));
      continue;
    }
    const isMe = p.id === S.playerId;
    const selectable = alive && !iVoted && !isMe && (!candidates || candidates.includes(p.id));
    const cls = (isMe ? 'me ' : '') + (S.voteSel === p.id ? 'sel' : '') + (!selectable && !isMe ? ' dead' : '');
    const card = voteCard(p, cls, selectable);
    if (selectable) card.onclick = () => { S.voteSel = p.id; render(); };
    grid.append(card);
  }
  w.append(h('div', { class: 'card stack' }, grid,
    // progression
    h('div', { class: 'vote-progress' }, `${st.vote?.votedCount ?? 0} / ${st.vote?.totalVoters ?? 0} joueur(s) ont voté`),
    h('div', { class: 'vote-bar' }, h('i', { style: `width:${pct(st.vote?.votedCount, st.vote?.totalVoters)}%` })),
  ));

  if (!alive) {
    w.append(h('p', { class: 'hint-line' }, '👻 Éliminé — vous ne pouvez plus voter. Patientez.'));
  } else if (iVoted) {
    w.append(h('p', { class: 'hint-line' }, '✅ Vote enregistré. En attente des autres…'));
  } else {
    w.append(h('button', {
      class: 'btn btn-primary btn-lg', disabled: S.voteSel ? undefined : '',
      onclick: () => { if (S.voteSel) { send({ t: 'vote', targetId: S.voteSel }); fx.sound('vote'); } },
    }, S.voteSel ? `Confirmer mon vote contre ${nameOf(S.voteSel)}` : 'Sélectionnez un joueur'));
  }
  return w;
}

function voteCard(p, cls, selectable) {
  return h('div', { class: 'vote-card ' + cls },
    h('div', { class: 'av' }, p.avatar),
    h('div', { class: 'nm' }, p.name),
    p.id === S.playerId ? h('div', { class: 'voted' }, 'vous') : (p.hasVoted && p.alive ? h('div', { class: 'voted' }, '✓ a voté') : (!p.alive ? h('div', { class: 'sub muted small' }, p.revealedRole ? ROLE[p.revealedRole].name : 'éliminé') : '')),
  );
}

// ── Vue : dépouillement ────────────────────────────────────────────────────
function viewVoteReveal() {
  const st = S.state;
  const vr = st.voteResult || {};
  const w = h('div', { class: 'wrap stack' });
  w.append(gameTopbar(`Manche ${st.round}`));

  if (vr.egalite) {
    w.append(h('div', { class: 'phase-banner' },
      h('span', { class: 'kicker' }, 'Résultat'),
      h('h2', {}, '⚖️ Égalité !'),
      h('p', {}, 'Personne n’est éliminé. Second tour entre les joueurs à égalité.'),
    ));
    w.append(tallyBlock(vr.tally));
  } else if (vr.eliminated) {
    const info = ROLE[vr.eliminated.role];
    w.append(h('div', { class: 'big-reveal' },
      h('div', { class: 'kicker' }, 'Le vote a parlé'),
      h('div', { class: 'who' }, `${vr.eliminated.name} est éliminé`),
      h('div', { class: 'role-chip ' + info.theme }, info.icon, ' ', info.name),
    ));
    w.append(tallyBlock(vr.tally));
    if (vr.eliminated.role === 'mrwhite') {
      w.append(h('p', { class: 'hint-line' }, '👻 Mister White a une dernière chance de deviner le mot…'));
    }
  } else {
    w.append(h('div', { class: 'phase-banner' }, h('h2', {}, 'Aucune élimination'), h('p', {}, 'Personne n’a voté.')));
  }
  w.append(h('p', { class: 'hint-line' }, h('span', { class: 'dots-anim' }, 'Suite')));
  return w;
}

function tallyBlock(tally) {
  if (!tally || !tally.length) return h('div', {});
  const max = Math.max(...tally.map((t) => t.count), 1);
  const block = h('div', { class: 'card tally' });
  for (const t of tally) {
    block.append(h('div', { class: 'tally-row' },
      h('div', { class: 'bar' }, h('i', { style: `width:${(t.count / max) * 100}%` }), h('span', {}, t.name)),
      h('div', { class: 'cnt' }, String(t.count)),
    ));
  }
  return block;
}

// ── Vue : Mister White devine ──────────────────────────────────────────────
function viewMrWhite() {
  const st = S.state;
  const mw = st.mrWhite || {};
  const isMe = mw.playerId === S.playerId;
  const w = h('div', { class: 'wrap stack' });
  w.append(gameTopbar(`Manche ${st.round}`));

  if (isMe) {
    w.append(h('div', { class: 'phase-banner win-mrwhite' },
      h('span', { class: 'kicker' }, 'Vous êtes Mister White'),
      h('h2', {}, 'Vous avez été éliminé'),
      h('p', {}, 'Mais il vous reste une dernière chance : devinez le mot des Civils pour gagner la manche.'),
    ));
    const inp = h('input', {
      class: 'input', id: 'guess-input', maxlength: 40, placeholder: 'Le mot des Civils est…',
      value: S.guessDraft, autocomplete: 'off',
      oninput: (e) => { S.guessDraft = e.target.value; },
      onkeydown: (e) => { if (e.key === 'Enter') submitGuess(); },
    });
    w.append(h('div', { class: 'card stack' }, inp,
      h('button', { class: 'btn btn-violet btn-lg', onclick: submitGuess }, '🎯 Valider ma réponse'),
    ));
  } else {
    w.append(h('div', { class: 'phase-banner' },
      h('span', { class: 'kicker' }, 'Suspense' ),
      h('h2', {}, `${mw.name} tentait de deviner…`),
    ));
    w.append(h('div', { class: 'card waiting' }, h('div', { class: 'spinner' }),
      h('div', { class: 'dots-anim' }, `${mw.name} (Mister White) écrit sa réponse`)));
  }
  return w;
}

// ── Vue : fin de manche ────────────────────────────────────────────────────
function viewRoundEnd() {
  const st = S.state;
  const rs = st.roundSummary || {};
  const isHost = st.hostId === S.playerId;
  const w = h('div', { class: 'wrap wrap-wide stack' });
  w.append(gameTopbar(`Manche ${st.round}`));

  const winName = { civils: 'Victoire des Civils', undercover: 'Victoire de l’Undercover', mrwhite: 'Victoire de Mister White' }[rs.winner] || 'Fin de la manche';
  const winIcon = { civils: '🛡️', undercover: '🎭', mrwhite: '👻' }[rs.winner] || '🏁';
  w.append(h('div', { class: 'win-banner win-' + rs.winner + ' fade-in' },
    h('div', { style: 'font-size:3.2rem' }, winIcon),
    h('div', { class: 'title' }, winName),
  ));

  // Mots
  w.append(h('div', { class: 'words-recap' },
    h('div', { class: 'word-box' }, h('div', { class: 'lbl' }, 'Mot des Civils'), h('div', { class: 'val', style: 'color:#8ff0ce' }, rs.civilWord || '—')),
    h('div', { class: 'word-box' }, h('div', { class: 'lbl' }, 'Mot de l’Undercover'), h('div', { class: 'val', style: 'color:#ff9ba2' }, rs.undercoverWord || '—')),
  ));

  // Tentative de Mister White
  if (rs.mrWhiteGuess) {
    const g = rs.mrWhiteGuess;
    w.append(h('div', { class: 'card center' },
      h('div', { class: 'kicker' }, 'Réponse de Mister White'),
      h('div', { style: 'font-size:1.3rem;font-weight:800;margin-top:6px' }, `« ${g.guess || '—'} » `,
        h('span', { style: `color:${g.correct ? 'var(--green)' : 'var(--red)'}` }, g.correct ? '✔ correcte' : '✘ incorrecte')),
    ));
  }

  // Rôles de tous les joueurs
  const rr = h('div', { class: 'roles-recap' });
  for (const p of (rs.roles || [])) {
    const info = ROLE[p.role];
    const pl = st.players.find((x) => x.id === p.id) || {};
    rr.append(h('div', { class: 'rr-row' },
      h('div', { class: 'av' }, pl.avatar || '❓'),
      h('div', { class: 'nm' }, p.name, p.alive ? '' : h('span', { class: 'muted small' }, ' · éliminé')),
      h('div', { class: 'rl ' + info.theme.replace('role-', 'role-') }, info.icon + ' ' + info.name),
    ));
  }
  w.append(h('div', { class: 'card stack' }, h('div', { class: 'kicker' }, 'Les rôles'), rr));

  // Scores
  w.append(scoreboard());

  // Actions hôte
  if (isHost) {
    const actions = h('div', { class: 'card stack' });
    if (st.seriesOver) {
      actions.append(
        h('div', { class: 'center' }, h('div', { class: 'kicker' }, `Série de ${st.config.rounds} manches terminée`)),
        h('button', { class: 'btn btn-primary btn-lg', onclick: () => send({ t: 'nextRound' }) }, '➕ Une manche de plus'),
        h('button', { class: 'btn btn-ghost', onclick: () => send({ t: 'endGame' }) }, '🏁 Voir le classement final'),
      );
    } else {
      actions.append(h('button', { class: 'btn btn-primary btn-lg', onclick: () => send({ t: 'nextRound' }) }, '➡️ Manche suivante'));
      actions.append(h('button', { class: 'btn btn-ghost', onclick: () => send({ t: 'endGame' }) }, 'Arrêter et voir le classement'));
    }
    w.append(actions);
  } else {
    w.append(h('p', { class: 'hint-line' }, st.seriesOver ? 'Série terminée. L’hôte peut relancer.' : 'L’hôte va lancer la manche suivante…'));
  }
  return w;
}

// ── Vue : fin de partie ────────────────────────────────────────────────────
function viewGameEnd() {
  const st = S.state;
  const isHost = st.hostId === S.playerId;
  const w = h('div', { class: 'wrap stack' });
  w.append(gameTopbar('Classement final'));
  const ranked = [...st.players].sort((a, b) => b.score - a.score);
  const champ = ranked[0];
  w.append(h('div', { class: 'win-banner fade-in' },
    h('div', { style: 'font-size:3rem' }, '🏆'),
    h('div', { class: 'title', style: 'color:var(--gold-2)' }, champ ? `${champ.name} l’emporte` : 'Partie terminée'),
  ));
  w.append(scoreboard(true));
  if (isHost) {
    w.append(h('div', { class: 'card stack' },
      h('button', { class: 'btn btn-primary btn-lg', onclick: () => send({ t: 'backToLobby' }) }, '🔁 Rejouer (retour au salon)'),
      h('button', { class: 'btn btn-danger', onclick: leaveGame }, 'Quitter la partie'),
    ));
  } else {
    w.append(h('button', { class: 'btn btn-ghost', onclick: leaveGame }, 'Quitter la partie'));
  }
  return w;
}

function scoreboard(final) {
  const st = S.state;
  const ranked = [...st.players].sort((a, b) => b.score - a.score);
  const rows = h('div', { class: 'stack', style: 'gap:8px' });
  ranked.forEach((p, i) => {
    rows.append(h('div', { class: 'score-row' + (final && i === 0 ? ' top' : '') },
      h('div', { class: 'rank' }, String(i + 1)),
      h('div', { class: 'av' }, p.avatar),
      h('div', {}, h('div', { class: 'nm' }, p.name), h('div', { class: 'wl' }, `${p.wins} v · ${p.losses} d · ${p.roundsPlayed} manches`)),
      h('div', { class: 'pts' }, `${p.score} pts`),
    ));
  });
  return h('div', { class: 'card stack' }, h('div', { class: 'kicker' }, 'Scores'), rows);
}

// ── Fragments partagés ─────────────────────────────────────────────────────
function gameTopbar(sub) {
  const st = S.state;
  // Le code n'est utile qu'au salon (grand encart dédié) : inutile en jeu.
  const enLobby = st.phase === 'lobby';
  const isHost = st.hostId === S.playerId;
  return h('div', { class: 'topbar' },
    h('span', { class: 'brand' }, '🕵️ Undercover'),
    enLobby ? h('span', { class: 'pill' }, 'Code ', h('b', {}, st.code)) : '',
    h('span', { class: 'spacer' }),
    h('span', { class: 'pill' }, sub),
    // Revenir au menu à tout moment pendant la partie.
    !enLobby ? h('button', {
      class: 'btn btn-ghost btn-sm',
      onclick: () => {
        if (isHost) { if (confirm('Ramener tout le monde au salon ?')) send({ t: 'backToLobby' }); }
        else if (confirm('Quitter la partie ?')) leaveGame();
      },
    }, isHost ? '↩ Menu' : '✖ Quitter') : '',
  );
}

function phaseBanner(phase) {
  const info = PHASE_INFO[phase];
  return h('div', { class: 'phase-banner' },
    h('span', { class: 'kicker' }, info.kicker),
    h('h2', {}, info.titre),
    h('p', {}, info.sous),
  );
}

function timerRow() {
  const t = S.state.timer;
  if (!t) return h('div', {});
  return h('div', { class: 'center' }, h('span', { class: 'timer', id: 'timerbox' },
    h('span', { class: 'ico' }, '⏱️'), h('span', { id: 'timerval', 'data-ends': String(t.endsAt) }, secLeft(t.endsAt) + 's')));
}

function playersStrip() {
  const st = S.state;
  const grid = h('div', { class: 'players' });
  for (const p of st.players) {
    const dead = !p.alive;
    const card = h('div', { class: 'pcard' + (dead ? ' disc' : '') + (p.connected ? '' : ' disc'), style: `--pc:${p.color}` },
      h('div', { class: 'av', style: `border-color:${p.color}` }, dead ? '💀' : p.avatar),
      h('div', { style: 'min-width:0' },
        h('div', { class: 'nm' }, p.name, p.id === st.hostId ? h('span', { class: 'host-badge' }, ' ★') : ''),
        h('div', { class: 'sub' }, dead ? (p.revealedRole ? ROLE[p.revealedRole].name : 'éliminé') : (p.hasVoted && st.phase === 'vote' ? 'a voté' : 'en jeu')),
      ),
    );
    grid.append(card);
  }
  return h('div', { class: 'card stack' }, h('div', { class: 'kicker' }, 'Joueurs'), grid);
}

function mySecretReminder() {
  const sec = S.secret;
  if (!sec) return h('div', {});
  // On rappelle seulement le mot (jamais le camp).
  if (sec.hasWord) {
    return h('div', { class: 'card-tight card', style: 'text-align:center' },
      h('span', { class: 'muted small' }, 'Votre mot : '),
      h('b', { style: 'color:var(--gold-2);font-size:1.05rem' }, sec.word),
    );
  }
  return h('div', { class: 'card-tight card', style: 'text-align:center' },
    h('span', { class: 'muted small' }, 'Vous êtes '),
    h('b', { style: 'color:var(--ghost)' }, 'Mister White'),
    h('span', { class: 'muted small' }, ' · aucun mot — bluffez.'),
  );
}

// ── Actions ────────────────────────────────────────────────────────────────
function go(view) { S.view = view; render(); }
function doCreate() {
  const name = (S.nameDraft || '').trim();
  if (!name) return formErr('Choisissez un pseudo.');
  rememberName(name);
  send({ t: 'create', name }); // le jeu et les réglages se choisissent dans le salon
}
function doJoin() {
  const name = (S.nameDraft || '').trim();
  const code = (S.codeDraft || '').trim().toUpperCase();
  if (!name) return formErr('Choisissez un pseudo.');
  if (code.length < 4) return formErr('Entrez un code valide.');
  rememberName(name);
  send({ t: 'join', name, code });
}
function setReady(v) { send({ t: 'ready', value: v }); }
function submitClue() {
  const txt = (S.clueDraft || '').trim();
  if (!txt) { shake('clue-input'); return; }
  send({ t: 'clue', text: txt }); S.clueDraft = ''; fx.sound('submit');
}
function submitGuess() {
  const txt = (S.guessDraft || '').trim();
  if (!txt) { shake('guess-input'); return; }
  send({ t: 'guess', text: txt }); S.guessDraft = '';
}
function leaveGame() {
  send({ t: 'leave' });
  clearCreds(); S.view = 'home'; S.lastPhaseKey = null; render();
}

// ── Petits utilitaires DOM ─────────────────────────────────────────────────
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.setAttribute('style', v);
    else if (k.startsWith('on') && typeof v === 'function') el[k.toLowerCase()] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false || kid === '') continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
function field(label, control) { return h('div', { class: 'field' }, h('label', {}, label), control); }
function inputName() {
  return h('input', {
    class: 'input', id: 'name-input', maxlength: 20, placeholder: 'Votre pseudo', value: S.nameDraft, autocomplete: 'off',
    oninput: (e) => { S.nameDraft = e.target.value; },
  });
}
function selectEl(key, pairs, current, optionNodes) {
  const sel = h('select', { class: 'select', onchange: (e) => { S.config[key] = e.target.value; } });
  if (optionNodes) { for (const o of optionNodes) { if (o.value === current) o.selected = true; sel.append(o); } }
  else for (const [val, lbl] of pairs) { const o = h('option', { value: val }, lbl); if (val === current) o.selected = true; sel.append(o); }
  return sel;
}
function numInput(key, val, min, max) {
  return h('input', {
    class: 'input', type: 'number', min, max, value: val, inputmode: 'numeric',
    oninput: (e) => { S.config[key] = parseInt(e.target.value || '0', 10); },
  });
}
function backHeader(title) {
  return h('div', { style: 'display:flex;align-items:center;gap:12px' },
    h('button', { class: 'btn btn-ghost btn-sm', onclick: () => go('home') }, '←'),
    h('h1', { style: 'font-size:1.4rem;font-weight:800' }, title),
  );
}
function formErr(msg) { const e = document.getElementById('formerr'); if (e) { e.textContent = msg; e.classList.add('shake'); setTimeout(() => e.classList.remove('shake'), 400); } }

function compoTexte(comp) {
  const bits = [`${comp.civils} civil${comp.civils > 1 ? 's' : ''}`];
  if (comp.undercover) bits.push('1 undercover');
  if (comp.mrwhite) bits.push('1 mister white');
  return bits.join(' · ');
}
function myPlayer() { return S.state?.players.find((p) => p.id === S.playerId); }
function nameOf(id) { const p = S.state?.players.find((x) => x.id === id); return p ? p.name : '?'; }
function pct(a, b) { if (!b) return 0; return Math.round((a / b) * 100); }
function secLeft(endsAt) { return Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)); }

function rememberName(n) { try { localStorage.setItem('undercover_name', n); } catch {} }

// Copie presse-papier avec repli.
async function copy(text, btn) {
  try { await navigator.clipboard.writeText(text); }
  catch { const ta = document.createElement('textarea'); ta.value = text; document.body.append(ta); ta.select(); try { document.execCommand('copy'); } catch {} ta.remove(); }
  if (btn) { const old = btn.textContent; btn.textContent = '✓ Copié !'; btn.classList.add('copied'); setTimeout(() => { btn.textContent = old; btn.classList.remove('copied'); }, 1500); }
  toast('Copié dans le presse-papier');
}

let toastT;
function toast(msg, err) {
  toastEl.textContent = msg; toastEl.className = 'toast show' + (err ? ' err' : ''); toastEl.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { toastEl.classList.remove('show'); }, 2600);
}
function shake(id) { const e = document.getElementById(id); if (e) { e.classList.add('shake'); setTimeout(() => e.classList.remove('shake'), 400); } }

function majStatut() {
  const enPartie = !!S.code;
  if (S.netStatus !== 'open' && enPartie) {
    statutEl.hidden = false;
    statutEl.querySelector('.statut-txt').textContent = 'Reconnexion…';
  } else {
    statutEl.hidden = true;
  }
  if (emoteFab) emoteFab.style.display = enPartie ? 'grid' : 'none';
}

// Préserve le focus et la sélection d'un champ à travers un re-render.
function captureFocus() {
  const a = document.activeElement;
  if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA') && a.id) {
    return { id: a.id, start: a.selectionStart, end: a.selectionEnd };
  }
  return null;
}
function restoreFocus(f) {
  if (!f) return;
  const el = document.getElementById(f.id);
  if (el) { el.focus(); try { el.setSelectionRange(f.start, f.end); } catch {} }
}

// Minuteur global : met à jour l'affichage sans re-render complet.
setInterval(() => {
  const el = document.getElementById('timerval');
  if (!el) return;
  const ends = Number(el.getAttribute('data-ends'));
  const s = secLeft(ends);
  el.textContent = s + 's';
  const box = document.getElementById('timerbox');
  if (box) box.classList.toggle('low', s <= 10);
}, 300);

// ── Effets : réactions sonores/visuelles aux transitions d'état ─────────────
function fxReact(prev, next) {
  if (!prev || !next) return;
  try {
    if (next.phase === 'lobby' && prev.players && next.players.length > prev.players.length) fx.sound('join');
    if (prev.phase !== 'voteReveal' && next.phase === 'voteReveal' && next.voteResult && next.voteResult.eliminated) fx.sound('eliminate');
    if (prev.phase !== 'roundEnd' && next.phase === 'roundEnd' && next.winner) { fx.confetti(); fx.sound('win'); }
    if (prev.phase !== 'gameEnd' && next.phase === 'gameEnd') { fx.confetti(160); fx.sound('win'); }
    const pg = prev.game, ng = next.game;
    if (ng) {
      const po = pg ? pg.phase : null, no = ng.phase;
      if (po !== 'over' && no === 'over') { fx.confetti(140); fx.sound('win'); }
      if (po !== 'won' && no === 'won') { fx.confetti(160); fx.sound('win'); }
      if (po !== 'lost' && no === 'lost') { fx.flash(); fx.sound('lose'); }
      if (ng.game === 'bombparty' && pg) {
        const aliveP = (pg.players || []).filter((x) => x.alive).length;
        const aliveN = (ng.players || []).filter((x) => x.alive).length;
        if (aliveN < aliveP) { fx.flash('rgba(255,176,32,0.5)'); fx.sound('explosion'); }
      }
    }
  } catch {}
}

// ── Overlays persistants : réglages + barre d'emotes ────────────────────────
const EMOTES = ['😂', '🤣', '😭', '😡', '👎', '🤡', '💀', '🔥', '🎉', '😎', '🐐', '💩', '❤️', '🤔', '🙄', '😱', '👏', '🤯'];

function buildOverlays() {
  document.body.appendChild(h('button', { class: 'fab fab-gear', title: 'Réglages', onclick: toggleSettings }, '⚙️'));
  emoteFab = h('button', { class: 'fab fab-emote', title: 'Réactions', onclick: toggleEmotes }, '😜');
  emoteFab.style.display = 'none';
  document.body.appendChild(emoteFab);
}
function fxToggle(label, on, cb) {
  return h('div', { class: 'toggle-row', onclick: () => cb(!on) }, h('span', {}, label), h('span', { class: 'toggle' + (on ? ' on' : '') }, h('i', {})));
}
function toggleSettings() {
  if (settingsPanel) { settingsPanel.remove(); settingsPanel = null; return; }
  settingsPanel = h('div', { class: 'fx-panel' },
    h('div', { class: 'kicker' }, 'Réglages'),
    fxToggle('Animations « wow »', fx.settings.anim, (v) => { fx.setAnim(v); rebuildSettings(); }),
    fxToggle('Sons', fx.settings.sound, (v) => { fx.setSound(v); rebuildSettings(); }),
    h('p', { class: 'hint-line' }, 'Réactions & effets visibles par tous.'),
  );
  document.body.appendChild(settingsPanel);
}
function rebuildSettings() { if (settingsPanel) { settingsPanel.remove(); settingsPanel = null; toggleSettings(); } }
let customImg = null;
try { customImg = localStorage.getItem('uc_customimg') || null; } catch {}
function setCustomImg(d) { customImg = d; try { localStorage.setItem('uc_customimg', d); } catch {} }
function resizeDataURL(src, max, cb) {
  const im = new Image();
  im.onload = () => {
    const s = Math.min(1, max / Math.max(im.width, im.height));
    const w = Math.max(1, Math.round(im.width * s)), hh = Math.max(1, Math.round(im.height * s));
    const c = document.createElement('canvas'); c.width = w; c.height = hh;
    c.getContext('2d').drawImage(im, 0, 0, w, hh);
    let d = c.toDataURL('image/jpeg', 0.72);
    if (d.length > 55000) d = c.toDataURL('image/jpeg', 0.5);
    cb(d);
  };
  im.onerror = () => toast('Image illisible', true);
  im.src = src;
}
function pickImageEmote() {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
  inp.onchange = () => {
    const f = inp.files && inp.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => resizeDataURL(r.result, 100, (d) => { setCustomImg(d); send({ t: 'emote', img: d }); if (emotePalette) { toggleEmotes(); toggleEmotes(); } });
    r.readAsDataURL(f);
  };
  inp.click();
}
// Personnages proposés (fun & variés : origines, ninja, fantastique, animaux).
const AVATARS = ['🥷', '🧙‍♂️', '🧝‍♀️', '🧛', '🧟', '🧞', '👽', '👾', '🤖', '👻', '💀', '🤡',
  '🦸🏾‍♂️', '🦹🏻‍♀️', '🧕🏽', '👳🏾', '🧔🏿', '🤴🏿', '👸🏽', '🧑🏿‍🚀', '🤠', '🦊', '🐼', '🦁', '🐯', '🐲', '🦄', '🐸'];

// Choix du personnage : la grille proposée, ou l'emoji de ton choix (clavier).
function toggleAvatars() {
  if (avatarPanel) { avatarPanel.remove(); avatarPanel = null; return; }
  const me = myPlayer();
  const inp = h('input', { class: 'input', id: 'avatar-input', maxlength: 8, placeholder: 'ou ton emoji…', value: (me && me.avatar) || '', style: 'text-align:center;font-size:1.5rem' });
  const apply = () => { const v = (inp.value || '').trim(); if (v) send({ t: 'avatar', avatar: v }); toggleAvatars(); };
  const grid = h('div', { class: 'avatar-grid' }, ...AVATARS.map((e) =>
    h('button', { class: 'emote-btn', onclick: () => { send({ t: 'avatar', avatar: e }); toggleAvatars(); } }, e)));
  avatarPanel = h('div', { class: 'fx-panel', style: 'top:auto;bottom:calc(78px + var(--safe-b));left:12px;right:auto;width:min(300px,86vw)' },
    h('div', { class: 'kicker' }, 'Ton personnage'),
    grid,
    h('div', { style: 'display:flex;gap:8px' }, inp, h('button', { class: 'btn btn-primary btn-sm', onclick: apply }, 'OK')),
  );
  document.body.appendChild(avatarPanel);
}
function toggleEmotes() {
  if (emotePalette) { emotePalette.remove(); emotePalette = null; return; }
  // La palette reste OUVERTE : on peut spammer. On la ferme avec le bouton 😜 ou ✕.
  const items = [
    ...EMOTES.map((e) => h('button', { class: 'emote-btn', onclick: () => send({ t: 'emote', emoji: e }) }, e)),
  ];
  if (customImg) items.push(h('button', { class: 'emote-btn emote-imgbtn', title: 'Mon image', onclick: () => send({ t: 'emote', img: customImg }) }, h('img', { src: customImg, alt: '' })));
  items.push(h('button', { class: 'emote-btn', title: 'Image perso', onclick: pickImageEmote }, '📷'));
  items.push(h('button', { class: 'emote-btn emote-close', title: 'Fermer', onclick: toggleEmotes }, '✕'));
  emotePalette = h('div', { class: 'emote-palette' }, ...items);
  document.body.appendChild(emotePalette);
}

// ── Démarrage ──────────────────────────────────────────────────────────────
async function init() {
  buildOverlays();
  // Lien d'invitation ?p=CODE → écran « rejoindre » pré-rempli.
  const params = new URLSearchParams(location.search);
  const invite = params.get('p');
  if (invite) { S.codeDraft = invite.toUpperCase().replace(/[^A-Z0-9]/g, ''); S.view = 'join'; }

  // Identifiants existants → on tentera la reconnexion à l'ouverture du socket.
  loadCreds();

  // Facettes (catégories) pour l'écran de création.
  try { const r = await fetch('/api/facettes'); if (r.ok) S.facettes = await r.json(); } catch {}

  render();
}
init();
