// ─────────────────────────────────────────────────────────────────────────
//  GameRoom — l'AUTORITÉ d'une partie. Tient tout l'état en mémoire.
//  Le serveur ne fait jamais confiance au client : rôles, mots, votes,
//  éliminations, minuteurs et conditions de victoire sont décidés ici.
//  Les secrets (rôle/mot) ne partent QUE vers le socket du joueur concerné.
// ─────────────────────────────────────────────────────────────────────────
import { safeSend, uuid, avatarPour, couleurPour, normaliserMot, melangerTableau } from './util.js';
import { distribuerRoles, composition, ROLES, MODES, MIN_JOUEURS } from './roles.js';
import { choisirPaire } from './words.js';
import { GAMES, jeuDisponible } from './games/registry.js';
import { makeGame } from './games/index.js';

export const PHASES = {
  LOBBY: 'lobby',
  REVEAL: 'reveal',
  CLUES: 'clues',
  DISCUSSION: 'discussion',
  VOTE: 'vote',
  VOTE_REVEAL: 'voteReveal',
  MRWHITE_GUESS: 'mrWhiteGuess',
  ROUND_END: 'roundEnd',
  GAME_END: 'gameEnd',
};

const CONFIG_DEFAUT = {
  mode: 'both',           // undercover | mrwhite | both (Classique)
  categories: [],         // thèmes choisis (vide = tous)
  relation: 'any',
  clueSeconds: 45,        // 0 = pas de minuteur (avance manuelle par l'hôte)
  voteSeconds: 45,
  rounds: 3,              // nombre de manches de la série
  voteReady: true,        // le vote se lance quand +50% des vivants sont « prêts à voter »
  // Fusion :
  teamMode: false,        // jouer en équipes
  teams: {},              // playerId -> 'A' | 'B'
  fusionThemes: [],       // thèmes de Fusion (vide = tous)
  submitSeconds: 0,       // Fusion : temps pour répondre (0 = infini)
  // Pinturillo :
  roundSeconds: 75,       // temps par dessin (0 = infini)
  // Échelle :
  ladderThemes: [],       // échelles personnalisées
  ladderOnlyCustom: false,// n'utiliser que les échelles perso
};

const VOTE_REVEAL_MS = 6500;   // temps d'affichage du résultat du vote
const MAX_NAME = 20;

export class GameRoom {
  constructor(code) {
    this.code = code;
    this.createdAt = Date.now();
    this.players = [];          // ordre d'arrivée
    this.hostId = null;
    this.phase = PHASES.LOBBY;
    this.selectedGameId = 'undercover'; // jeu choisi par l'hôte dans le lobby
    this.config = { ...CONFIG_DEFAUT };
    this.round = 0;             // manche courante (0 avant la 1re)
    this.cycle = 0;            // cycle indices→vote dans la manche
    this.secret = null;        // { civilWord, undercoverWord, category, relation, difficulty, key }
    this.usedPairKeys = new Set();
    this.clueOrder = [];       // ids, ordre de passage de la manche
    this.activeClueIdx = 0;
    this.clues = [];           // { playerId, name, text, round, cycle }
    this.votes = new Map();    // voterId -> targetId (secret)
    this.voteReadyIds = new Set(); // joueurs « prêts à voter » pendant la discussion
    this.voteCandidates = null; // en cas de second tour (égalité) : ids autorisés
    this.voteResult = null;    // { tally:[{id,name,count}], eliminated:{...} }
    this.mrWhite = null;       // { playerId, name, pending, result }
    this.roundSummary = null;
    this.winner = null;        // 'civils' | 'undercover' | 'mrwhite' | null
    this.seriesOver = false;
    this.timer = null;         // { name, endsAt, handle }
    this.closed = false;
    this.game = null;          // instance de module de jeu (jeux hors Undercover)
    this.history = [];         // historique des parties terminées (salon)
    this.needCommit = false;   // une partie est en cours et pas encore comptabilisée
    this.playedGameId = null;  // jeu réellement lancé (pour l'attribution des stats)
  }

