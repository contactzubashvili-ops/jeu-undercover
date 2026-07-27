// ─────────────────────────────────────────────────────────────────────────
//  WORD SCATTER — coopératif. Un MOT SECRET, ses lettres réparties entre les
//  joueurs. Chacun ne voit QUE ses propres lettres (secretFor) et ne doit pas
//  les nommer : on se coordonne par indices (chat). À tour de rôle ou librement,
//  on pose une lettre à une EXTRÉMITÉ de la séquence construite. La séquence
//  doit rester une sous-chaîne contiguë du mot secret ; sinon la partie est
//  perdue. Quand tout est posé dans le bon ordre → victoire. 3 à 10 joueurs.
// ─────────────────────────────────────────────────────────────────────────
import { GameModule } from './base.js';
import { melangerTableau } from '../util.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const META = { min: 3, max: 10 };

const __dirname = dirname(fileURLToPath(import.meta.url));

// Repli intégré (~60 mots) — remplacé par la grande liste si elle est présente.
let WORDS = [
  'MONTAGNE', 'ORDINATEUR', 'BIBLIOTHEQUE', 'CHOCOLAT', 'AVENTURE', 'PARAPLUIE',
  'TELEPHONE', 'DINOSAURE', 'CHAMPIGNON', 'ELEPHANT', 'GUITARE', 'FROMAGE',
  'VOLCAN', 'TORNADE', 'CROISSANT', 'JONGLEUR', 'LABYRINTHE', 'PENDULE',
  'MACHINE', 'FENETRE', 'JARDIN', 'BALANCE', 'CHATEAU', 'PYRAMIDE',
  'CALENDRIER', 'PARACHUTE', 'TROMPETTE', 'BROUILLARD', 'CAROTTE', 'LANTERNE',
  'PAPILLON', 'MARMITE', 'BOUSSOLE', 'CASCADE', 'GALAXIE', 'PLANETE',
  'TABLEAU', 'BAGUETTE', 'COQUILLE', 'TORTUE', 'RENARD', 'ESCARGOT',
  'PELICAN', 'CROCODILE', 'KANGOUROU', 'MOULIN', 'CHARIOT', 'BOUTEILLE',
  'FONTAINE', 'CAVERNE', 'DESERT', 'PRAIRIE', 'CARNAVAL', 'PIRATE',
  'DRAGON', 'SORCIER', 'FANTOME', 'VAMPIRE', 'CITROUILLE', 'MANDARINE',
  'FRAMBOISE', 'CONCOMBRE',
];

// Grande liste externe (générée) : ~1000+ mots. Repli sur la liste ci-dessus.
try {
  const arr = JSON.parse(readFileSync(join(__dirname, '..', 'data', 'wordscatter-words.json'), 'utf8'));
  const clean = [...new Set(arr.filter((w) => typeof w === 'string' && /^[A-Z]{6,12}$/.test(w)))];
  if (clean.length > 50) WORDS = clean;
} catch { /* repli sur la liste intégrée */ }

export class WordScatterGame extends GameModule {
  start() {
    this.secret = melangerTableau(WORDS)[0];
    this.built = '';
    this.phase = 'play';
    this.reveal = null;
    this.chat = [];

    // Toutes les lettres du mot, mélangées puis réparties entre les connectés.
    for (const p of this.players) { p.g = { letters: [] }; p.score = 0; }
    const parts = this.connectes;
    const letters = melangerTableau(this.secret.split(''));
    if (parts.length) {
      letters.forEach((L, i) => { parts[i % parts.length].g.letters.push(L); });
    }
    this.broadcast();
  }

  handleAction(player, action, msg) {
    msg = msg || {};

    if (action === 'place') {
      if (this.phase !== 'play') return { error: 'La partie n’est plus en cours.' };
      if (!player.g) return { error: 'Vous ne participez pas à cette partie.' };
      const letter = String(msg.letter || '').toUpperCase();
      const side = msg.side === 'start' ? 'start' : 'end';
      const idx = player.g.letters.indexOf(letter);
      if (idx < 0) return { error: 'Vous n’avez pas cette lettre.' };

      const newBuilt = side === 'start' ? letter + this.built : this.built + letter;

      // La séquence doit rester une sous-chaîne contiguë du mot secret.
      if (!this.secret.includes(newBuilt)) {
        this.phase = 'lost';
        this.reveal = this.secret;
        this.clearTimer();
        return { ok: true }; // diffusion automatique après l'action
      }

      // Pose valide : on verrouille la lettre.
      player.g.letters.splice(idx, 1);
      this.built = newBuilt;
      this.lastSide = side;

      if (this.built.length === this.secret.length) { // donc built === secret
        this.phase = 'won';
        this.reveal = this.secret;
        this.clearTimer();
        for (const p of this.players) p.score = 1;
      }
      return { ok: true };
    }

    if (action === 'chat') {
      const text = String(msg.text || '').trim().slice(0, 200);
      if (!text) return { error: 'Message vide.' };
      this.chat.push({ name: player.name, text });
      if (this.chat.length > 30) this.chat = this.chat.slice(-30);
      return { ok: true };
    }

    if (action === 'restart') {
      if (!this.estHote(player.id) || (this.phase !== 'won' && this.phase !== 'lost')) return;
      this.start({});
      return { ok: true };
    }
  }

  publicState() {
    return {
      game: 'wordscatter',
      phase: this.phase,
      built: this.built,
      wordLength: this.secret ? this.secret.length : 0,
      lastSide: this.lastSide || null,
      // Le mot secret n'apparaît QUE lorsque la partie est finie.
      reveal: this.phase !== 'play' ? this.secret : null,
      chat: this.chat.slice(),
      players: this.players.map((p) => ({
        id: p.id, name: p.name, avatar: p.avatar, color: p.color,
        connected: p.connected, isHost: p.id === this.room.hostId,
        // On n'expose QUE le NOMBRE de lettres restantes, jamais les lettres.
        lettersLeft: p.g ? p.g.letters.length : 0,
      })),
    };
  }

  // Les lettres d'un joueur sont PRIVÉES : uniquement ici, jamais dans publicState.
  secretFor(player) {
    return { letters: player.g ? player.g.letters.slice() : [] };
  }
}
