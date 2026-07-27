// ─────────────────────────────────────────────────────────────────────────
//  FUSION — trouvez le mot qui relie deux mots donnés.
//  Chaque manche : 2 mots affichés. Chacun écrit UN mot qui les associe.
//  Révélation : les réponses identiques se regroupent ; ceux qui tombent
//  d'accord (groupe ≥ 2) marquent +1. L'hôte peut fusionner deux groupes
//  qu'il juge équivalents. Jouable dès 2 joueurs.
// ─────────────────────────────────────────────────────────────────────────
import { GameModule } from './base.js';
import { normaliserMot, melangerTableau } from '../util.js';

export const META = { min: 2 };

// Duos « reliés mais avec un écart » : il existe un 3e mot qui fait le pont, mais
// ce n'est ni des synonymes ni du hasard. Regroupés par thème (vide = tous).
export const THEMES = [
  {
    key: 'general', label: 'Général', icon: '🎲', pairs: [
      ['Feu', 'Glace'], ['Roi', 'Tour'], ['Lune', 'Loup'], ['Chat', 'Internet'],
      ['Pomme', 'Serpent'], ['Soleil', 'Tournesol'], ['Mer', 'Étoile'], ['Souris', 'Ordinateur'],
      ['Ampoule', 'Idée'], ['Cœur', 'Février'], ['Ballon', 'Coupe'], ['Clé', 'Énigme'],
      ['Masque', 'Bal'], ['Ancre', 'Tatouage'], ['Boussole', 'Trésor'], ['Neige', 'Bonhomme'],
      ['Pont', 'Rivière'], ['Bougie', 'Gâteau'], ['Miroir', 'Reflet'], ['Échelle', 'Toit'],
      ['Cloche', 'Mariage'], ['Plume', 'Encre'], ['Dé', 'Casino'], ['Loupe', 'Détective'],
      ['Fusée', 'Espace'], ['Aimant', 'Frigo'], ['Sablier', 'Patience'], ['Éclair', 'Orage'],
      ['Île', 'Naufragé'], ['Diamant', 'Bague'], ['Balai', 'Sorcière'], ['Lanterne', 'Halloween'],
      ['Filet', 'Pêche'], ['Nid', 'Œuf'], ['Ruche', 'Reine'], ['Volcan', 'Cendre'],
      ['Désert', 'Mirage'], ['Château', 'Douves'], ['Couronne', 'Sacre'], ['Épée', 'Pierre'],
      ['Phare', 'Naufrage'], ['Toile', 'Musée'], ['Horloge', 'Minuit'], ['Cadenas', 'Amoureux'],
    ],
  },
  {
    key: 'anime', label: 'Animés & Mangas', icon: '🍥', pairs: [
      ['Naruto', 'Ramen'], ['Sasuke', 'Éclair'], ['Goku', 'Nuage'], ['Vegeta', 'Prince'],
      ['Luffy', 'Chapeau'], ['Zoro', 'Boussole'], ['Sanji', 'Cuisine'], ['Titan', 'Mur'],
      ['Eren', 'Cave'], ['Levi', 'Ménage'], ['Mikasa', 'Écharpe'], ['Light', 'Pomme'],
      ['Ryuk', 'Pomme'], ['Tanjiro', 'Eau'], ['Nezuko', 'Bambou'], ['Zenitsu', 'Foudre'],
      ['Gojo', 'Bandeau'], ['Sukuna', 'Doigt'], ['Ichigo', 'Faux'], ['Deku', 'Étincelle'],
      ['Bakugo', 'Explosion'], ['Saitama', 'Crâne'], ['Genos', 'Cyborg'], ['Edward', 'Automail'],
      ['Mustang', 'Flamme'], ['Killua', 'Yoyo'], ['Gon', 'Canne'], ['Sailor', 'Lune'],
      ['Pikachu', 'Ketchup'], ['Ash', 'Casquette'], ['Totoro', 'Parapluie'], ['Chihiro', 'Tunnel'],
      ['Jiraya', 'Crapaud'], ['Kakashi', 'Livre'], ['Itachi', 'Corbeau'], ['Gaara', 'Sable'],
      ['Rock Lee', 'Poids'], ['Hinata', 'Timide'], ['Yugi', 'Pyramide'], ['Kenpachi', 'Clochette'],
    ],
  },
  {
    key: 'jeuxvideo', label: 'Jeux vidéo', icon: '🎮', pairs: [
      ['Mario', 'Champignon'], ['Luigi', 'Manoir'], ['Peach', 'Gâteau'], ['Bowser', 'Carapace'],
      ['Yoshi', 'Œuf'], ['Link', 'Fée'], ['Zelda', 'Ocarina'], ['Ganon', 'Cochon'],
      ['Sonic', 'Anneau'], ['Tails', 'Renard'], ['Knuckles', 'Poing'], ['Kirby', 'Aspiration'],
      ['Pac-Man', 'Labyrinthe'], ['Minecraft', 'Diamant'], ['Creeper', 'Sifflement'], ['Steve', 'Enclume'],
      ['Pokémon', 'Pokéball'], ['Kratos', 'Chaînes'], ['Master Chief', 'Anneau'], ['Lara', 'Pistolets'],
      ['Cloud', 'Buster'], ['Sephiroth', 'Aile'], ['Chocobo', 'Course'], ['Geralt', 'Médaillon'],
      ['Portal', 'Companion'], ['Among Us', 'Évent'], ['Fortnite', 'Planeur'], ['Doom', 'Tronçonneuse'],
      ['Isaac', 'Cave'], ['Sackboy', 'Fermeture'], ['Crash', 'Wumpa'], ['Spyro', 'Flamme'],
      ['Rayman', 'Lapins'], ['Ezio', 'Lame'], ['Agent 47', 'Code-barres'], ['Gordon', 'Pied-de-biche'],
      ['Pyramid Head', 'Couteau'], ['Sub-Zero', 'Gel'], ['Ryu', 'Hadouken'], ['Steve', 'Portail'],
    ],
  },
  {
    key: 'jdr', label: 'JDR & Fantasy', icon: '🐉', pairs: [
      ['Dé', 'Vingt'], ['Donjon', 'Minotaure'], ['Magicien', 'Boule'], ['Elfe', 'Sylvestre'],
      ['Nain', 'Mine'], ['Orc', 'Lance'], ['Dragon', 'Antre'], ['Épée', 'Enclume'],
      ['Grimoire', 'Sortilège'], ['Potion', 'Vie'], ['Taverne', 'Chope'], ['Carte', 'Boussole'],
      ['Gobelin', 'Grotte'], ['Troll', 'Régénération'], ['Licorne', 'Corne'], ['Golem', 'Argile'],
      ['Sorcière', 'Chaudron'], ['Chevalier', 'Table'], ['Rune', 'Pierre'], ['Liche', 'Phylactère'],
      ['Familier', 'Corbeau'], ['Mana', 'Cristal'], ['Arène', 'Gladiateur'], ['Barde', 'Ballade'],
      ['Rôdeur', 'Pistage'], ['Nécromancien', 'Ossements'], ['Paladin', 'Serment'], ['Barbare', 'Hache'],
      ['Druide', 'Nature'], ['Voleur', 'Crochet'], ['Assassin', 'Ombre'], ['Kobold', 'Piège'],
      ['Basilic', 'Regard'], ['Hydre', 'Tête'], ['Griffon', 'Aigle'], ['Méduse', 'Pierre'],
      ['Phénix', 'Cendres'], ['Kraken', 'Tentacule'], ['Wyverne', 'Venin'], ['Sphinx', 'Énigme'],
    ],
  },
  {
    key: 'cinema', label: 'Ciné & Séries', icon: '🎬', pairs: [
      ['Batman', 'Signal'], ['Joker', 'Sourire'], ['Dark Vador', 'Respiration'], ['Yoda', 'Force'],
      ['Luke', 'Sabre'], ['Iron Man', 'Réacteur'], ['Spider-Man', 'Toile'], ['Hulk', 'Colère'],
      ['Thanos', 'Pierres'], ['Wolverine', 'Adamantium'], ['Deadpool', 'Régénération'], ['Gandalf', 'Feu'],
      ['Frodon', 'Anneau'], ['Gollum', 'Précieux'], ['Aragorn', 'Couronne'], ['Neo', 'Pilule'],
      ['Morpheus', 'Choix'], ['Terminator', 'Skynet'], ['Predator', 'Vision'], ['Alien', 'Acide'],
      ['Jack Sparrow', 'Boussole'], ['Voldemort', 'Nez'], ['Harry', 'Éclair'], ['Dumbledore', 'Phénix'],
      ['Hermione', 'Livre'], ['Dobby', 'Chaussette'], ['Walter White', 'Cristal'], ['Jesse', 'Caravane'],
      ['Eleven', 'Gaufre'], ['Demogorgon', 'Pétale'], ['Daenerys', 'Dragon'], ['Jon Snow', 'Loup'],
      ['Sherlock', 'Violon'], ['Indiana', 'Fouet'], ['Rocky', 'Escaliers'], ['Forrest', 'Course'],
      ['Marty', 'DeLorean'], ['Wall-E', 'Plante'], ['Simba', 'Rocher'], ['Elsa', 'Glace'],
    ],
  },
];

