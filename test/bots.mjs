// Bots de démonstration : rejoignent une partie et jouent automatiquement.
//   node test/bots.mjs <CODE> [nombre]
// Ils se déclarent prêts, donnent un indice à leur tour, votent, et (si Mister
// White) tentent une réponse. Ils ne sont jamais hôte : l'humain pilote.
import { WebSocket } from 'ws';

const CODE = (process.argv[2] || '').toUpperCase();
const N = parseInt(process.argv[3] || '3', 10);
const URL = process.env.URL || 'ws://localhost:3000';
if (!CODE) { console.error('Usage: node test/bots.mjs <CODE> [nombre]'); process.exit(1); }

const NOMS = ['Bob', 'Chloé', 'David', 'Emma', 'Farid', 'Gina', 'Hugo', 'Inès'];
const INDICES = ['proche', 'classique', 'évident', 'courant', 'connu', 'banal', 'sympa', 'utile'];
const rnd = (a) => a[Math.floor(Math.random() * a.length)];

function bot(nom) {
  const ws = new WebSocket(URL);
  const b = { nom, ws, id: null, state: null, secret: null, actedVote: '', actedClue: '', readyDone: false };
  ws.on('open', () => ws.send(JSON.stringify({ t: 'join', name: nom, code: CODE })));
  ws.on('message', (buf) => {
    const m = JSON.parse(buf.toString());
    if (m.t === 'joined') { b.id = m.id || m.playerId; }
    else if (m.t === 'secret') b.secret = { role: m.role, word: m.word };
    else if (m.t === 'error') console.log(`[${nom}] erreur:`, m.message);
    else if (m.t === 'room') { b.state = m.state; react(b); }
  });
  ws.on('close', () => console.log(`[${nom}] déconnecté`));
  return b;
}

function react(b) {
  const st = b.state; if (!st) return;
  const me = st.players.find((p) => p.id === b.id); if (!me) return;
  const send = (o) => b.ws.send(JSON.stringify(o));

  if (st.phase === 'lobby' && !b.readyDone) { b.readyDone = true; setTimeout(() => send({ t: 'ready', value: true }), 300 + Math.random() * 600); return; }

  if (st.phase === 'clues' && st.activeClueId === b.id && me.alive) {
    const key = st.round + '-' + st.cycle + '-' + st.clues.length;
    if (b.actedClue === key) return; b.actedClue = key;
    setTimeout(() => send({ t: 'clue', text: rnd(INDICES) }), 700 + Math.random() * 900);
    return;
  }

  if (st.phase === 'vote' && me.alive && !me.hasVoted) {
    const key = st.round + '-' + st.cycle;
    if (b.actedVote === key) return; b.actedVote = key;
    const cibles = st.players.filter((p) => p.alive && p.id !== b.id && (!st.vote?.candidates || st.vote.candidates.includes(p.id)));
    if (cibles.length) setTimeout(() => send({ t: 'vote', targetId: rnd(cibles).id }), 800 + Math.random() * 1200);
    return;
  }

  if (st.phase === 'mrWhiteGuess' && st.mrWhite && st.mrWhite.playerId === b.id && st.mrWhite.pending) {
    setTimeout(() => send({ t: 'guess', text: rnd(['plage', 'chat', 'pizza', 'voiture']) }), 1500);
    return;
  }
}

const bots = [];
for (let i = 0; i < N; i++) bots.push(bot(NOMS[i % NOMS.length] + (i >= NOMS.length ? i : '')));
console.log(`${N} bot(s) rejoignent la partie ${CODE} sur ${URL}. Ctrl+C pour arrêter.`);
