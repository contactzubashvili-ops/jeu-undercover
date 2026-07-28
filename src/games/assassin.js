// ─────────────────────────────────────────────────────────────────────────
//  ASSASSIN — chasse à l'aveugle autour d'une table (3 à 10 joueurs).
//  Tous les joueurs sont assis en cercle dans un ordre ALÉATOIRE. Chaque joueur
//  a une CIBLE à abattre (une autre personne, connue de lui), mais ne voit QUE
//  son propre siège : tous les autres sièges lui apparaissent masqués (« ? »).
//  Pour retrouver où sa cible est assise, on CHUCHOTE (chat privé de siège à
//  siège) puis on TIRE sur un siège. Le premier tir met fin à la manche.
//
//  Deux modes :
//   • classique — chacun a une cible différente (dérangement) ; le tireur gagne
//     +1 si c'était bien sa cible, −1 sinon ; 0 si l'on n'a pas tiré.
//   • équipes — des binômes SECRETS (on ne connaît pas son coéquipier). Les deux
//     membres visent chacun une cible distincte de la MÊME équipe adverse ; les
//     tirs ne partent QUE lorsque les DEUX ont verrouillé. +1 chacun si les deux
//     cibles sont exactes, −1 chacun sinon. Chaque équipe a un MOT SECRET (parmi
//     500) pour se reconnaître via les chuchotements.
//
//  SÉCURITÉ : le siège des autres, les rôles/binômes et les cibles d'autrui ne
//  sortent JAMAIS dans publicState. Chaque joueur reçoit son siège, sa cible,
//  son mot d'équipe et ses fils de chuchotement via secretFor (à lui seul).
// ─────────────────────────────────────────────────────────────────────────
import { GameModule } from './base.js';
import { melangerTableau } from '../util.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const META = { min: 3, max: 10 };

const __dirname = dirname(fileURLToPath(import.meta.url));

const SUSPENSE_SECONDS = 3;   // croix affichée, identités encore masquées
const REVEAL_HOLD = 6;        // durée du révélé avant la manche suivante
const MAX_CHAT = 40;          // messages gardés par fil de chuchotement

// Mots secrets d'équipe (repli intégré, remplacé par la grande liste si présente).
let MOTS_SECRETS = [
  'Tulipe', 'Rose', 'Jonquille', 'Lilas', 'Muguet', 'Pivoine', 'Coquelicot', 'Bleuet',
  'Renard', 'Hibou', 'Panthère', 'Lynx', 'Belette', 'Corbeau', 'Faucon', 'Loutre',
  'Cerise', 'Myrtille', 'Grenade', 'Figue', 'Mangue', 'Noisette', 'Abricot', 'Prune',
  'Marteau', 'Boussole', 'Lanterne', 'Ancre', 'Clé', 'Sablier', 'Plume', 'Miroir',
  'Comète', 'Volcan', 'Cascade', 'Récif', 'Dune', 'Glacier', 'Orage', 'Brume',
];
try {
  const arr = JSON.parse(readFileSync(join(__dirname, '..', 'data', 'assassin-mots.json'), 'utf8'));
  const clean = [...new Set(arr.filter((w) => typeof w === 'string' && w.trim().length >= 3).map((w) => w.trim()))];
  if (clean.length > 40) MOTS_SECRETS = clean;
} catch { /* repli sur la liste intégrée */ }

export class AssassinGame extends GameModule {
  start(config) {
    config = config || {};
    this.startConfig = config;
    this.totalRounds = clamp(parseInt(config.rounds, 10) || 5, 1, 20);
    // Le mode « équipes » exige un nombre PAIR d'au moins 4 joueurs ; sinon on
    // retombe proprement sur le mode classique (signalé à l'écran).
    const N = this.connectes.length;
    const veutEquipes = !!config.teamMode;
    this.mode = (veutEquipes && N >= 4 && N % 2 === 0) ? 'teams' : 'classic';
    this.coercedClassic = veutEquipes && this.mode !== 'teams';

    for (const p of this.players) p.score = 0;
    this.round = 0;
    this._nouvelleManche();
  }

  // ── Nouvelle manche : on rebat les sièges ET les cibles ───────────────────
  _nouvelleManche() {
    this.clearTimer();
    this.round += 1;
    this.phase = 'play';
    this.pendingShots = {};       // pid -> siège verrouillé (mode équipes)
    this.killedSeats = [];        // sièges touchés (croix)
    this.firedTeam = null;        // équipe qui a tiré (mode équipes)
    this.results = [];            // détail du révélé
    this.chats = new Map();       // fils de chuchotement de la manche

    const joueurs = this.connectes;
    // Sièges : ordre aléatoire, indépendant des cibles.
    this.seats = melangerTableau(joueurs).map((p) => p.id);
    this.seatOf = {};
    this.seats.forEach((id, i) => { this.seatOf[id] = i; });

    if (this.mode === 'teams') this._assignerEquipes(joueurs);
    else this._assignerCiblesClassique(joueurs);

    this.broadcast();
  }

