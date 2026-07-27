// Vérifie : score global + historique (après une partie) et emotes temps réel.
import { WebSocket } from 'ws';
const URL = process.env.URL || 'ws://localhost:3000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(p, ms = 5000) { const t = Date.now(); while (Date.now() - t < ms) { if (p()) return true; await sleep(25); } return false; }
let ok = 0, ko = 0; const check = (n, c) => { if (c) { ok++; console.log('  ✓', n); } else { ko++; console.log('  ✗', n); } };

function bot(name) {
  const ws = new WebSocket(URL);
  const c = { name, ws, id: null, code: null, state: null, emotes: [] };
  ws.on('message', (b) => { const m = JSON.parse(b.toString()); if (m.t === 'joined') { c.id = m.playerId; c.code = m.code; } else if (m.t === 'room') c.state = m.state; else if (m.t === 'emote') c.emotes.push(m); });
  c.send = (o) => ws.send(JSON.stringify(o));
  c.ready = new Promise((r) => ws.on('open', r));
  return c;
}

async function main() {
  console.log('\n════════ VÉRIF — score global, historique, emotes ════════\n');
  const A = bot('Alice'), B = bot('Bob');
  await Promise.all([A.ready, B.ready]);

  // Emote temps réel
  A.send({ t: 'create', name: 'Alice' });
  await until(() => A.code);
  B.send({ t: 'join', name: 'Bob', code: A.code });
  await until(() => A.state && A.state.players.length === 2);
  B.send({ t: 'emote', emoji: '👎' });
  await until(() => A.emotes.length > 0, 2000);
  check('emote diffusée à tous (Alice reçoit celle de Bob)', A.emotes.length > 0 && A.emotes[0].emoji === '👎' && A.emotes[0].from === 'Bob');

  // Joue une partie de Fusion puis revient au lobby → stats + historique
  A.send({ t: 'selectGame', gameId: 'fusion' });
  A.send({ t: 'config', patch: { rounds: 1 } });
  await sleep(120);
  A.send({ t: 'start' });
  await until(() => A.state.phase === 'ingame' && A.state.game.phase === 'submit');
  A.send({ t: 'game', action: 'submit', text: 'chat' });
  B.send({ t: 'game', action: 'submit', text: 'chat' }); // même réponse → +1 chacun
  await until(() => A.state.game.phase === 'reveal', 3000);
  A.send({ t: 'game', action: 'next' });
  await until(() => A.state.game.phase === 'over', 3000);
  check('Fusion terminée (over)', A.state.game.phase === 'over');
  A.send({ t: 'backToLobby' });
  await until(() => A.state.phase === 'lobby' && A.state.history && A.state.history.length > 0, 3000);
  check('historique du salon créé', A.state.history && A.state.history.length === 1);
  check('historique : jeu = fusion', A.state.history[0].game === 'fusion');
  check('historique : vainqueurs enregistrés', A.state.history[0].winners.length >= 1);
  const alice = A.state.players.find((p) => p.id === A.id);
  check('stats globales : 1 partie jouée', alice.stats.gamesPlayed === 1);
  check('stats globales : points cumulés > 0', alice.stats.totalPoints > 0);
  check('stats par jeu (fusion) présentes', alice.stats.byGame.fusion && alice.stats.byGame.fusion.games === 1);

  A.ws.close(); B.ws.close();
  console.log(`\n  Résultat : ${ok} OK / ${ko} échec(s)\n`);
  process.exit(ko === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
