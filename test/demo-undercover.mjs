// Démo « bots » : 5 bots jouent une manche complète d'Undercover, narrée.
//   node test/demo-undercover.mjs      (serveur lancé : npm start)
import { WebSocket } from 'ws';

const URL = process.env.URL || 'ws://localhost:3000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CLUES = ['proche', 'classique', 'connu', 'courant', 'banal', 'évident', 'sympa', 'récent', 'grand', 'commun'];
const rnd = (a) => a[Math.floor(Math.random() * a.length)];

function bot(name) {
  const ws = new WebSocket(URL);
  const c = { name, ws, id: null, token: null, code: null, state: null, secret: null };
  ws.on('message', (b) => {
    const m = JSON.parse(b.toString());
    if (m.t === 'joined') { c.id = m.playerId; c.token = m.token; c.code = m.code; }
    else if (m.t === 'secret') c.secret = { word: m.word };
    else if (m.t === 'room') c.state = m.state;
  });
  c.send = (o) => ws.send(JSON.stringify(o));
  c.ready = new Promise((res) => ws.on('open', res));
  return c;
}
async function until(pred, ms = 6000) { const t = Date.now(); while (Date.now() - t < ms) { if (pred()) return true; await sleep(30); } return false; }

async function main() {
  console.log('\n════════ DÉMO UNDERCOVER — 5 bots ════════\n');
  const bots = ['Alice', 'Bob', 'Chloé', 'David', 'Emma'].map(bot);
  await Promise.all(bots.map((b) => b.ready));
  const [host] = bots;

  host.send({ t: 'create', name: host.name, config: { mode: 'both', clueSeconds: 0, voteSeconds: 0, rounds: 1, voteReady: true } });
  await until(() => host.code);
  const code = host.code;
  console.log(`Salon créé : ${code}`);
  for (const b of bots.slice(1)) b.send({ t: 'join', name: b.name, code });
  await until(() => host.state && host.state.players.length === 5);
  console.log(`5 joueurs dans le salon.\n`);

  host.send({ t: 'start' });
  await until(() => host.state.phase === 'reveal' && bots.every((b) => b.secret));

  // Déduction des camps à partir des mots (comme un vrai joueur).
  const withWord = bots.filter((b) => b.secret.word !== null);
  const cnt = {}; for (const b of withWord) cnt[b.secret.word] = (cnt[b.secret.word] || 0) + 1;
  const wUnder = Object.keys(cnt).find((w) => cnt[w] === 1);
  const wCivil = Object.keys(cnt).find((w) => cnt[w] > 1);
  const campDe = (b) => b.secret.word === null ? 'MISTER WHITE' : (b.secret.word === wUnder ? 'UNDERCOVER' : 'CIVIL');
  console.log('── Distribution secrète (vérité, cachée aux joueurs) ──');
  for (const b of bots) console.log(`   ${b.name.padEnd(7)} → ${campDe(b).padEnd(12)} ${b.secret.word ? '· mot : ' + b.secret.word : '· aucun mot'}`);
  console.log('');

  host.send({ t: 'startClues' });
  await until(() => host.state.phase === 'clues');

  let vus = 0, dernierCycle = 0;
  const narrer = () => {
    const st = host.state;
    if (st.cycle !== dernierCycle) { dernierCycle = st.cycle; vus = 0; console.log(`\n── Tour d'indices ${st.cycle} ──`); }
    for (let i = vus; i < st.clues.length; i++) { const c = st.clues[i]; console.log(`   💬 ${c.name.padEnd(7)} : « ${c.text} »`); }
    vus = st.clues.length;
  };

  const t0 = Date.now();
  let etat = 'clues';
  while (host.state.phase !== 'roundEnd' && Date.now() - t0 < 40000) {
    const st = host.state;
    if (st.phase === 'clues') {
      narrer();
      const actif = bots.find((b) => b.id === st.activeClueId);
      if (actif) actif.send({ t: 'clue', text: rnd(CLUES) });
      await until(() => host.state.activeClueId !== st.activeClueId || host.state.phase !== 'clues', 3000);
    } else if (st.phase === 'discussion') {
      narrer();
      if (etat !== 'discussion') { etat = 'discussion'; console.log('\n── Discussion : les joueurs se déclarent prêts à voter ──'); }
      // Chaque bot vivant se déclare prêt → le vote se lance à la majorité.
      for (const b of bots) { const p = st.players.find((x) => x.id === b.id); if (p && p.alive) b.send({ t: 'voteReady', value: true }); }
      await until(() => host.state.phase !== 'discussion', 3000);
      if (host.state.phase === 'vote') console.log('   ✔ Majorité prête → VOTE');
    } else if (st.phase === 'vote') {
      const vivants = st.players.filter((p) => p.alive);
      const cand = st.vote && st.vote.candidates;
      for (const b of bots) {
        const me = st.players.find((x) => x.id === b.id); if (!me || !me.alive) continue;
        // Au second tour, on ne vote que pour les candidats (jamais soi-même).
        const cibles = (cand ? vivants.filter((p) => cand.includes(p.id)) : vivants).filter((p) => p.id !== b.id);
        if (cibles.length) b.send({ t: 'vote', targetId: rnd(cibles).id });
      }
      await until(() => host.state.phase !== 'vote', 6000);
    } else if (st.phase === 'voteReveal') {
      const vr = st.voteResult || {};
      if (vr.egalite) console.log('\n   ⚖️  Égalité → second tour');
      else if (vr.eliminated) console.log(`\n   ❌ ${vr.eliminated.name} est éliminé — rôle : ${vr.eliminated.role.toUpperCase()}`);
      await until(() => host.state.phase !== 'voteReveal', 9000);
    } else if (st.phase === 'mrWhiteGuess') {
      const g = bots.find((b) => b.id === st.mrWhite.playerId);
      console.log(`\n   👻 ${st.mrWhite.name} (Mister White) tente de deviner le mot des civils…`);
      g && g.send({ t: 'guess', text: 'plage' });
      await until(() => host.state.phase !== 'mrWhiteGuess', 3000);
      const r = host.state.roundSummary && host.state.roundSummary.mrWhiteGuess;
      if (r) console.log(`      → « ${r.guess} » : ${r.correct ? 'CORRECT, Mister White gagne !' : 'faux.'}`);
    } else await sleep(200);
  }

  const rs = host.state.roundSummary || {};
  const nom = { civils: 'VICTOIRE DES CIVILS 🛡️', undercover: 'VICTOIRE DE L’UNDERCOVER 🎭', mrwhite: 'VICTOIRE DE MISTER WHITE 👻' }[rs.winner] || '?';
  console.log(`\n════════ ${nom} ════════`);
  console.log(`   Mot des civils    : ${rs.civilWord}`);
  console.log(`   Mot de l'undercover : ${rs.undercoverWord}`);
  console.log('   Rôles :');
  for (const r of (rs.roles || [])) console.log(`     ${r.name.padEnd(7)} → ${r.role.toUpperCase().padEnd(12)} ${r.alive ? '(en vie)' : '(éliminé)'} · ${r.points} pts`);
  console.log('');
  for (const b of bots) b.ws.close();
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
