// ─────────────────────────────────────────────────────────────────────────
//  PINTURILLO — dessin & devinette (Draw & Guess). Jouable dès 2 joueurs.
//  Chaque manche : un dessinateur reçoit un mot SECRET et le dessine ; les
//  autres devinent dans le chat. Les bonnes réponses restent cachées (anti-
//  spoil) : seul un message « X a trouvé ! » est public. Points à la vitesse.
//  Le dessin est synchronisé en direct via des messages transitoires {t:'draw'}.
// ─────────────────────────────────────────────────────────────────────────
import { GameModule } from './base.js';
import { normaliserMot, melangerTableau } from '../util.js';

export const META = { min: 2 };

const MOTS = [
  'chat', 'chien', 'maison', 'soleil', 'arbre', 'voiture', 'fleur', 'poisson', 'oiseau', 'étoile',
  'cœur', 'lune', 'montagne', 'bateau', 'avion', 'pomme', 'banane', 'pizza', 'gâteau', 'ballon',
  'livre', 'lampe', 'clé', 'horloge', 'parapluie', 'lunettes', 'chapeau', 'chaussure', 'guitare', 'piano',
  'robot', 'fantôme', 'dragon', 'licorne', 'château', 'pont', 'échelle', 'ciseaux', 'marteau', 'bougie',
  'cactus', 'champignon', 'carotte', 'fraise', 'glace', 'hamburger', 'sandwich', 'café', 'bouteille', 'fourchette',
  'chaise', 'table', 'lit', 'télévision', 'ordinateur', 'téléphone', 'ampoule', 'pinceau', 'crayon', 'sac',
  'valise', 'cadeau', 'panier', 'vélo', 'moto', 'train', 'fusée', 'hélicoptère', 'ancre', 'boussole',
  'drapeau', 'tente', 'feu', 'nuage', 'arc-en-ciel', 'éclair', 'flocon', 'vague', 'île', 'volcan',
  'requin', 'baleine', 'dauphin', 'tortue', 'crabe', 'méduse', 'papillon', 'abeille', 'coccinelle', 'araignée',
  'escargot', 'grenouille', 'serpent', 'éléphant', 'girafe', 'lion', 'tigre', 'singe', 'panda', 'pingouin',
  'hibou', 'renard', 'loup', 'ours', 'lapin', 'souris', 'hérisson', 'dinosaure', 'squelette', 'citrouille',
  'sorcière', 'couronne', 'épée', 'bouclier', 'potion', 'trésor', 'diamant', 'clown', 'ninja', 'astronaute',
  'sirène', 'ange', 'fromage', 'croissant', 'ballon de foot', 'montgolfière', 'phare', 'moulin', 'igloo', 'cerf-volant',
];

const REVEAL_SECONDS = 6;
const MAX_POINTS = 4000; // plafond de points de tracé mémorisés par manche

export class PinturilloGame extends GameModule {
  start(config) {
    config = config || {};
    const rs = parseInt(config.roundSeconds, 10);
    this.roundSeconds = Number.isFinite(rs) ? clamp(rs, 0, 300) : 75; // 0 = ∞
    this.cycles = clamp(parseInt(config.rounds, 10) || 2, 1, 10);
    this.pointsFirst = clamp(parseInt(config.pointsFirst, 10) || 5, 2, 10);

    this.order = melangerTableau(this.connectes).map((p) => p.id);
    this.totalDrawings = this.cycles * this.order.length;
    this.drawingsDone = 0;
    this.drawIndex = 0;
    this.usedWords = new Set();
    for (const p of this.players) p.score = 0;

    this._nouvelleManche();
  }

  _drawerConnecteAPartir(idx) {
    const n = this.order.length;
    for (let s = 0; s < n; s++) {
      const id = this.order[(idx + s) % n];
      const p = this.trouver(id);
      if (p && p.connected) return { id, idx: (idx + s) % n };
    }
    const first = this.trouver(this.order[0]);
    return { id: first ? first.id : null, idx: 0 };
  }

  _nouvelleManche() {
    this.clearTimer();
    const d = this._drawerConnecteAPartir(this.drawIndex);
    this.drawerId = d.id;
    this.drawIndex = d.idx;
    this.word = this._motInedit();
    this.strokes = [];
    this.strokePoints = 0;
    this.guessOrder = [];        // ids dans l'ordre de découverte
    this.guessed = new Set();
    this.chat = [];
    this.reveal = null;
    this.phase = 'draw';
    if (this.roundSeconds > 0) this.setTimer('pint', this.roundSeconds, () => this._finManche());
  }

  _motInedit() {
    let w = null;
    for (let i = 0; i < 12; i++) { const c = MOTS[Math.floor(Math.random() * MOTS.length)]; if (!this.usedWords.has(c)) { w = c; break; } }
    if (!w) w = MOTS[Math.floor(Math.random() * MOTS.length)];
    this.usedWords.add(w);
    return w;
  }

  _devineurs() { return this.connectes.filter((p) => p.id !== this.drawerId); }

