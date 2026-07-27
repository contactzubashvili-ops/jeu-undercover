// ─────────────────────────────────────────────────────────────────────────
//  BOMB PARTY — un mot avant l'explosion.
//  Chacun son tour, trouvez vite un mot contenant la syllabe imposée.
//  La bombe (patate chaude) tourne sans se réinitialiser : celui qui la tient
//  quand elle explose perd une vie. Deux vies, puis on saute. Le dernier
//  survivant gagne. Jouable dès 2 joueurs.
// ─────────────────────────────────────────────────────────────────────────
import { GameModule } from './base.js';
import { normaliserMot, melangerTableau } from '../util.js';
import { motValide, unMotAvec } from '../dico-fr.js';

export const META = { min: 2 };

// Bi/tri/quadrigrammes fréquents en français (forme normalisée, sans accent).
const SYLLABES = [
  // 2 lettres
  'ma', 're', 'ta', 'co', 'pi', 'ch', 'on', 'in', 'an', 'ou', 'ar', 'or', 'en',
  'is', 'ri', 'na', 'to', 'se', 'la', 'mi', 'ra', 'li', 'ca', 'de', 'bo', 'fa',
  'vi', 'po', 'lo', 'mo', 'do', 'no', 'so', 'ro', 'te', 'le', 'me', 'ne', 'pe',
  // 3 lettres
  'con', 'par', 'tra', 'pre', 'pro', 'per', 'des', 'dis', 'com', 'ent', 'ant',
  'int', 'sur', 'ter', 'ver', 'tou', 'pou', 'sou', 'bou', 'cou', 'mou', 'bal',
  'mal', 'cal', 'val', 'fil', 'col', 'vol', 'sol', 'mor', 'tor', 'por', 'cor',
  'gar', 'car', 'bar', 'mar', 'tar', 'san', 'ban', 'can', 'man', 'ran', 'van',
  'che', 'gne', 'tre', 'bre', 'cre', 'dre', 'gre', 'vre', 'ble', 'cle', 'gle',
  'pla', 'gra', 'fra', 'cra', 'bra', 'ail', 'oir', 'air', 'eur', 'eau',
  // 4 lettres
  'tion', 'ment', 'ette', 'elle', 'euse', 'able', 'ique', 'aire', 'ance', 'ence',
  'onne', 'iste', 'isme', 'ille', 'appe', 'oule', 'ense',
];

const DUREE_MIN = 30; // secondes — CACHÉ au joueur (suspense)
const DUREE_MAX = 45;

export class BombPartyGame extends GameModule {
  start() {
    // Ordre de jeu : les connectés, mélangés.
    this.order = melangerTableau(this.connectes).map((p) => p.id);
    for (const p of this.players) p.g = { vies: 2, alive: true };

    this.usedWords = new Set();
    this.wordLog = [];        // mots acceptés (visibles par tous)
    this.lastWord = null;
    this.syllabe = null;
    this.phase = 'play';
    this.winnerId = null;

    // Premier joueur vivant comme actif, puis on démarre la première manche.
    this.turnPos = this._premierVivantPos();
    this._demarrerManche();
  }

  // ── Déroulé ────────────────────────────────────────────────────────────
  // Une « manche » = période entre deux explosions. La bombe est armée UNE
  // fois par manche et tourne jusqu'à l'explosion (patate chaude).
  _demarrerManche() {
    this.activeId = this.turnPos >= 0 ? this.order[this.turnPos] : null;
    this._nouvelleSyllabe();
    const secs = DUREE_MIN + Math.floor(Math.random() * (DUREE_MAX - DUREE_MIN + 1));
    this.setTimer('bomb', secs, () => this._explose());
  }

  _nouvelleSyllabe() {
    // On garantit qu'au moins un vrai mot français contient la syllabe.
    for (let i = 0; i < 15; i++) {
      const s = SYLLABES[Math.floor(Math.random() * SYLLABES.length)];
      if (unMotAvec(s)) { this.syllabe = s; return; }
    }
    this.syllabe = SYLLABES[Math.floor(Math.random() * SYLLABES.length)];
  }

  _premierVivantPos() {
    for (let i = 0; i < this.order.length; i++) {
      const p = this.trouver(this.order[i]);
      if (p && p.g && p.g.alive) return i;
    }
    return -1;
  }

