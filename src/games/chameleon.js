// ─────────────────────────────────────────────────────────────────────────
//  CHAMELEON — 3 à 12 joueurs. Une grille de 16 mots d'une même catégorie est
//  affichée à TOUT LE MONDE. Un mot secret est choisi parmi ces 16 : tous les
//  joueurs le connaissent… sauf UN, le Caméléon, qui n'a aucun mot (comme le
//  Mister White). Chacun à son tour donne UN indice (un mot). On débat, puis on
//  vote pour éliminer un suspect (même système qu'Undercover : « prêt à voter »
//  → majorité). Si le Caméléon est démasqué, il a une dernière chance : deviner
//  le mot secret parmi les 16 pour renverser la partie.
//
//  SÉCURITÉ : le mot secret et l'identité du Caméléon ne sortent JAMAIS de
//  publicState pendant la manche. Le mot passe par secretFor (null au Caméléon).
// ─────────────────────────────────────────────────────────────────────────
import { GameModule } from './base.js';
import { melangerTableau, normaliserMot } from '../util.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const META = { min: 3, max: 12 };

const __dirname = dirname(fileURLToPath(import.meta.url));

// Repli intégré (quelques groupes) — remplacé par la grande liste si présente.
let GROUPES = [
  { categorie: 'Animaux', mots: ['Chien', 'Chat', 'Cheval', 'Vache', 'Mouton', 'Cochon', 'Poule', 'Lapin', 'Renard', 'Loup', 'Ours', 'Lion', 'Tigre', 'Souris', 'Canard', 'Chèvre'] },
  { categorie: 'Fruits', mots: ['Pomme', 'Poire', 'Banane', 'Cerise', 'Fraise', 'Raisin', 'Orange', 'Citron', 'Pêche', 'Abricot', 'Prune', 'Melon', 'Ananas', 'Mangue', 'Kiwi', 'Framboise'] },
  { categorie: 'Boissons', mots: ['Eau', 'Café', 'Thé', 'Lait', 'Jus', 'Soda', 'Bière', 'Vin', 'Cidre', 'Limonade', 'Chocolat', 'Sirop', 'Tisane', 'Cola', 'Smoothie', 'Champagne'] },
  { categorie: 'Métiers', mots: ['Médecin', 'Boulanger', 'Pompier', 'Facteur', 'Peintre', 'Cuisinier', 'Pilote', 'Plombier', 'Coiffeur', 'Juge', 'Fermier', 'Acteur', 'Pêcheur', 'Menuisier', 'Serveur', 'Professeur'] },
  { categorie: 'Sports', mots: ['Football', 'Tennis', 'Boxe', 'Rugby', 'Natation', 'Judo', 'Golf', 'Ski', 'Cyclisme', 'Basket', 'Handball', 'Escrime', 'Surf', 'Karaté', 'Athlétisme', 'Volley'] },
];
try {
  const arr = JSON.parse(readFileSync(join(__dirname, '..', 'data', 'chameleon-groupes.json'), 'utf8'));
  const clean = arr.filter((g) => g && typeof g.categorie === 'string' && Array.isArray(g.mots)
    && [...new Set(g.mots.map((m) => String(m).trim().toLowerCase()))].length === 16
    && g.mots.every((m) => typeof m === 'string' && m.trim().length));
  if (clean.length > 5) GROUPES = clean.map((g) => ({ categorie: g.categorie, mots: g.mots.map((m) => m.trim()) }));
} catch { /* repli sur la liste intégrée */ }

export class ChameleonGame extends GameModule {
  start(config) {
    config = config || {};
    this.startConfig = config;
    this.totalRounds = clamp(parseInt(config.rounds, 10) || 3, 1, 20);
    this.voteReady = config.voteReady !== false; // « prêt à voter » activé par défaut
    this.usedGroups = new Set();
    for (const p of this.players) p.score = 0;
    this.round = 0;
    this._nouvelleManche();
  }