  // Dérangement cyclique : chacun vise le suivant dans un ordre mélangé — aucune
  // cible sur soi, toutes distinctes.
  _assignerCiblesClassique(joueurs) {
    const ordre = melangerTableau(joueurs);
    this.targets = {};
    const n = ordre.length;
    ordre.forEach((p, i) => { this.targets[p.id] = ordre[(i + 1) % n].id; });
    this.teams = null; this.teamOf = null; this.words = null;
  }

  // Binômes secrets : k équipes de 2 en cycle ; l'équipe t chasse l'équipe t+1,
  // membre par membre (2 cibles distinctes de la même équipe adverse).
  _assignerEquipes(joueurs) {
    const ordre = melangerTableau(joueurs);
    const k = ordre.length / 2;
    this.teams = [];
    for (let t = 0; t < k; t++) this.teams.push([ordre[2 * t].id, ordre[2 * t + 1].id]);
    this.teamOf = {};
    this.teams.forEach((m, idx) => { m.forEach((id) => { this.teamOf[id] = idx; }); });
    // Mots secrets distincts par équipe.
    const mots = melangerTableau(MOTS_SECRETS).slice(0, k);
    this.words = {};
    this.teams.forEach((_, idx) => { this.words[idx] = mots[idx]; });
    // Cibles : membre j de l'équipe t vise membre j de l'équipe (t+1)%k.
    this.targets = {};
    this.teams.forEach((membres, t) => {
      const adverse = this.teams[(t + 1) % k];
      membres.forEach((id, j) => { this.targets[id] = adverse[j].id ?? adverse[j]; });
    });
  }

  handleAction(player, action, msg) {
    msg = msg || {};

    if (action === 'whisper') {
      if (this.phase !== 'play') return { error: 'La manche est terminée.' };
      const seat = parseInt(msg.seat, 10);
      const mySeat = this.seatOf[player.id];
      if (!Number.isInteger(seat) || seat < 0 || seat >= this.seats.length) return { error: 'Siège invalide.' };
      if (seat === mySeat) return { error: 'On ne se chuchote pas à soi-même.' };
      const texte = String(msg.text || '').trim().slice(0, 240);
      if (!texte) return { error: 'Message vide.' };
      const key = mySeat < seat ? `${mySeat}:${seat}` : `${seat}:${mySeat}`;
      let ch = this.chats.get(key);
      if (!ch) { ch = { messages: [] }; this.chats.set(key, ch); }
      ch.messages.push({ fromSeat: mySeat, text: texte });
      if (ch.messages.length > MAX_CHAT) ch.messages = ch.messages.slice(-MAX_CHAT);
      return { ok: true };
    }

    if (action === 'shoot') {
      if (this.phase !== 'play') return { error: 'On ne peut plus tirer.' };
      const seat = parseInt(msg.seat, 10);
      const mySeat = this.seatOf[player.id];
      if (!Number.isInteger(seat) || seat < 0 || seat >= this.seats.length) return { error: 'Siège invalide.' };
      if (seat === mySeat) return { error: 'On ne se tire pas dessus.' };

      if (this.mode === 'classic') {
        this._resoudreClassique(player.id, seat);
        return { ok: true };
      }
      // Mode équipes : on VERROUILLE (toggle) ; le tir ne part qu'une fois le
      // binôme au complet.
      if (this.pendingShots[player.id] === seat) delete this.pendingShots[player.id]; // re-clic = annuler
      else this.pendingShots[player.id] = seat;
      const equipe = this.teamOf[player.id];
      const membres = this.teams[equipe];
      if (membres.every((id) => this.pendingShots[id] != null)) this._resoudreEquipe(equipe);
      return { ok: true };
    }

    if (action === 'next') {
      if (!this.estHote(player.id) || this.phase !== 'reveal') return;
      this._apresReveal();
      return { ok: true };
    }

    if (action === 'restart') {
      if (!this.estHote(player.id) || this.phase !== 'over') return;
      this.start(this.startConfig);
      return { ok: true };
    }
  }

  _resoudreClassique(shooterId, seat) {
    const victimId = this.seats[seat];
    const correct = this.targets[shooterId] === victimId;
    const shooter = this.trouver(shooterId);
    shooter.score = (shooter.score || 0) + (correct ? 1 : -1);
    this.killedSeats = [seat];
    this.results = [this._detail(shooterId, seat, victimId, correct, correct ? 1 : -1)];
    this._suspense();
  }