  _vivantSuivantPos(fromPos) {
    const n = this.order.length;
    if (n === 0) return -1;
    for (let step = 1; step <= n; step++) {
      const pos = (fromPos + step) % n;
      const p = this.trouver(this.order[pos]);
      if (p && p.g && p.g.alive) return pos;
    }
    return fromPos; // repli : personne d'autre de vivant
  }

  _vivants() {
    return this.order.map((id) => this.trouver(id)).filter((p) => p && p.g && p.g.alive);
  }

  // ── Actions ──────────────────────────────────────────────────────────────
  handleAction(player, action, msg) {
    if (action === 'word') {
      if (this.phase !== 'play') return { error: 'La partie est terminée.' };
      if (player.id !== this.activeId) return { error: 'Ce n’est pas votre tour.' };
      if (!player.g || !player.g.alive) return { error: 'Vous êtes éliminé.' };

      const brut = String(msg.text || '').trim();
      if (Array.from(brut).length < 3) return { error: 'Le mot doit faire au moins 3 lettres.' };
      if (!/^[\p{L}]+$/u.test(brut)) return { error: 'Uniquement des lettres, sans espace.' };

      const norme = normaliserMot(brut);
      if (norme.length < 3) return { error: 'Le mot doit faire au moins 3 lettres.' };
      if (!norme.includes(this.syllabe)) return { error: `Le mot doit contenir « ${this.syllabe} ».` };
      if (!motValide(brut)) return { error: `« ${brut} » n'est pas dans le dictionnaire français.` };
      if (this.usedWords.has(norme)) return { error: 'Ce mot a déjà été joué.' };

      // Mot validé : on l'enregistre, on passe au suivant, nouvelle syllabe.
      // La bombe continue de tourner (on ne touche PAS au minuteur).
      this.usedWords.add(norme);
      this.wordLog.push({ name: player.name, word: brut });
      if (this.wordLog.length > 60) this.wordLog.shift();
      this.lastWord = brut;
      this.turnPos = this._vivantSuivantPos(this.turnPos);
      this.activeId = this.turnPos >= 0 ? this.order[this.turnPos] : null;
      this._nouvelleSyllabe();
      return { ok: true };
    }

    if (action === 'restart') {
      if (!this.estHote(player.id) || this.phase !== 'over') return;
      this.start({});
      return { ok: true };
    }
  }

  // Callback du minuteur : la bombe explose sur le joueur actif.
  _explose() {
    const p = this.trouver(this.activeId);
    if (p && p.g) {
      p.g.vies -= 1;
      if (p.g.vies <= 0) { p.g.vies = 0; p.g.alive = false; }
    }

    const vivants = this._vivants();
    if (vivants.length <= 1) {
      this.phase = 'over';
      this.winnerId = vivants.length === 1 ? vivants[0].id : null;
      // Score global : le survivant est crédité au palmarès du salon.
      if (this.winnerId) { const w = this.trouver(this.winnerId); if (w) w.score = 1; }
      this.clearTimer();
      this.broadcast();
      return;
    }

    // Nouvelle manche : le joueur vivant suivant devient actif, nouvelle bombe.
    this.turnPos = this._vivantSuivantPos(this.turnPos);
    this._demarrerManche();
    this.broadcast();
  }

  // ── États publiés ────────────────────────────────────────────────────────
  _joueurPublic(p) {
    const g = p.g || { vies: 0, alive: false };
    return {
      id: p.id, name: p.name, avatar: p.avatar, color: p.color,
      connected: p.connected,
      vies: g.vies, alive: g.alive, isActive: p.id === this.activeId,
    };
  }

  publicState() {
    const players = this.players.map((p) => this._joueurPublic(p));
    const base = {
      game: 'bombparty',
      phase: this.phase,
      syllabe: this.syllabe,
      activeId: this.activeId,
      lastWord: this.lastWord,
      words: this.wordLog || [],
      usedCount: this.usedWords ? this.usedWords.size : 0,
      // Le minuteur est CACHÉ (on n'expose pas endsAt) : suspense + anti-triche.
      timer: null,
      winnerId: this.winnerId,
      players,
    };
    if (this.phase === 'over') {
      base.ranking = [...players].sort((a, b) => {
        if (a.alive !== b.alive) return a.alive ? -1 : 1;
        return b.vies - a.vies;
      });
    }
    return base;
  }

  secretFor() { return null; }
}