  _nouvelleManche() {
    this.clearTimer();
    this.round += 1;
    // Choix d'un groupe inédit de 16 mots.
    let grp = null;
    for (let i = 0; i < 20; i++) { const g = GROUPES[Math.floor(Math.random() * GROUPES.length)]; if (!this.usedGroups.has(g.categorie)) { grp = g; break; } }
    if (!grp) { this.usedGroups.clear(); grp = GROUPES[Math.floor(Math.random() * GROUPES.length)]; }
    this.usedGroups.add(grp.categorie);
    this.categorie = grp.categorie;
    this.words = melangerTableau(grp.mots).slice(0, 16); // affichés à tous, ordre mélangé
    this.secret = this.words[Math.floor(Math.random() * this.words.length)];

    // Un Caméléon au hasard ; il n'a aucun mot.
    const joueurs = this.connectes;
    this.chameleonId = melangerTableau(joueurs)[0].id;
    for (const p of this.players) { p.alive = joueurs.some((j) => j.id === p.id); p.eliminated = false; }

    // Ordre d'indices, cycles, votes.
    this.order = melangerTableau(joueurs).map((p) => p.id);
    this.activeIdx = 0;
    this.cycle = 1;
    this.clues = [];
    this.votes = new Map();
    this.readyIds = new Set();
    this.mancheWinner = null;
    this.guessWord = null;
    this.phase = 'clues';
    this.broadcast();
  }

  get vivants() { return this.players.filter((p) => p.alive && p.connected); }
  _actif() { return this.trouver(this.order[this.activeIdx]); }

  handleAction(player, action, msg) {
    msg = msg || {};

    if (action === 'clue') {
      if (this.phase !== 'clues') return { error: 'Ce n’est pas la phase des indices.' };
      const actif = this._actif();
      if (!actif || actif.id !== player.id) return { error: 'Ce n’est pas votre tour.' };
      const mot = String(msg.text || '').trim().slice(0, 40) || '—';
      this.clues.push({ id: player.id, name: player.name, text: mot, cycle: this.cycle });
      this._avancer();
      return { ok: true };
    }

    if (action === 'ready') {
      if (this.phase !== 'clues' || !this.voteReady) return;
      if (!player.alive) return;
      if (msg.value) this.readyIds.add(player.id); else this.readyIds.delete(player.id);
      const vivants = this.vivants;
      const prets = vivants.filter((p) => this.readyIds.has(p.id)).length;
      if (prets >= Math.floor(vivants.length / 2) + 1) this._ouvrirVote();
      return { ok: true };
    }

    if (action === 'openVote') {
      if (!this.estHote(player.id) || this.phase !== 'clues') return;
      this._ouvrirVote();
      return { ok: true };
    }

    if (action === 'vote') {
      if (this.phase !== 'vote') return { error: 'Le vote n’est pas ouvert.' };
      if (!player.alive) return { error: 'Vous êtes éliminé.' };
      if (this.votes.has(player.id)) return { error: 'Vous avez déjà voté.' };
      const cible = this.trouver(msg.targetId);
      if (!cible || !cible.alive || cible.id === player.id) return { error: 'Cible invalide.' };
      this.votes.set(player.id, cible.id);
      if (this.votes.size >= this.vivants.length) this._depouiller();
      return { ok: true };
    }

    if (action === 'guess') {
      if (this.phase !== 'guess' || player.id !== this.chameleonId) return;
      const mot = String(msg.text || '').trim();
      this.guessWord = mot;
      const bon = this.words.some((w) => normaliserMot(w) === normaliserMot(mot)) && normaliserMot(mot) === normaliserMot(this.secret);
      this._finManche(bon ? 'chameleon' : 'players');
      return { ok: true };
    }

    if (action === 'next') {
      if (!this.estHote(player.id) || this.phase !== 'result' || this.over) return;
      this._nouvelleManche();
      return { ok: true };
    }

    if (action === 'restart') {
      if (!this.estHote(player.id) || this.phase !== 'result' || !this.over) return;
      this.start(this.startConfig);
      return { ok: true };
    }
  }

  _avancer() {
    this.activeIdx += 1;
    if (this.activeIdx >= this.order.length) { this.cycle += 1; this.activeIdx = 0; } // on reboucle (indices gardés)
  }

  _ouvrirVote() {
    this.votes = new Map();
    this.readyIds = new Set();
    this.phase = 'vote';
    this.broadcast();
  }