  // ── Score global / profils / historique ──────────────────────────────────
  // Comptabilise la partie qui vient de se jouer dans les stats globales.
  _commitIfNeeded() {
    if (!this.needCommit) return;
    this.needCommit = false;
    const gid = this.playedGameId || this.selectedGameId;
    // Participants = ceux qui ont un score défini pour cette partie.
    const parts = this.players.filter((p) => typeof p.score === 'number');
    if (!parts.length) return;
    const maxScore = Math.max(...parts.map((p) => p.score));
    const gagnants = maxScore > 0 ? parts.filter((p) => p.score === maxScore) : [];
    for (const p of parts) {
      const won = gagnants.includes(p);
      if (!p.stats.byGame[gid]) p.stats.byGame[gid] = { points: 0, wins: 0, losses: 0, games: 0 };
      const bg = p.stats.byGame[gid];
      bg.games += 1; bg.points += p.score; p.stats.gamesPlayed += 1; p.stats.totalPoints += p.score;
      if (won) { bg.wins += 1; p.stats.wins += 1; } else { bg.losses += 1; p.stats.losses += 1; }
    }
    this.history.unshift({
      game: gid,
      at: Date.now(),
      winners: gagnants.map((p) => p.name),
      results: [...parts].sort((a, b) => b.score - a.score).map((p) => ({ name: p.name, avatar: p.avatar, score: p.score })),
    });
    if (this.history.length > 20) this.history.length = 20;
  }

  // ── Joueurs ──────────────────────────────────────────────────────────────
  get connectes() { return this.players.filter((p) => p.connected); }
  get vivants() { return this.players.filter((p) => p.alive); }
  trouver(id) { return this.players.find((p) => p.id === id) || null; }
  estHote(id) { return this.hostId === id; }

  nouveauJoueur(nom, socket) {
    const name = nettoyerNom(nom);
    const index = this.players.length;
    const p = {
      id: uuid(),
      token: uuid(),
      name,
      avatar: avatarPour(index),
      color: couleurPour(index),
      socket,
      connected: true,
      ready: false,
      // état de jeu
      role: null,
      word: null,
      alive: true,
      eliminatedCycle: null,
      revealedRole: null,       // rôle rendu public (après élimination / fin de manche)
      hasVoted: false,
      // rotation + stats
      roleCounts: { civil: 0, undercover: 0, mrwhite: 0 },
      lastSpecial: null,
      score: 0,
      wins: 0,
      losses: 0,
      roundsPlayed: 0,
      // Stats GLOBALES cumulées sur tous les jeux du salon (profil).
      stats: { totalPoints: 0, wins: 0, losses: 0, gamesPlayed: 0, byGame: {} },
    };
    this.players.push(p);
    if (!this.hostId) this.hostId = p.id;
    return p;
  }

  // Renvoie un nom unique et propre.
  nomDisponible(nom) {
    const base = nettoyerNom(nom);
    const pris = new Set(this.players.map((p) => p.name.toLowerCase()));
    if (!pris.has(base.toLowerCase())) return base;
    for (let i = 2; i < 99; i++) {
      const essai = `${base} ${i}`.slice(0, MAX_NAME);
      if (!pris.has(essai.toLowerCase())) return essai;
    }
    return `${base} ${Math.floor(Math.random() * 999)}`;
  }

  reconnecter(token, socket) {
    const p = this.players.find((x) => x.token === token);
    if (!p) return null;
    if (p.socket && p.socket !== socket && p.socket.readyState === 1) {
      try { p.socket.close(4001, 'Reconnexion ailleurs'); } catch {}
    }
    p.socket = socket;
    p.connected = true;
    return p;
  }

  marquerDeconnecte(playerId) {
    const p = this.trouver(playerId);
    if (!p) return;
    p.connected = false;
    p.socket = null;
    p.ready = false;
    // On NE migre PAS l'hôte tout de suite : un simple rechargement de page est
    // une déconnexion brève. Le hub programme une migration différée (délai de
    // grâce) si l'hôte ne revient pas. Une migration immédiate reste faite en
    // cas de départ volontaire (retirer / kick).
  }

  retirer(playerId) {
    const p = this.trouver(playerId);
    if (!p) return;
    // En lobby : suppression pure. En jeu : on le marque déconnecté + non vivant
    // pour ne pas casser la manche en cours.
    if (this.phase === PHASES.LOBBY) {
      this.players = this.players.filter((x) => x.id !== playerId);
    } else {
      p.connected = false;
      p.socket = null;
      p.alive = false;
      if (p.eliminatedCycle == null) p.eliminatedCycle = this.cycle;
    }
    if (this.hostId === playerId) this._migrerHote();
  }

  _migrerHote() {
    const suivant = this.connectes[0] || this.players[0] || null;
    this.hostId = suivant ? suivant.id : null;
  }

  // ── Lobby : prêt / config / kick / démarrage ─────────────────────────────
  setReady(playerId, value) {
    const p = this.trouver(playerId);
    if (!p || this.phase !== PHASES.LOBBY) return;
    p.ready = !!value;
  }

  // Choix du personnage (avatar). Cosmétique, autorisé à tout moment.
  setAvatar(playerId, avatar) {
    const p = this.trouver(playerId);
    if (!p) return;
    const a = String(avatar || '').slice(0, 16).trim();
    if (a) p.avatar = a;
  }