  // ── Dessin en direct : appelé par room.drawAction (message transitoire) ──
  handleDraw(player, msg) {
    if (this.phase !== 'draw' || player.id !== this.drawerId) return null;
    if (msg.type === 'clear') { this.strokes = []; this.strokePoints = 0; return { clear: true }; }
    if (msg.type === 'undo') { this.strokes.pop(); return { full: this.strokes }; }
    if (msg.type === 'seg' && msg.seg && Array.isArray(msg.seg.p)) {
      if (this.strokePoints < MAX_POINTS) {
        this.strokes.push({ c: String(msg.seg.c || '#111').slice(0, 9), w: clamp(+msg.seg.w || 4, 1, 40), p: msg.seg.p.slice(0, 200) });
        this.strokePoints += msg.seg.p.length;
      }
      return { seg: msg.seg };
    }
    return null;
  }

  handleAction(player, action, msg) {
    if (action === 'guess') {
      if (this.phase !== 'draw') return;
      if (player.id === this.drawerId) return;            // le dessinateur ne devine pas
      if (this.guessed.has(player.id)) return;            // déjà trouvé : plus de spoil
      const texte = String((msg || {}).text || '').trim().slice(0, 60);
      if (!texte) return;
      const bon = normaliserMot(texte) === normaliserMot(this.word);
      if (bon) {
        this.guessed.add(player.id);
        this.guessOrder.push(player.id);
        const rang = this.guessOrder.length;                       // 1er, 2e, …
        player.score = (player.score || 0) + Math.max(1, this.pointsFirst - (rang - 1));
        this.chat.push({ sys: true, text: `🎉 ${player.name} a trouvé le mot !` });
        // Tous les devineurs connectés ont trouvé → fin de manche anticipée.
        if (this._devineurs().every((p) => this.guessed.has(p.id))) this._finManche();
      } else {
        this.chat.push({ name: player.name, text: texte });        // mauvaise réponse = chat public
        if (this.chat.length > 60) this.chat = this.chat.slice(-60);
      }
      return { ok: true, correct: bon };
    }
    if (action === 'finish') {
      // Le dessinateur (ou l'hôte) termine la manche — utile si le temps est infini.
      if (this.phase !== 'draw') return;
      if (player.id !== this.drawerId && !this.estHote(player.id)) return;
      this._finManche();
      return { ok: true };
    }
    if (action === 'next') {
      if (!this.estHote(player.id) || this.phase !== 'reveal') return;
      this._apresReveal();
      return { ok: true };
    }
    if (action === 'restart') {
      if (!this.estHote(player.id) || this.phase !== 'over') return;
      this.start({ roundSeconds: this.roundSeconds, rounds: this.cycles, pointsFirst: this.pointsFirst });
      return { ok: true };
    }
  }

  _finManche() {
    this.clearTimer();
    this.phase = 'reveal';
    this.reveal = this.word;
    // Points du dessinateur : récompensé si au moins un joueur a trouvé.
    const drawer = this.trouver(this.drawerId);
    if (drawer && this.guessOrder.length > 0) drawer.score = (drawer.score || 0) + Math.min(3, 1 + this.guessOrder.length);
    this.drawingsDone += 1;
    this.setTimer('reveal', REVEAL_SECONDS, () => this._apresReveal());
    this.broadcast();
  }

  _apresReveal() {
    this.clearTimer();
    if (this.drawingsDone >= this.totalDrawings) { this.phase = 'over'; this.broadcast(); return; }
    this.drawIndex = (this.drawIndex + 1) % this.order.length;
    this._nouvelleManche();
    this.broadcast();
  }

  publicState() {
    const drawer = this.trouver(this.drawerId);
    const players = this.players.map((p) => ({
      id: p.id, name: p.name, avatar: p.avatar, color: p.color,
      connected: p.connected, score: p.score || 0,
      isDrawer: p.id === this.drawerId, hasGuessed: this.guessed ? this.guessed.has(p.id) : false,
    }));
    const base = {
      game: 'pinturillo', phase: this.phase,
      drawerId: this.drawerId, drawerName: drawer ? drawer.name : '',
      round: Math.min(this.drawingsDone + 1, this.totalDrawings), totalDrawings: this.totalDrawings,
      timer: this.timerInfo(),
      wordLength: this.word ? this.word.length : 0,
      wordHint: this.word ? this.word.replace(/[^\s-]/g, '_') : '',
      strokes: this.strokes || [],
      chat: this.chat || [],
      reveal: this.phase !== 'draw' ? this.word : null,
      guessedCount: this.guessOrder ? this.guessOrder.length : 0,
      totalGuessers: this._devineurs().length,
      players,
    };
    if (this.phase === 'over') base.ranking = [...players].sort((a, b) => b.score - a.score);
    return base;
  }

  // Le mot n'est envoyé QU'AU dessinateur (les autres reçoivent drawWord:null).
  secretFor(player) {
    return { drawWord: (this.phase === 'draw' && player.id === this.drawerId) ? this.word : null };
  }
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