  _resoudreEquipe(teamIdx) {
    const membres = this.teams[teamIdx];
    const tirs = membres.map((id) => ({ id, seat: this.pendingShots[id] }));
    const details = tirs.map((s) => {
      const victimId = this.seats[s.seat];
      return { id: s.id, seat: s.seat, victimId, correct: this.targets[s.id] === victimId };
    });
    const tousExacts = details.every((d) => d.correct);
    const delta = tousExacts ? 1 : -1;
    for (const id of membres) { const p = this.trouver(id); p.score = (p.score || 0) + delta; }
    this.firedTeam = teamIdx;
    this.killedSeats = tirs.map((s) => s.seat);
    this.results = details.map((d) => this._detail(d.id, d.seat, d.victimId, d.correct, delta));
    this._suspense();
  }

  // Fabrique une ligne de révélé lisible (noms résolus au moment du tir).
  _detail(shooterId, seat, victimId, correct, delta) {
    const sh = this.trouver(shooterId);
    const tg = this.trouver(this.targets[shooterId]);
    const vi = this.trouver(victimId);
    return {
      shooterId, shooterName: sh ? sh.name : '?', shooterSeat: this.seatOf[shooterId],
      targetName: tg ? tg.name : '?',
      hitSeat: seat, hitName: vi ? vi.name : '?',
      correct, delta,
    };
  }

  _suspense() {
    this.phase = 'suspense';
    this.setTimer('assassinSuspense', SUSPENSE_SECONDS, () => {
      this.phase = 'reveal';
      this.setTimer('assassinReveal', REVEAL_HOLD, () => this._apresReveal());
      this.broadcast();
    });
  }

  _apresReveal() {
    this.clearTimer();
    if (this.round >= this.totalRounds) { this.phase = 'over'; this.broadcast(); return; }
    this._nouvelleManche();
  }

  publicState() {
    const revealed = this.phase === 'reveal' || this.phase === 'over';
    const seats = (this.seats || []).map((pid, i) => {
      const base = { seat: i, killed: this.killedSeats.includes(i) };
      if (revealed) {
        const p = this.trouver(pid);
        return { ...base, revealed: true, id: pid, name: p ? p.name : '?', avatar: p ? p.avatar : '❓', color: p ? p.color : '#888' };
      }
      return { ...base, revealed: false };
    });

    const players = this.players.map((p) => ({
      id: p.id, name: p.name, avatar: p.avatar, color: p.color,
      connected: p.connected, isHost: p.id === this.room.hostId, score: p.score || 0,
      seated: this.seatOf ? this.seatOf[p.id] != null : false,
    }));

    const base = {
      game: 'assassin', mode: this.mode, phase: this.phase,
      round: this.round, totalRounds: this.totalRounds,
      n: seats.length, seats, players,
      coercedClassic: !!this.coercedClassic,
      killedSeats: this.killedSeats.slice(),
    };

    if (revealed) {
      base.results = this.results.slice();
      if (this.mode === 'teams') {
        base.teamsReveal = this.teams.map((membres, idx) => ({
          word: this.words[idx], fired: idx === this.firedTeam,
          members: membres.map((id) => { const p = this.trouver(id); return { name: p ? p.name : '?', avatar: p ? p.avatar : '❓', seat: this.seatOf[id] }; }),
        }));
      }
    }
    if (this.phase === 'over') base.ranking = [...players].sort((a, b) => b.score - a.score);
    return base;
  }

  // PRIVÉ (au joueur concerné) : son siège, sa cible, son mot d'équipe, l'état de
  // son tir et ses fils de chuchotement — jamais ceux des autres.
  secretFor(player) {
    const seat = this.seatOf ? this.seatOf[player.id] : null;
    if (seat == null) return { seat: null, inGame: false };
    const tgt = this.trouver(this.targets[player.id]);
    const chats = [];
    for (const [key, ch] of this.chats) {
      const [a, b] = key.split(':').map(Number);
      if (a === seat || b === seat) {
        const other = a === seat ? b : a;
        chats.push({ seat: other, messages: ch.messages.map((m) => ({ mine: m.fromSeat === seat, text: m.text })) });
      }
    }
    let teamLocked = null;
    if (this.mode === 'teams' && this.teamOf) {
      const membres = this.teams[this.teamOf[player.id]];
      teamLocked = { locked: membres.filter((id) => this.pendingShots[id] != null).length, size: membres.length };
    }
    return {
      inGame: true, seat, mode: this.mode,
      target: tgt ? { name: tgt.name, avatar: tgt.avatar, color: tgt.color } : null,
      teamWord: this.mode === 'teams' ? this.words[this.teamOf[player.id]] : null,
      myShot: this.pendingShots[player.id] ?? null,
      teamLocked,
      chats,
    };
  }
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
