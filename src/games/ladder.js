// ─────────────────────────────────────────────────────────────────────────
//  ÉCHELLE (ladder) — perception collective.
//  Chacun reçoit un nombre secret unique de 1 à 100 et un THÈME commun.
//  Chacun écrit un exemple correspondant à l'ampleur de son nombre.
//  Puis l'hôte classe les réponses du plus petit au plus grand nombre — à
//  l'aveugle. On révèle : si les nombres sont bien croissants, tout le monde
//  gagne un point. Coopératif. À partir de 3 joueurs.
// ─────────────────────────────────────────────────────────────────────────
import { GameModule } from './base.js';
import { melangerTableau } from '../util.js';

export const META = { min: 3 };

const THEMES = [
  'Niveau de danger', 'Degré de piquant d’un plat', 'Popularité d’une célébrité',
  'Vitesse d’un animal', 'Taille de quelque chose', 'Prix d’un objet',
  'Force d’un personnage', 'Rareté', 'Utilité au quotidien', 'Niveau de peur',
  'Difficulté d’une tâche', 'Beauté d’un paysage', 'Bruit que ça fait',
  'Niveau de sucre', 'Ancienneté', 'Fragilité', 'Chaleur', 'Poids',
  'Élégance', 'Niveau de stress', 'Degré de bonheur', 'Solidité',
  'Vitesse d’un véhicule', 'Dangerosité d’un métier', 'Coût d’un voyage',
  'Intelligence d’un animal', 'Hauteur', 'Profondeur', 'Luminosité',
  'Complexité d’un jeu', 'Célébrité d’un monument', 'Force d’une odeur',
  'Douceur d’une matière', 'Épaisseur', 'Longévité d’un être vivant',
  'Rapidité d’un moyen de transport', 'Notoriété d’un film', 'Amertume',
  'Fréquence d’usage d’un mot', 'Distance à parcourir',
];

export class LadderGame extends GameModule {
  start(config) {
    config = config || {};
    this.totalRounds = clamp(parseInt(config.rounds, 10) || 3, 1, 10);
    // Échelles personnalisées de l'hôte (ex. « puissance dans Naruto »).
    const custom = Array.isArray(config.ladderThemes) ? config.ladderThemes.map((s) => String(s).trim()).filter(Boolean).slice(0, 50) : [];
    this.pool = custom.length ? (config.ladderOnlyCustom ? custom : custom.concat(THEMES)) : THEMES;
    this.round = 0;
    for (const p of this.players) { p.g = { number: null, answer: null }; p.score = 0; }
    this._nouvelleManche();
  }

  _nouvelleManche() {
    this.clearTimer();
    this.round += 1;
    this.phase = 'answer';
    this.ordre = null;
    this.gagne = false;
    const themePool = this.pool && this.pool.length ? this.pool : THEMES;
    let t = themePool[Math.floor(Math.random() * themePool.length)];
    if (themePool.length > 1) { let garde = 0; while (t === this.lastTheme && garde++ < 12) t = themePool[Math.floor(Math.random() * themePool.length)]; }
    this.theme = t;
    this.lastTheme = t;

    // Nombres secrets uniques 1..100 (échantillon sans remise) pour les connectés.
    const pool = melangerTableau(Array.from({ length: 100 }, (_, i) => i + 1));
    let i = 0;
    for (const p of this.players) { p.g = { number: null, answer: null }; }
    for (const p of this.connectes) { p.g = { number: pool[i++], answer: null }; }
    this.broadcast();
  }

  _participants() { return this.connectes; }

  handleAction(player, action, msg) {
    if (action === 'answer') {
      if (this.phase !== 'answer') return { error: 'Ce n’est pas le moment de répondre.' };
      if (!player.g || player.g.number == null) return { error: 'Vous ne participez pas à cette manche.' };
      const txt = String((msg || {}).text || '').trim().slice(0, 60);
      if (!txt) return { error: 'Réponse vide.' };
      player.g.answer = txt;
      const parts = this._participants();
      if (parts.length && parts.every((p) => p.g && p.g.answer)) this._passerAuClassement();
      return { ok: true };
    }
    if (action === 'move') {
      if (!this.estHote(player.id) || this.phase !== 'order' || !this.ordre) return;
      this._deplacer((msg || {}).id, (msg || {}).dir);
      return { ok: true };
    }
    if (action === 'validate') {
      if (!this.estHote(player.id) || this.phase !== 'order') return;
      this._reveler();
      return { ok: true };
    }
    if (action === 'next') {
      if (!this.estHote(player.id) || this.phase !== 'reveal') return;
      if (this.round >= this.totalRounds) { this.phase = 'over'; this.clearTimer(); this.broadcast(); }
      else this._nouvelleManche();
      return { ok: true };
    }
    if (action === 'restart') {
      if (!this.estHote(player.id) || this.phase !== 'over') return;
      this.start({ rounds: this.totalRounds });
      return { ok: true };
    }
  }

  _passerAuClassement() {
    this.phase = 'order';
    // Liste mélangée des réponses des connectés ; le nombre reste caché côté public.
    this.ordre = melangerTableau(
      this._participants().map((p) => ({ id: p.id, answer: p.g.answer, number: p.g.number })),
    );
    this.broadcast();
  }

  _deplacer(id, dir) {
    const idx = this.ordre.findIndex((e) => e.id === id);
    if (idx < 0) return;
    const j = dir === 'up' ? idx - 1 : dir === 'down' ? idx + 1 : -1;
    if (j < 0 || j >= this.ordre.length) return;
    [this.ordre[idx], this.ordre[j]] = [this.ordre[j], this.ordre[idx]];
  }

  _reveler() {
    this.clearTimer();
    this.phase = 'reveal';
    // Ordre croissant ? chaque nombre ≤ suivant.
    let croissant = true;
    for (let k = 1; k < this.ordre.length; k++) {
      if (this.ordre[k - 1].number > this.ordre[k].number) { croissant = false; break; }
    }
    this.gagne = croissant;
    if (this.gagne) for (const p of this._participants()) p.score = (p.score || 0) + 1;
    this.broadcast();
  }

  publicState() {
    const players = this.players.map((p) => ({
      id: p.id, name: p.name, avatar: p.avatar, color: p.color,
      connected: p.connected, isHost: p.id === this.room.hostId,
      score: p.score || 0, answered: !!(p.g && p.g.answer),
    }));
    const parts = this._participants();
    const base = {
      game: 'ladder', phase: this.phase, round: this.round, totalRounds: this.totalRounds,
      theme: this.theme, players, timer: this.timerInfo(),
      answeredCount: parts.filter((p) => p.g && p.g.answer).length, total: parts.length,
    };
    if (this.phase === 'order' && this.ordre) {
      base.ordre = this.ordre.map((e) => {
        const p = this.trouver(e.id);
        return { id: e.id, answer: e.answer, name: p ? p.name : '?' };
      });
    }
    if (this.phase === 'reveal' && this.ordre) {
      base.gagne = this.gagne;
      base.reveal = this.ordre.map((e) => {
        const p = this.trouver(e.id);
        return { id: e.id, answer: e.answer, name: p ? p.name : '?', number: e.number };
      });
    }
    if (this.phase === 'over') {
      base.ranking = [...players].sort((a, b) => b.score - a.score);
    }
    return base;
  }

  // Le nombre est PRIVÉ : jamais dans publicState avant la révélation.
  secretFor(player) {
    return { ladderNumber: player.g ? player.g.number : null };
  }
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