  // L'hôte choisit le jeu dans le lobby (menu de sélection).
  setGame(hostId, gameId) {
    if (!this.estHote(hostId) || this.phase !== PHASES.LOBBY) return;
    if (GAMES.some((g) => g.id === gameId)) this.selectedGameId = gameId;
  }

  setConfig(hostId, patch) {
    if (!this.estHote(hostId) || this.phase !== PHASES.LOBBY) return;
    const c = this.config;
    if (patch.mode && ['undercover', 'mrwhite', 'both'].includes(patch.mode)) c.mode = patch.mode;
    if (Array.isArray(patch.categories)) c.categories = patch.categories.filter((x) => typeof x === 'string').slice(0, 60);
    if (typeof patch.relation === 'string') c.relation = patch.relation;
    for (const k of ['clueSeconds', 'voteSeconds', 'submitSeconds', 'roundSeconds']) {
      if (patch[k] != null) c[k] = clamp(parseInt(patch[k], 10) || 0, 0, 600);
    }
    if (patch.rounds != null) c.rounds = clamp(parseInt(patch.rounds, 10) || 1, 1, 20);
    if (patch.voteReady != null) c.voteReady = !!patch.voteReady;
    // Fusion : équipes + thèmes.
    if (patch.teamMode != null) c.teamMode = !!patch.teamMode;
    if (patch.teams && typeof patch.teams === 'object') c.teams = patch.teams;
    if (Array.isArray(patch.fusionThemes)) c.fusionThemes = patch.fusionThemes.filter((x) => typeof x === 'string').slice(0, 60);
    // Échelle : échelles personnalisées.
    if (Array.isArray(patch.ladderThemes)) c.ladderThemes = patch.ladderThemes.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim().slice(0, 80)).slice(0, 50);
    if (patch.ladderOnlyCustom != null) c.ladderOnlyCustom = !!patch.ladderOnlyCustom;
  }

  kick(hostId, targetId) {
    if (!this.estHote(hostId) || this.phase !== PHASES.LOBBY) return;
    if (targetId === hostId) return;
    this.players = this.players.filter((p) => p.id !== targetId);
    const cible = this.trouver(targetId);
    if (cible && cible.socket) { try { cible.socket.close(4002, 'Exclu par l’hôte'); } catch {} }
  }

  minJoueursJeu() {
    const g = GAMES.find((x) => x.id === this.selectedGameId);
    return (g && g.min) || MIN_JOUEURS;
  }

  peutDemarrer() {
    return this.connectes.length >= this.minJoueursJeu();
  }

  demarrer(hostId) {
    if (!this.estHote(hostId)) return { error: "Seul l'hôte peut lancer la partie." };
    if (!jeuDisponible(this.selectedGameId)) return { error: 'Ce jeu n’est pas encore disponible.' };
    const min = this.minJoueursJeu();
    if (this.connectes.length < min) return { error: `Il faut au moins ${min} joueurs connectés.` };
    // Comptabilise la partie précédente (si on relance sans repasser par le lobby).
    this._commitIfNeeded();
    this.playedGameId = this.selectedGameId;
    this.needCommit = true;
    // On (re)fige les scores/rôles de tous les joueurs.
    for (const p of this.players) {
      p.roleCounts = { civil: 0, undercover: 0, mrwhite: 0 };
      p.lastSpecial = null;
      p.score = 0; p.wins = 0; p.losses = 0; p.roundsPlayed = 0;
    }
    if (this.selectedGameId === 'undercover') {
      this.game = null;
      this.round = 0;
      this.seriesOver = false;
      this._nouvelleManche();
    } else {
      // Jeu « module » : le socle délègue toute la logique au module.
      this.game = makeGame(this.selectedGameId, this);
      if (!this.game) return { error: 'Jeu indisponible.' };
      this.phase = 'ingame';
      this.game.start(this.config);
    }
    return { ok: true };
  }

  // Emote / réaction animée : diffusée à tous (transitoire, hors état), façon
  // Mario Party. Anti-spam par joueur.
  emote(playerId, emoji, img) {
    const p = this.trouver(playerId);
    if (!p) return;
    const now = Date.now();
    if (p._lastEmote && now - p._lastEmote < 150) return; // anti-flood léger : ~6/s max
    p._lastEmote = now;
    const payload = { t: 'emote', from: p.name, color: p.color };
    // Image perso (petite vignette data-URL) OU emoji.
    if (typeof img === 'string' && img.startsWith('data:image/') && img.length <= 60000) {
      payload.img = img;
    } else {
      const clean = String(emoji || '').slice(0, 12);
      if (!clean) return;
      payload.emoji = clean;
    }
    for (const q of this.players) if (q.socket) safeSend(q.socket, payload);
  }

  // Relais du dessin en temps réel (Pinturillo) : transitoire, diffusé aux
  // AUTRES joueurs (le dessinateur a déjà son trait localement). Pas de
  // diffusion d'état complète (trop lourd pour chaque segment).
  drawAction(pid, msg) {
    if (!this.game || typeof this.game.handleDraw !== 'function') return;
    const p = this.trouver(pid);
    if (!p) return;
    const relay = this.game.handleDraw(p, msg);
    if (!relay) return;
    const payload = { t: 'draw', ...relay };
    for (const q of this.players) if (q.socket && q.id !== pid) safeSend(q.socket, payload);
  }

  // Route une action de jeu vers le module actif.
  gameAction(pid, msg) {
    if (!this.game) return { error: 'Aucun jeu en cours.' };
    const p = this.trouver(pid);
    if (!p) return {};
    return this.game.handleAction(p, msg.action, msg) || {};
  }

  // ── Déroulé d'une manche ─────────────────────────────────────────────────
  _nouvelleManche() {
    this._clearTimer();
    this.round += 1;
    this.cycle = 0;
    this.winner = null;
    this.roundSummary = null;
    this.voteResult = null;
    this.mrWhite = null;
    this.clues = [];
    this.votes.clear();
    this.voteCandidates = null;

    // Seuls les joueurs connectés participent à la manche.
    const participants = this.connectes;
    for (const p of this.players) {
      p.alive = false;
      p.role = null;
      p.word = null;
      p.revealedRole = null;
      p.eliminatedCycle = null;
      p.hasVoted = false;
      p.ready = false;
    }
    for (const p of participants) p.alive = true;

    // Rôles selon le mode choisi (+ rotation anti-répétition).
    distribuerRoles(participants, this.config.mode);

    // Mots cohérents selon les filtres.
    this.secret = choisirPaire(
      { categories: this.config.categories, relation: this.config.relation },
      this.usedPairKeys,
    );
    this.usedPairKeys.add(this.secret.key);

    for (const p of participants) {
      if (p.role === ROLES.CIVIL) p.word = this.secret.civilWord;
      else if (p.role === ROLES.UNDERCOVER) p.word = this.secret.undercoverWord;
      else p.word = null; // mister white : aucun mot
    }

    // Ordre de passage figé pour la manche (mélangé).
    this.clueOrder = melangerTableau(participants.map((p) => p.id));

    this.phase = PHASES.REVEAL;
  }

  // L'hôte lance le tour d'indices depuis l'écran de révélation.
  lancerIndices(hostId) {
    if (!this.estHote(hostId) || this.phase !== PHASES.REVEAL) return;
    this._demarrerCycleIndices();
  }

  _demarrerCycleIndices() {
    this.cycle += 1;
    this.votes.clear();
    this.voteCandidates = null;
    this.voteResult = null;
    for (const p of this.players) p.hasVoted = false;
    // Ordre = joueurs vivants dans l'ordre de la manche.
    this.clueOrder = this.clueOrder.filter((id) => { const p = this.trouver(id); return p && p.alive; });
    this.activeClueIdx = 0;
    this.phase = PHASES.CLUES;
    this._armerTimerIndice();
    // Cette transition peut être déclenchée par un minuteur (après le
    // dépouillement) : on diffuse pour que les clients quittent l'écran de vote.
    this._broadcastRef && this._broadcastRef();
  }

  _armerTimerIndice() {
    this._clearTimer();
    const secs = this.config.clueSeconds;
    if (secs > 0) {
      this._setTimer('clue', secs, () => this._autoIndice());
    }
  }

  _joueurActifIndice() {
    return this.trouver(this.clueOrder[this.activeClueIdx]);
  }

  soumettreIndice(playerId, texte) {
    if (this.phase !== PHASES.CLUES) return { error: 'Ce n’est pas la phase des indices.' };
    const actif = this._joueurActifIndice();
    if (!actif || actif.id !== playerId) return { error: 'Ce n’est pas votre tour.' };
    const clue = String(texte || '').trim().slice(0, 60) || '—';
    this.clues.push({ playerId, name: actif.name, text: clue, round: this.round, cycle: this.cycle });
    this._avancerIndice();
    return { ok: true };
  }

  _autoIndice() {
    // Le minuteur a expiré : indice vide automatique, on avance.
    const actif = this._joueurActifIndice();
    if (actif) this.clues.push({ playerId: actif.id, name: actif.name, text: '⏱ (pas d’indice)', round: this.round, cycle: this.cycle });
    this._avancerIndice();
    this._broadcastRef && this._broadcastRef();
  }

  // L'hôte peut faire passer le joueur actif (utile s'il est absent).
  passerIndice(hostId) {
    if (!this.estHote(hostId) || this.phase !== PHASES.CLUES) return;
    const actif = this._joueurActifIndice();
    if (actif) this.clues.push({ playerId: actif.id, name: actif.name, text: '(passé)', round: this.round, cycle: this.cycle });
    this._avancerIndice();
  }

  _avancerIndice() {
    this.activeClueIdx += 1;
    if (this.activeClueIdx >= this.clueOrder.length) {
      // Fin d'un tour : on RELANCE un tour d'indices (à l'infini). Le vote ne se
      // déclenche qu'à la majorité des « prêts à voter » (ou par l'hôte).
      this._demarrerCycleIndices();
    } else {
      this._armerTimerIndice();
    }
  }

  _entrerDiscussion() {
    this._clearTimer();
    this.voteReadyIds = new Set();  // remise à zéro des « prêts à voter »
    this.phase = PHASES.DISCUSSION;
    // Pas de minuteur : le vote se lance quand la majorité est prête (ou l'hôte).
  }

  // Chaque joueur peut se déclarer « prêt à voter » À TOUT MOMENT (pendant les
  // indices ou la discussion) ; à la majorité, le vote s'ouvre.
  marquerPretVote(playerId, value) {
    if (this.phase !== PHASES.CLUES && this.phase !== PHASES.DISCUSSION) return;
    if (!this.config.voteReady) return;
    const p = this.trouver(playerId);
    if (!p || !p.alive) return;
    if (!this.voteReadyIds) this.voteReadyIds = new Set();
    if (value) this.voteReadyIds.add(playerId); else this.voteReadyIds.delete(playerId);
    // « Plus de la moitié » des joueurs vivants (connectés) → on lance le vote.
    const vivants = this.vivants.filter((x) => x.connected);
    const prets = vivants.filter((x) => this.voteReadyIds.has(x.id)).length;
    if (vivants.length && prets > vivants.length / 2) {
      this._entrerVote();
    }
    this._broadcastRef && this._broadcastRef();
  }

  // L'hôte peut ouvrir le vote directement (pendant les indices ou la discussion).
  ouvrirVote(hostId) {
    if (!this.estHote(hostId)) return;
    if (this.phase !== PHASES.CLUES && this.phase !== PHASES.DISCUSSION) return;
    this._entrerVote();
  }

  _entrerVote() {
    this._clearTimer();
    this.votes.clear();
    for (const p of this.players) p.hasVoted = false;
    this.phase = PHASES.VOTE;
    const secs = this.config.voteSeconds;
    if (secs > 0) this._setTimer('vote', secs, () => this._cloturerVote());
    this._broadcastRef && this._broadcastRef();
  }

  voter(playerId, targetId) {
    if (this.phase !== PHASES.VOTE) return { error: 'Ce n’est pas la phase de vote.' };
    const votant = this.trouver(playerId);
    if (!votant || !votant.alive) return { error: 'Seuls les joueurs en vie votent.' };
    const cible = this.trouver(targetId);
    if (!cible || !cible.alive) return { error: 'Cible invalide.' };
    if (cible.id === votant.id) return { error: 'On ne vote pas pour soi-même.' };
    if (this.voteCandidates && !this.voteCandidates.includes(cible.id)) {
      return { error: 'Ce joueur n’est pas au second tour.' };
    }
    this.votes.set(votant.id, cible.id);
    votant.hasVoted = true;
    // Tous les votants vivants ont voté ?
    if (this._votantsAttendus().every((p) => this.votes.has(p.id))) {
      this._cloturerVote();
    }
    return { ok: true };
  }

  _votantsAttendus() {
    // Joueurs vivants et connectés (les déconnectés ne bloquent pas le vote).
    let base = this.vivants.filter((p) => p.connected);
    if (this.voteCandidates) {
      // Au second tour, tout le monde vote encore, mais seulement pour les candidats.
      return base;
    }
    return base;
  }

  _cloturerVote() {
    this._clearTimer();
    // Décompte.
    const compte = new Map();
    for (const targetId of this.votes.values()) {
      compte.set(targetId, (compte.get(targetId) || 0) + 1);
    }
    const tally = [...compte.entries()]
      .map(([id, count]) => { const p = this.trouver(id); return { id, name: p ? p.name : '?', count }; })
      .sort((a, b) => b.count - a.count);

    // Personne n'a voté → pas d'élimination, on repart en discussion/indices.
    if (tally.length === 0) {
      this.voteResult = { tally: [], eliminated: null, egalite: false };
      this.phase = PHASES.VOTE_REVEAL;
      this._setTimer('reveal', VOTE_REVEAL_MS / 1000, () => this._apresVoteReveal());
      this._broadcastRef && this._broadcastRef();
      return;
    }

    const max = tally[0].count;
    const exAequo = tally.filter((t) => t.count === max);

    if (exAequo.length > 1 && !this.voteCandidates) {
      // Égalité au 1er tour → second tour entre les concernés.
      this.voteCandidates = exAequo.map((t) => t.id);
      this.votes.clear();
      for (const p of this.players) p.hasVoted = false;
      this.voteResult = { tally, eliminated: null, egalite: true, candidates: this.voteCandidates.slice() };
      this.phase = PHASES.VOTE_REVEAL;
      this._setTimer('reveal', VOTE_REVEAL_MS / 1000, () => this._relancerVoteSecondTour());
      this._broadcastRef && this._broadcastRef();
      return;
    }

    // Égalité persistante au second tour → on tranche au hasard parmi les ex æquo.
    let elimineId = tally[0].id;
    if (exAequo.length > 1) {
      elimineId = exAequo[Math.floor(Math.random() * exAequo.length)].id;
    }

    const elimine = this.trouver(elimineId);
    elimine.alive = false;
    elimine.eliminatedCycle = this.cycle;
    elimine.revealedRole = elimine.role; // le rôle de l'éliminé devient public

    this.voteCandidates = null;
    this.voteResult = {
      tally,
      eliminated: { id: elimine.id, name: elimine.name, role: elimine.role },
      egalite: false,
    };
    this.phase = PHASES.VOTE_REVEAL;
    this._setTimer('reveal', VOTE_REVEAL_MS / 1000, () => this._apresVoteReveal());
    this._broadcastRef && this._broadcastRef();
  }

  _relancerVoteSecondTour() {
    this.voteResult = null;
    this.phase = PHASES.VOTE;
    const secs = this.config.voteSeconds;
    if (secs > 0) this._setTimer('vote', secs, () => this._cloturerVote());
    this._broadcastRef && this._broadcastRef();
  }

  _apresVoteReveal() {
    this._clearTimer();
    const elim = this.voteResult && this.voteResult.eliminated;
    if (!elim) {
      // Aucune élimination : nouveau cycle d'indices si la partie continue.
      const fin = this._evaluerFin();
      if (fin) return this._terminerManche(fin);
      return this._demarrerCycleIndices();
    }
    const elimine = this.trouver(elim.id);
    // Cas spécial Mister White : dernière chance de deviner.
    if (elimine.role === ROLES.MRWHITE) {
      this.mrWhite = { playerId: elimine.id, name: elimine.name, pending: true, result: null };
      this.phase = PHASES.MRWHITE_GUESS;
      // Minuteur de sécurité pour ne pas bloquer si MW ne répond pas.
      this._setTimer('mrwhite', 45, () => this.deviner(elimine.id, ''));
      this._broadcastRef && this._broadcastRef();
      return;
    }
    // Sinon on évalue la fin de manche.
    const fin = this._evaluerFin();
    if (fin) return this._terminerManche(fin);
    this._demarrerCycleIndices();
  }

  deviner(playerId, motPropose) {
    if (this.phase !== PHASES.MRWHITE_GUESS) return { error: 'Pas de devinette en cours.' };
    if (!this.mrWhite || this.mrWhite.playerId !== playerId) return { error: 'Vous n’êtes pas Mister White.' };
    this._clearTimer();
    const bon = normaliserMot(motPropose) && normaliserMot(motPropose) === normaliserMot(this.secret.civilWord);
    this.mrWhite.pending = false;
    this.mrWhite.result = { guess: String(motPropose || '').trim(), correct: !!bon };
    if (bon) {
      // Mister White gagne immédiatement la manche.
      return this._terminerManche('mrwhite');
    }
    // Mauvaise réponse : MW reste éliminé, on évalue la suite.
    const fin = this._evaluerFin();
    if (fin) return this._terminerManche(fin);
    this._demarrerCycleIndices();
    this._broadcastRef && this._broadcastRef();
    return { ok: true };
  }

  // Conditions de victoire (hors victoire immédiate de Mister White par devinette).
  // Générique pour les 3 modes : « imposteur » = Undercover et/ou Mister White.
  _evaluerFin() {
    const vivants = this.vivants;
    const impostorsVivants = vivants.filter((p) => p.role === ROLES.UNDERCOVER || p.role === ROLES.MRWHITE);
    const civilsVivants = vivants.filter((p) => p.role === ROLES.CIVIL);

    // 1) Tous les imposteurs éliminés → Civils gagnent.
    if (impostorsVivants.length === 0) return 'civils';
    // 2) Un imposteur atteint la parité/majorité → le camp imposteur gagne.
    if (impostorsVivants.length >= civilsVivants.length) {
      return impostorsVivants.some((p) => p.role === ROLES.UNDERCOVER) ? 'undercover' : 'mrwhite';
    }
    // Sécurité anti-blocage : plus assez de joueurs pour continuer.
    if (vivants.length <= 1) {
      if (impostorsVivants.some((p) => p.role === ROLES.UNDERCOVER)) return 'undercover';
      if (impostorsVivants.length) return 'mrwhite';
      return 'civils';
    }
    // Sinon on continue (nouveau cycle d'indices).
    return null;
  }

  _terminerManche(winner) {
    this._clearTimer();
    this.winner = winner;
    this.phase = PHASES.ROUND_END;

    // Révélation publique de tous les rôles.
    for (const p of this.players) {
      if (p.role) p.revealedRole = p.role;
    }

    // Attribution des points + bilan gagnant/perdant.
    const participants = this.players.filter((p) => p.role);
    for (const p of participants) p.roundsPlayed += 1;

    const gagne = (p) => {
      if (winner === 'civils') return p.role === ROLES.CIVIL;
      if (winner === 'undercover') return p.role === ROLES.UNDERCOVER;
      if (winner === 'mrwhite') return p.role === ROLES.MRWHITE;
      return false;
    };
    for (const p of participants) {
      if (gagne(p)) {
        p.wins += 1;
        if (p.role === ROLES.CIVIL) p.score += p.alive ? 3 : 2;
        else p.score += 4; // rôles spéciaux : victoire plus difficile
      } else {
        p.losses += 1;
      }
    }

    this.roundSummary = {
      winner,
      civilWord: this.secret.civilWord,
      undercoverWord: this.secret.undercoverWord,
      category: this.secret.category,
      relation: this.secret.relation,
      difficulty: this.secret.difficulty,
      mrWhiteGuess: this.mrWhite ? this.mrWhite.result : null,
      roles: participants.map((p) => ({ id: p.id, name: p.name, role: p.role, alive: p.alive, points: p.score })),
    };

    if (this.round >= this.config.rounds) this.seriesOver = true;
    this._broadcastRef && this._broadcastRef();
  }

  mancheSuivante(hostId) {
    if (!this.estHote(hostId)) return { error: "Seul l'hôte peut lancer la manche suivante." };
    if (this.phase !== PHASES.ROUND_END && this.phase !== PHASES.GAME_END) return { error: 'Pas maintenant.' };
    if (this.connectes.length < MIN_JOUEURS) return { error: `Il faut au moins ${MIN_JOUEURS} joueurs connectés.` };
    this._nouvelleManche();
    return { ok: true };
  }

  terminerPartie(hostId) {
    if (!this.estHote(hostId)) return;
    this._clearTimer();
    this.phase = PHASES.GAME_END;
    this.seriesOver = true;
    this._broadcastRef && this._broadcastRef();
  }

  retourLobby(hostId) {
    if (!this.estHote(hostId)) return;
    this._commitIfNeeded(); // comptabilise la partie qui vient de se terminer
    if (this.game) { this.game.cleanup(); this.game = null; }
    this._clearTimer();
    this.phase = PHASES.LOBBY;
    this.round = 0;
    this.winner = null;
    this.roundSummary = null;
    this.voteResult = null;
    this.mrWhite = null;
    this.usedPairKeys.clear();
    for (const p of this.players) {
      p.alive = true; p.ready = false; p.role = null; p.word = null;
      p.revealedRole = null; p.eliminatedCycle = null; p.hasVoted = false;
    }
    this._broadcastRef && this._broadcastRef();
  }

  // ── Minuteurs ────────────────────────────────────────────────────────────
  _setTimer(name, seconds, cb) {
    this._clearTimer();
    const endsAt = Date.now() + seconds * 1000;
    const handle = setTimeout(() => { this.timer = null; cb(); }, seconds * 1000);
    if (handle.unref) handle.unref();
    this.timer = { name, endsAt, handle, cb };
  }

  _clearTimer() {
    if (this.timer && this.timer.handle) clearTimeout(this.timer.handle);
    this.timer = null;
  }

  // Déclenche immédiatement le minuteur courant (utilisé par les tests).
  avancerMinuteur() {
    if (!this.timer || !this.timer.cb) return false;
    const cb = this.timer.cb;
    this._clearTimer();
    cb();
    return true;
  }

  // Liste PUBLIque générique des joueurs (utilisée par les jeux « modules »).
  _playersPublic() {
    return this.players.map((p) => ({
      id: p.id, name: p.name, avatar: p.avatar, color: p.color,
      isHost: p.id === this.hostId, connected: p.connected, ready: p.ready,
      score: p.score || 0, wins: p.wins || 0, losses: p.losses || 0,
      stats: p.stats,
    }));
  }

  // État PUBLIC d'un jeu « module ».
  _moduleState() {
    return {
      code: this.code,
      phase: 'ingame',
      hostId: this.hostId,
      selectedGameId: this.selectedGameId,
      games: GAMES,
      minPlayers: this.minJoueursJeu(),
      config: { ...this.config },
      players: this._playersPublic(),
      history: this.history,
      game: this.game.publicState(),
    };
  }

  // ── Instantané PUBLIC (aucun secret des joueurs vivants) ──────────────────
  publicState() {
    if (this.game) return this._moduleState();
    const actif = this.phase === PHASES.CLUES ? this._joueurActifIndice() : null;
    return {
      code: this.code,
      phase: this.phase,
      round: this.round,
      cycle: this.cycle,
      hostId: this.hostId,
      config: { ...this.config },
      seriesOver: this.seriesOver,
      winner: this.winner,
      minPlayers: MIN_JOUEURS,
      games: GAMES,
      selectedGameId: this.selectedGameId,
      composition: composition(this.connectes.length || this.players.length, this.config.mode),
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        color: p.color,
        isHost: p.id === this.hostId,
        connected: p.connected,
        ready: p.ready,
        alive: p.alive,
        hasVoted: p.hasVoted,
        // Le rôle n'est public QUE s'il a été révélé (élimination / fin de manche).
        revealedRole: p.revealedRole,
        score: p.score,
        wins: p.wins,
        losses: p.losses,
        roundsPlayed: p.roundsPlayed,
        stats: p.stats,
      })),
      history: this.history,
      clueOrder: this.clueOrder.slice(),
      activeClueId: actif ? actif.id : null,
      clues: this.clues.map((c) => ({ playerId: c.playerId, name: c.name, text: c.text, cycle: c.cycle })),
      discussion: (this.phase === PHASES.CLUES || this.phase === PHASES.DISCUSSION) ? (() => {
        const vivants = this.vivants.filter((p) => p.connected);
        return {
          enabled: this.config.voteReady,
          readyIds: [...(this.voteReadyIds || [])],
          readyCount: vivants.filter((p) => this.voteReadyIds.has(p.id)).length,
          totalAlive: vivants.length,
          needed: Math.floor(vivants.length / 2) + 1,
        };
      })() : null,
      vote: this.phase === PHASES.VOTE ? {
        open: true,
        votedCount: [...this.votes.keys()].length,
        totalVoters: this._votantsAttendus().length,
        secondTour: !!this.voteCandidates,
        candidates: this.voteCandidates ? this.voteCandidates.slice() : null,
      } : null,
      voteResult: (this.phase === PHASES.VOTE_REVEAL) ? this.voteResult : null,
      mrWhite: (this.phase === PHASES.MRWHITE_GUESS || (this.mrWhite && this.phase === PHASES.ROUND_END))
        ? { playerId: this.mrWhite.playerId, name: this.mrWhite.name, pending: this.mrWhite.pending, result: this.mrWhite.result }
        : null,
      roundSummary: this.phase === PHASES.ROUND_END ? this.roundSummary : null,
      timer: this.timer ? { name: this.timer.name, endsAt: this.timer.endsAt } : null,
    };
  }

  // Secret PRIVÉ, uniquement pour le socket du joueur concerné.
  // RÈGLE DU JEU : on n'envoie JAMAIS le rôle au client. Un joueur ne doit pas
  // savoir s'il est Civil ou Undercover — il ne voit que son mot. Mister White
  // se reconnaît au fait qu'il n'a aucun mot (word = null). Impossible donc de
  // découvrir son camp en inspectant le trafic réseau.
  secretFor(playerId) {
    const p = this.trouver(playerId);
    if (!p || !p.role) return { word: null, inGame: false };
    return { word: p.word ?? null, inGame: true };
  }

  // ── Diffusion ────────────────────────────────────────────────────────────
  // _broadcastRef est branché par le hub pour que les minuteurs diffusent aussi.
  brancherDiffusion(fn) { this._broadcastRef = fn; }

  diffuser() {
    const pub = this.publicState();
    for (const p of this.players) {
      if (!p.socket) continue;
      safeSend(p.socket, { t: 'room', you: p.id, state: pub });
      // Secret privé, uniquement pour le joueur concerné.
      let secret = null;
      if (this.game) secret = this.game.secretFor(p);
      // Undercover : jamais le rôle, seulement le mot (null pour Mister White).
      else if (p.role) secret = { word: p.word ?? null };
      if (secret) safeSend(p.socket, { t: 'secret', ...secret });
    }
  }
}

function nettoyerNom(nom) {
  let n = String(nom || '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
  if (!n) n = 'Joueur';
  return n;
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
