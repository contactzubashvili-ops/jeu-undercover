// Registre des modules de jeu (hors Undercover, géré directement par la Room).
// Ajoutez ici chaque nouveau jeu : import + entrée dans GAME_MODULES.
import { FusionGame } from './fusion.js';
import { LadderGame } from './ladder.js';
import { TimeBombGame } from './timebomb.js';
import { BombPartyGame } from './bombparty.js';
import { WordScatterGame } from './wordscatter.js';
import { PinturilloGame } from './pinturillo.js';
import { AssassinGame } from './assassin.js';
import { ChameleonGame } from './chameleon.js';
import { CodenamesGame } from './codenames.js';

export const GAME_MODULES = {
  fusion: FusionGame,
  ladder: LadderGame,
  timebomb: TimeBombGame,
  bombparty: BombPartyGame,
  wordscatter: WordScatterGame,
  pinturillo: PinturilloGame,
  assassin: AssassinGame,
  chameleon: ChameleonGame,
  codenames: CodenamesGame,
};

export function makeGame(id, room) {
  const Ctor = GAME_MODULES[id];
  return Ctor ? new Ctor(room) : null;
}