const THEMES_BY_KEY = Object.fromEntries(THEMES.map((t) => [t.key, t]));

export class FusionGame extends GameModule {
  start(config) {
    this.totalRounds = clamp(parseInt(config.rounds, 10) || 5, 1, 20);
    this.submitSeconds = clamp(parseInt(config.submitSeconds, 10) || 0, 0, 600); // 0 = ∞
    this.teamMode = !!config.teamMode;
    this.teams = config.teams || {};          // playerId -> 'A' | 'B'
    this.round = 0;
    // Thèmes choisis (clés) ; vide = tous.
    const sel = Array.isArray(config.fusionThemes) ? config.fusionThemes.filter((k) => THEMES_BY_KEY[k]) : [];
    const themes = sel.length ? sel.map((k) => THEMES_BY_KEY[k]) : THEMES;
    const pool = themes.flatMap((t) => t.pairs);
    this.prompts = melangerTableau(pool.length ? pool : THEMES[0].pairs);
    for (const p of this.players) p.g = { answer: null, submitted: false, total: 0, roundPts: 0 };
    this._nouvelleManche();
  }

  _nouvelleManche() {
    this.clearTimer();
    this.round += 1;
    this.phase = 'submit';
    this.groups = null;
    this.prompt = this.prompts[(this.round - 1) % this.prompts.length];
    for (const p of this.players) { p.g.answer = null; p.g.submitted = false; p.g.roundPts = 0; }
    if (this.submitSeconds > 0) this.setTimer('fusion', this.submitSeconds, () => this._reveal());
    this.broadcast();
  }

