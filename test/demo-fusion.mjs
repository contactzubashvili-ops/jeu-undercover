// Démo « bots » : 3 bots jouent 2 manches de Fusion, narrées.
import { WebSocket } from 'ws';
const URL = process.env.URL || 'ws://localhost:3000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(p, ms = 5000) { const t = Date.now(); while (Date.now() - t < ms) { if (p()) return true; await sleep(30); } return false; }

// Pour créer des regroupements, les bots piochent dans un petit jeu de réponses.
const REPONSES = ['chaud', 'chaud', 'nature'];

function bot(name) {
  const ws = new WebSocket(URL);
  const c = { name, ws, id: null, code: null, state: null };
  ws.on('message', (b) => { const m = JSON.parse(b.toString()); if (m.t === 'joined') { c.id = m.playerId; c.code = m.code; } else if (m.t === 'room') c.state = m.state; });
  c.send = (o) => ws.send(JSON.stringify(o));
  c.ready = new Promise((r) => ws.on('open', r));
  return c;
}

async function main() {
  console.log('\n════════ DÉMO FUSION — 3 bots ════════\n');
  const bots = ['Alice', 'Bob', 'Chloé'].map(bot);
  await Promise.all(bots.map((b) => b.ready));
  const [host] = bots;
  host.send({ t: 'create', name: host.name });
  await until(() => host.code);
  for (const b of bots.slice(1)) b.send({ t: 'join', name: b.name, code: host.code });
  await until(() => host.state && host.state.players.length === 3);
  host.send({ t: 'selectGame', gameId: 'fusion' });
  host.send({ t: 'config', patch: { rounds: 2 } });
  await sleep(150);
  host.send({ t: 'start' });
  await until(() => host.state.phase === 'ingame' && host.state.game.phase === 'submit');
  console.log('Fusion lancé (2 manches).\n');

  let round = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 20000) {
    const g = host.state.game;
    if (host.state.phase !== 'ingame') break;
    if (g.phase === 'submit') {
      if (g.round !== round) { round = g.round; console.log(`── Manche ${g.round} : ${g.prompt[0]} + ${g.prompt[1]} ──`); }
      bots.forEach((b, i) => {
        const me = g.players.find((p) => p.id === b.id);
        if (me && !me.submitted) { const rep = REPONSES[i % REPONSES.length]; console.log(`   ✍️  ${b.name} répond « ${rep} »`); b.send({ t: 'game', action: 'submit', text: rep }); }
      });
      await until(() => host.state.game.phase !== 'submit', 3000);
    } else if (g.phase === 'reveal') {
      console.log('   Résultats :');
      for (const grp of g.groups) console.log(`     « ${grp.answer} » ← ${grp.players.map((p) => p.name).join(', ')}${grp.scored ? '  (+1 chacun)' : ''}`);
      console.log('   Scores : ' + g.players.map((p) => `${p.name}=${p.score}`).join(' · ') + '\n');
      host.send({ t: 'game', action: 'next' });
      await until(() => host.state.game.phase !== 'reveal', 3000);
    } else if (g.phase === 'over') {
      console.log('════════ CLASSEMENT FINAL ════════');
      g.ranking.forEach((p, i) => console.log(`   ${i + 1}. ${p.name} — ${p.score} pt(s)`));
      break;
    }
  }
  for (const b of bots) b.ws.close();
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