  _depouiller() {
    // Pluralité ; égalité → aucune élimination, retour aux indices.
    const tally = new Map();
    for (const t of this.votes.values()) tally.set(t, (tally.get(t) || 0) + 1);
    let top = null, max = 0, egalite = false;
    for (const [id, n] of tally) { if (n > max) { max = n; top = id; egalite = false; } else if (n === max) egalite = true; }
    this.voteResult = { tally: [...tally].map(([id, count]) => ({ id, name: (this.trouver(id) || {}).name, count })).sort((a, b) => b.count - a.count), egalite: egalite || !top };
    if (egalite || !top) { this.phase = 'clues'; this.activeIdx = 0; this.cycle += 1; this.broadcast(); return; }

    const elim = this.trouver(top);
    elim.alive = false; elim.eliminated = true;
    if (elim.id === this.chameleonId) {
      // Caméléon démasqué → il tente de deviner le mot.
      this.phase = 'guess';
      this.broadcast();
      return;
    }
    // Un innocent tombe : s'il ne reste que le Caméléon + 1 innocent, il s'échappe.
    if (this.vivants.length <= 2) { this._finManche('chameleon'); return; }
    this.phase = 'clues'; this.activeIdx = 0; this.cycle += 1; this.readyIds = new Set();
    this.broadcast();
  }

  _finManche(winner) {
    this.clearTimer();
    this.mancheWinner = winner;
    if (winner === 'chameleon') { const c = this.trouver(this.chameleonId); if (c) c.score = (c.score || 0) + 2; }
    else for (const p of this.players) { if (p.id !== this.chameleonId && this.order.includes(p.id)) p.score = (p.score || 0) + 1; }
    this.over = this.round >= this.totalRounds;
    this.phase = 'result';
    this.broadcast();
  }

  publicState() {
    const reveal = this.phase === 'result';
    const players = this.players.map((p) => ({
      id: p.id, name: p.name, avatar: p.avatar, color: p.color,
      connected: p.connected, isHost: p.id === this.room.hostId, score: p.score || 0,
      alive: p.alive, eliminated: !!p.eliminated,
      hasVoted: this.phase === 'vote' ? this.votes.has(p.id) : false,
      inGame: this.order ? this.order.includes(p.id) : false,
      // L'identité du Caméléon n'est publique QU'à la révélation.
      isChameleon: reveal ? p.id === this.chameleonId : undefined,
    }));
    const active = this._actif();
    const base = {
      game: 'chameleon', phase: this.phase, round: this.round, totalRounds: this.totalRounds,
      categorie: this.categorie, words: this.words, players,
      cycle: this.cycle,
      activeId: this.phase === 'clues' && active ? active.id : null,
      clues: (this.clues || []).map((c) => ({ id: c.id, name: c.name, text: c.text, cycle: c.cycle })),
      voteReady: this.voteReady,
    };
    if (this.voteReady && this.phase === 'clues') {
      const vivants = this.vivants;
      base.discussion = {
        readyIds: [...this.readyIds], readyCount: vivants.filter((p) => this.readyIds.has(p.id)).length,
        totalAlive: vivants.length, needed: Math.floor(vivants.length / 2) + 1,
      };
    }
    if (this.phase === 'vote') base.vote = { votedCount: this.votes.size, totalVoters: this.vivants.length };
    if (this.phase === 'guess') { const c = this.trouver(this.chameleonId); base.guessing = { name: c ? c.name : '?' }; }
    if (reveal) {
      base.mancheWinner = this.mancheWinner;
      base.secret = this.secret;
      base.chameleonId = this.chameleonId;
      base.chameleonName = (this.trouver(this.chameleonId) || {}).name;
      base.guessWord = this.guessWord;
      base.over = this.over;
      if (this.over) base.ranking = [...players].sort((a, b) => b.score - a.score);
    }
    return base;
  }

  // PRIVÉ : le mot secret (null au Caméléon). Le Caméléon apprend qu'il n'a pas
  // de mot (il se sait donc Caméléon), comme le Mister White d'Undercover.
  secretFor(player) {
    if (!this.order || !this.order.includes(player.id)) return { word: null, isChameleon: false, inGame: false };
    const cham = player.id === this.chameleonId;
    return { word: cham ? null : this.secret, isChameleon: cham, inGame: true };
  }
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