  _participants() { return this.connectes; }

  handleAction(player, action, msg) {
    if (action === 'submit') {
      if (this.phase !== 'submit') return { error: 'Ce n’est pas le moment de répondre.' };
      const txt = String(msg.text || '').trim().slice(0, 40);
      if (!txt) return { error: 'Réponse vide.' };
      player.g.answer = txt;
      player.g.submitted = true;
      if (this._participants().every((p) => p.g.submitted)) this._reveal();
      return { ok: true };
    }
    if (action === 'forceReveal') {
      if (!this.estHote(player.id) || this.phase !== 'submit') return;
      this._reveal();
      return { ok: true };
    }
    if (action === 'merge') {
      if (!this.estHote(player.id) || this.phase !== 'reveal') return;
      this._merge(msg.a, msg.b);
      return { ok: true };
    }
    if (action === 'next') {
      if (!this.estHote(player.id) || this.phase !== 'reveal') return;
      // Valide les points de la manche puis enchaîne.
      for (const p of this.players) p.g.total += p.g.roundPts;
      if (this.round >= this.totalRounds) { this._fin(); }
      else this._nouvelleManche();
      return { ok: true };
    }
    if (action === 'restart') {
      if (!this.estHote(player.id) || this.phase !== 'over') return;
      this.start({ rounds: this.totalRounds });
      return { ok: true };
    }
  }

