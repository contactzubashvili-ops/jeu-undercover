// ─────────────────────────────────────────────────────────────────────────
//  TIME BOMB — désamorçage à rôles cachés (4 à 8 joueurs).
//  Deux camps secrets : Gentils (« Désamorceurs ») et Traîtres.
//  5×N cartes-fils : N « désamorçage », 1 « bombe », le reste « neutre ».
//  4 manches ; à chaque manche on redistribue les cartes non révélées et le
//  coupeur actif révèle UNE carte d'un autre joueur, qui devient le suivant.
//  Gentils gagnent si les N désamorçages sortent ; Traîtres si la bombe sort
//  ou si les 4 manches passent sans tout désamorcer.
//  SÉCURITÉ : ni le rôle d'un joueur ni le type d'une carte non révélée ne
//  sortent dans publicState — le rôle passe par secretFor (au joueur), les
//  rôles ne sont publics qu'à la fin de la partie.
// ─────────────────────────────────────────────────────────────────────────
import { GameModule } from './base.js';
import { melangerTableau } from '../util.js';

export const META = { min: 4 };

// Manche r (1..4) → nombre de cartes par joueur : 5, 4, 3, 2.
function cartesParJoueur(round) { return 6 - round; }

export class TimeBombGame extends GameModule {
  start() {
    const players = this.players;
    const N = players.length;
    this.N = N;
    this.defuseTotal = N;

    // Rôles secrets : floor(N/2) traîtres, le reste gentils.
    const nbTraitres = Math.floor(N / 2);
    const ordre = melangerTableau(players);
    ordre.forEach((p, i) => {
      p.g = { role: i < nbTraitres ? 'traitres' : 'gentils', cards: [] };
      p.score = 0;
    });

    // Deck : N désamorçage, 1 bombe, le reste neutre (total 5N).
    const deck = [];
    for (let i = 0; i < N; i++) deck.push({ type: 'defuse', revealed: false });
    deck.push({ type: 'bomb', revealed: false });
    const neutres = 5 * N - N - 1; // = 4N - 1
    for (let i = 0; i < neutres; i++) deck.push({ type: 'neutre', revealed: false });

    this.round = 1;
    this._distribuer(deck, cartesParJoueur(1));

    this.cutterId = melangerTableau(players)[0].id; // coupeur de départ au hasard
    this.cutsThisRound = 0;
    this.defuseFound = 0;
    this.bombFound = false;
    this.revealed = [];        // journal public des cartes coupées {fromName, type}
    this.winnerTeam = null;
    this.phase = 'play';
  }

  // Répartit équitablement un lot de cartes (lot.length === perPlayer × N).
  _distribuer(lot, perPlayer) {
    const melange = melangerTableau(lot);
    this.players.forEach((p, i) => {
      p.g.cards = melange.slice(i * perPlayer, (i + 1) * perPlayer);
    });
  }

  handleAction(player, action, msg) {
    if (action === 'cut') {
      if (this.phase !== 'play') return { error: 'La partie n’est pas en cours.' };
      if (player.id !== this.cutterId) return { error: 'Ce n’est pas à vous de couper.' };
      const target = this.trouver(msg && msg.targetId);
      if (!target || !target.g) return { error: 'Joueur introuvable.' };
      if (target.id === player.id) return { error: 'On ne coupe pas ses propres fils.' };
      const index = parseInt(msg && msg.index, 10);
      const card = target.g.cards[index];
      if (!card || card.revealed) return { error: 'Carte indisponible.' };

      // Révélation publique.
      card.revealed = true;
      this.revealed.push({ fromName: target.name, type: card.type });

      if (card.type === 'defuse') {
        this.defuseFound++;
        if (this.defuseFound === this.defuseTotal) { this._fin('gentils'); return { ok: true }; }
      } else if (card.type === 'bomb') {
        this.bombFound = true;
        this._fin('traitres');
        return { ok: true };
      }

      // Pas fini : le joueur coupé devient le coupeur.
      this.cutterId = target.id;
      this.cutsThisRound++;

      if (this.cutsThisRound === this.N) {
        if (this.round === 4) { this._fin('traitres'); return { ok: true }; }
        this._mancheSuivante();
      }
      return { ok: true };
    }

    if (action === 'restart') {
      if (!this.estHote(player.id) || this.phase !== 'over') return;
      this.start();
      return { ok: true };
    }
  }

  _mancheSuivante() {
    // Rassemble toutes les cartes non révélées, mélange, redistribue.
    const pool = [];
    for (const p of this.players) for (const c of p.g.cards) if (!c.revealed) pool.push(c);
    this.round++;
    this._distribuer(pool, cartesParJoueur(this.round));
    this.cutsThisRound = 0;
    // Le coupeur reste le dernier joueur coupé (déjà positionné).
  }

  _fin(team) {
    this.clearTimer();
    this.phase = 'over';
    this.winnerTeam = team;
    for (const p of this.players) {
      if (p.g && p.g.role === team) p.score = (p.score || 0) + 1;
    }
  }

  publicState() {
    const over = this.phase === 'over';
    const players = this.players.map((p) => ({
      id: p.id, name: p.name, avatar: p.avatar, color: p.color,
      connected: p.connected, isHost: p.id === this.room.hostId,
      isCutter: p.id === this.cutterId, score: p.score || 0,
      // Le rôle n'est révélé QU'À la fin de la partie.
      role: over && p.g ? p.g.role : null,
      // Une carte non révélée ne dévoile jamais son type.
      cards: (p.g ? p.g.cards : []).map((c) => (c.revealed
        ? { type: c.type, revealed: true }
        : { revealed: false })),
    }));
    return {
      game: 'timebomb', phase: this.phase, round: this.round, totalRounds: 4,
      cutterId: this.cutterId, defuseFound: this.defuseFound, defuseTotal: this.defuseTotal,
      bombFound: this.bombFound, winnerTeam: this.winnerTeam,
      revealed: this.revealed || [], players,
    };
  }

  // PRIVÉ (au joueur concerné) : son rôle ET le contenu de SES cartes — jamais
  // celles des autres.
  secretFor(player) {
    return {
      role: player.g ? player.g.role : null,
      myCards: (player.g ? player.g.cards : []).map((c) => ({ type: c.type, revealed: !!c.revealed })),
    };
  }
}
