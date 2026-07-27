// ─────────────────────────────────────────────────────────────────────────
//  GameModule — base commune à tous les jeux « modules » de la plateforme.
//  Le socle (Room) gère joueurs, hôte, code, temps réel, reconnexion, score.
//  Un module ne code QUE sa logique de jeu via cette interface :
//
//    start(config)            — démarre le jeu
//    handleAction(p, a, msg)  — traite une action d'un joueur ; renvoie {error} ou rien
//    publicState()            — état PUBLIC du jeu (fusionné dans state.game)
//    secretFor(player)        — objet privé pour CE joueur (ou null)
//    nextRound(hostId)        — (option) relancer une manche
//    cleanup()                — libère les minuteurs
//
//  Aides : this.players / connectes / vivants, this.setTimer, this.broadcast.
//  Le module réutilise le minuteur unique du salon (donc `avancerMinuteur`
//  côté tests fonctionne aussi pour les modules).
// ─────────────────────────────────────────────────────────────────────────
export class GameModule {
  constructor(room) { this.room = room; }

  get id() { return this.room.selectedGameId; }
  get players() { return this.room.players; }
  get connectes() { return this.room.connectes; }
  trouver(id) { return this.room.trouver(id); }
  estHote(id) { return this.room.hostId === id; }

  // Minuteur (partagé avec le salon → testable via room.avancerMinuteur()).
  setTimer(name, seconds, cb) { this.room._setTimer(name, seconds, cb); }
  clearTimer() { this.room._clearTimer(); }
  timerInfo() { return this.room.timer ? { name: this.room.timer.name, endsAt: this.room.timer.endsAt } : null; }

  broadcast() { this.room._broadcastRef && this.room._broadcastRef(); }

  // À surcharger.
  start() {}
  handleAction() {}
  publicState() { return {}; }
  secretFor() { return null; }
  nextRound() {}
  cleanup() { this.clearTimer(); }
}
