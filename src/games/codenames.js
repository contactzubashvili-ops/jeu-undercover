// ─────────────────────────────────────────────────────────────────────────
//  CODENAMES — 2 contre 2. Une grille de 25 mots. Chaque équipe (rouge / bleue)
//  a un ESPION EN CHEF qui connaît la couleur de chaque mot, et un AGENT qui
//  devine. À son tour, l'espion en chef donne UN indice (un mot + un nombre) ;
//  son agent clique des mots. Toucher un mot de sa couleur = continuer ; un mot
//  neutre ou adverse = fin du tour ; l'ASSASSIN = défaite immédiate. La première
//  équipe à retrouver tous ses mots gagne.
//
//  SÉCURITÉ : la couleur d'un mot non révélé ne sort JAMAIS de publicState — la
//  grille secrète (« key ») n'est envoyée qu'aux DEUX espions en chef via
//  secretFor. Les agents ne voient que les cases déjà révélées.
// ─────────────────────────────────────────────────────────────────────────
import { GameModule } from './base.js';
import { melangerTableau } from '../util.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const META = { min: 4, max: 4 };

const __dirname = dirname(fileURLToPath(import.meta.url));

// Réservoir de mots : on réutilise la grande bibliothèque des autres jeux.
let POOL = ['CHAT', 'CHIEN', 'MAISON', 'SOLEIL', 'ARBRE', 'VOITURE', 'FLEUR', 'POISSON', 'ÉTOILE', 'LUNE',
  'MONTAGNE', 'BATEAU', 'AVION', 'POMME', 'BALLON', 'LIVRE', 'CLÉ', 'HORLOGE', 'CHAPEAU', 'GUITARE',
  'ROBOT', 'DRAGON', 'CHÂTEAU', 'PONT', 'MARTEAU', 'CACTUS', 'GLACE', 'CAFÉ', 'CHAISE', 'TABLE',
  'VÉLO', 'TRAIN', 'FUSÉE', 'DRAPEAU', 'FEU', 'NUAGE', 'VAGUE', 'ÎLE', 'VOLCAN', 'REQUIN',
  'TIGRE', 'PANDA', 'RENARD', 'OURS', 'SOURIS', 'ÉPÉE', 'TRÉSOR', 'CLOWN', 'NINJA', 'ANGE'];
try {
  const lots = ['pinturillo-words.json', 'wordscatter-words.json'];
  const brut = [];
  for (const f of lots) {
    try { const a = JSON.parse(readFileSync(join(__dirname, '..', 'data', f), 'utf8')); if (Array.isArray(a)) brut.push(...a); } catch { /* ignore ce lot */ }
  }
  const clean = [...new Set(brut
    .filter((w) => typeof w === 'string')
    .map((w) => w.trim().toUpperCase())
    .filter((w) => /^[A-ZÀ-ÖØ-Þ]{3,12}$/.test(w)))]; // un seul mot, sans espace ni tiret
  if (clean.length > 100) POOL = clean;
} catch { /* repli sur la liste intégrée */ }

const AUTRE = (t) => (t === 'red' ? 'blue' : 'red');

export class CodenamesGame extends GameModule {
  start(config) {
    this.startConfig = config || {};
    const joueurs = melangerTableau(this.connectes).slice(0, 4);
    // Deux équipes de 2 : [espion en chef, agent].
    this.teams = {
      red: { spy: joueurs[0].id, op: joueurs[1].id },
      blue: { spy: joueurs[2].id, op: joueurs[3].id },
    };
    this.roleOf = {};
    this.roleOf[joueurs[0].id] = { team: 'red', role: 'spy' };
    this.roleOf[joueurs[1].id] = { team: 'red', role: 'op' };
    this.roleOf[joueurs[2].id] = { team: 'blue', role: 'spy' };
    this.roleOf[joueurs[3].id] = { team: 'blue', role: 'op' };
    for (const p of this.players) p.score = 0;

    // Grille : 9 rouges (équipe qui commence), 8 bleues, 7 neutres, 1 assassin.
    const mots = melangerTableau(POOL).slice(0, 25);
    const types = [
      ...Array(9).fill('red'), ...Array(8).fill('blue'),
      ...Array(7).fill('neutral'), 'assassin',
    ];
    const mel = melangerTableau(types);
    this.board = mots.map((w, i) => ({ word: w, type: mel[i], revealed: false }));
    this.totals = { red: 9, blue: 8 };
    this.found = { red: 0, blue: 0 };

    this.turn = 'red';        // l'équipe rouge (9 mots) commence
    this.step = 'clue';       // 'clue' → l'espion donne l'indice ; 'guess' → l'agent devine
    this.clue = null;         // { word, count }
    this.guessesLeft = 0;
    this.log = [];            // journal public { word, type, team }
    this.winner = null;
    this.phase = 'play';
    this.broadcast();
  }