  _reveal() {
    this.clearTimer();
    this.phase = 'reveal';
    // Regroupe par réponse normalisée (seuls ceux qui ont répondu).
    const map = new Map();
    for (const p of this._participants()) {
      if (!p.g.answer) continue;
      const key = normaliserMot(p.g.answer);
      if (!map.has(key)) map.set(key, { key, answer: p.g.answer, ids: [] });
      map.get(key).ids.push(p.id);
    }
    this.groups = [...map.values()];
    this._score();
    this.broadcast();
  }

  _merge(a, b) {
    if (!this.groups) return;
    const ga = this.groups.find((g) => g.key === a);
    const gb = this.groups.find((g) => g.key === b);
    if (!ga || !gb || ga === gb) return;
    ga.ids.push(...gb.ids);
    this.groups = this.groups.filter((g) => g !== gb);
    this._score();
    this.broadcast();
  }

  _score() {
    for (const p of this.players) p.g.roundPts = 0;
    for (const grp of this.groups) {
      if (this.teamMode) {
        // En équipe : on marque si un COÉQUIPIER a écrit le même mot.
        const parEquipe = {};
        for (const id of grp.ids) { const t = this.teams[id] || '_'; (parEquipe[t] = parEquipe[t] || []).push(id); }
        for (const t in parEquipe) {
          if (t !== '_' && parEquipe[t].length >= 2) for (const id of parEquipe[t]) { const p = this.trouver(id); if (p) p.g.roundPts = 1; }
        }
      } else {
        if (grp.ids.length >= 2) for (const id of grp.ids) { const p = this.trouver(id); if (p) p.g.roundPts = 1; }
      }
    }
    // Score affiché = total validé + points de la manche en cours.
    for (const p of this.players) p.score = p.g.total + p.g.roundPts;
  }

  _fin() {
    this.clearTimer();
    this.phase = 'over';
    this.broadcast();
  }

  publicState() {
    const parts = this._participants();
    const players = this.players.map((p) => ({
      id: p.id, name: p.name, avatar: p.avatar, color: p.color,
      connected: p.connected, isHost: p.id === this.room.hostId,
      score: p.score || 0, submitted: !!(p.g && p.g.submitted),
      team: this.teamMode ? (this.teams[p.id] || null) : null,
    }));
    const base = {
      game: 'fusion', phase: this.phase, round: this.round, totalRounds: this.totalRounds,
      prompt: this.prompt, players, timer: this.timerInfo(),
      teamMode: !!this.teamMode,
      submittedCount: parts.filter((p) => p.g.submitted).length, totalPlayers: parts.length,
    };
    if (this.phase === 'reveal') {
      base.groups = this.groups.map((g) => ({
        key: g.key, answer: g.answer, scored: g.ids.some((id) => g.ids.length >= 2),
        players: g.ids.map((id) => { const p = this.trouver(id); return { id, name: p ? p.name : '?', avatar: p ? p.avatar : '❓', team: this.teamMode ? (this.teams[id] || null) : null }; }),
      })).sort((a, b) => b.players.length - a.players.length);
    }
    if (this.phase === 'over') {
      base.ranking = [...players].sort((a, b) => b.score - a.score);
      if (this.teamMode) {
        const t = {};
        for (const p of players) { if (!p.team) continue; t[p.team] = (t[p.team] || 0) + p.score; }
        base.teamRanking = Object.entries(t).map(([team, score]) => ({ team, score })).sort((a, b) => b.score - a.score);
      }
    }
    return base;
  }

  // Fusion n'a pas de secret par joueur (chacun voit sa propre saisie côté client).
  secretFor() { return null; }
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