  handleAction(player, action, msg) {
    msg = msg || {};
    const me = this.roleOf[player.id];

    if (action === 'clue') {
      if (this.phase !== 'play' || this.step !== 'clue') return { error: 'Ce n’est pas le moment de donner un indice.' };
      if (!me || me.team !== this.turn || me.role !== 'spy') return { error: 'Seul l’espion en chef de l’équipe active donne l’indice.' };
      const mot = String(msg.word || '').trim().slice(0, 24);
      const nb = clamp(parseInt(msg.count, 10) || 0, 1, 9);
      if (!mot || /\s/.test(mot)) return { error: 'L’indice doit être un seul mot.' };
      this.clue = { word: mot, count: nb };
      this.guessesLeft = nb + 1;   // un essai bonus, comme dans la règle
      this.step = 'guess';
      this.broadcast();
      return { ok: true };
    }

    if (action === 'guess') {
      if (this.phase !== 'play' || this.step !== 'guess') return { error: 'Aucun indice en cours.' };
      if (!me || me.team !== this.turn || me.role !== 'op') return { error: 'Seul l’agent de l’équipe active devine.' };
      const i = parseInt(msg.index, 10);
      const cell = this.board[i];
      if (!cell || cell.revealed) return { error: 'Case indisponible.' };
      cell.revealed = true;
      this.log.push({ word: cell.word, type: cell.type, team: this.turn });

      if (cell.type === 'assassin') { return this._fin(AUTRE(this.turn)), { ok: true }; } // l'équipe active perd
      if (cell.type === 'red' || cell.type === 'blue') {
        this.found[cell.type] += 1;
        if (this.found[cell.type] >= this.totals[cell.type]) return this._fin(cell.type), { ok: true };
      }
      if (cell.type === this.turn) {
        // Bonne case : on peut continuer tant qu'il reste des essais.
        this.guessesLeft -= 1;
        if (this.guessesLeft <= 0) this._finTour();
        else this.broadcast();
      } else {
        // Neutre ou couleur adverse → fin du tour.
        this._finTour();
      }
      return { ok: true };
    }

    if (action === 'endTurn') {
      if (this.phase !== 'play' || this.step !== 'guess') return;
      if (!me || me.team !== this.turn || me.role !== 'op') return { error: 'Seul l’agent de l’équipe active peut passer.' };
      this._finTour();
      return { ok: true };
    }

    if (action === 'restart') {
      if (!this.estHote(player.id) || this.phase !== 'over') return;
      this.start(this.startConfig);
      return { ok: true };
    }
  }

  _finTour() {
    this.turn = AUTRE(this.turn);
    this.step = 'clue';
    this.clue = null;
    this.guessesLeft = 0;
    this.broadcast();
  }

  _fin(winnerTeam) {
    this.clearTimer();
    this.winner = winnerTeam;
    this.phase = 'over';
    for (const id of [this.teams[winnerTeam].spy, this.teams[winnerTeam].op]) { const p = this.trouver(id); if (p) p.score = (p.score || 0) + 1; }
    this.broadcast();
  }

  _joueur(id) { const p = this.trouver(id); const r = this.roleOf[id] || {}; return p ? { id, name: p.name, avatar: p.avatar, color: p.color, connected: p.connected, team: r.team, role: r.role, score: p.score || 0 } : null; }

  publicState() {
    const over = this.phase === 'over';
    const board = this.board.map((c, i) => ({
      i, word: c.word, revealed: c.revealed,
      // La couleur n'est publique que si la case est révélée (ou à la fin).
      type: (c.revealed || over) ? c.type : null,
    }));
    return {
      game: 'codenames', phase: this.phase, turn: this.turn, step: this.step,
      clue: this.clue, guessesLeft: this.guessesLeft,
      totals: this.totals, found: this.found,
      board, log: this.log.slice(-14), winner: this.winner,
      teams: {
        red: { spy: this._joueur(this.teams.red.spy), op: this._joueur(this.teams.red.op) },
        blue: { spy: this._joueur(this.teams.blue.spy), op: this._joueur(this.teams.blue.op) },
      },
      players: this.players.map((p) => this._joueur(p.id)).filter(Boolean),
    };
  }

  // PRIVÉ : la grille secrète des couleurs, uniquement pour les DEUX espions en chef.
  secretFor(player) {
    const me = this.roleOf[player.id];
    if (me && me.role === 'spy') return { spymaster: true, key: this.board.map((c) => c.type) };
    return { spymaster: false, key: null };
  }
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
