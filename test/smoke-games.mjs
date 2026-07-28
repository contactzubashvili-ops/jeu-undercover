// Smoke test réseau : démarre chaque jeu « module » avec des bots et vérifie
// qu'il se lance sans crash, que l'état public est bien formé, et fait une
// action de base. Serveur lancé (npm start) requis.
import { WebSocket } from 'ws';
const URL = process.env.URL || 'ws://localhost:3000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(p, ms = 5000) { const t = Date.now(); while (Date.now() - t < ms) { if (p()) return true; await sleep(25); } return false; }
let ok = 0, ko = 0;
const check = (n, c) => { if (c) { ok++; console.log('  ✓', n); } else { ko++; console.log('  ✗', n); } };

function bot() {
  const ws = new WebSocket(URL);
  const c = { ws, id: null, code: null, state: null, secret: null };
  ws.on('message', (b) => { const m = JSON.parse(b.toString()); if (m.t === 'joined') { c.id = m.playerId; c.code = m.code; } else if (m.t === 'room') c.state = m.state; else if (m.t === 'secret') c.secret = m; });
  c.send = (o) => ws.send(JSON.stringify(o));
  c.ready = new Promise((r) => ws.on('open', r));
  return c;
}

async function lancer(gameId, n, patch = {}) {
  const bots = Array.from({ length: n }, bot);
  await Promise.all(bots.map((b) => b.ready));
  const [host] = bots;
  host.send({ t: 'create', name: 'H' });
  await until(() => host.code);
  for (let i = 1; i < n; i++) bots[i].send({ t: 'join', name: 'B' + i, code: host.code });
  await until(() => host.state && host.state.players.length === n);
  host.send({ t: 'selectGame', gameId });
  if (Object.keys(patch).length) host.send({ t: 'config', patch });
  await sleep(120);
  host.send({ t: 'start' });
  await until(() => host.state.phase === 'ingame' && host.state.game && host.state.game.game === gameId, 4000);
  return { bots, host };
}

async function main() {
  console.log('\n════════ SMOKE TEST — jeux modules ════════\n');

  // FUSION (min 2) + équipes + thème geek
  console.log('FUSION (équipes + thème jeux vidéo)');
  {
    const { bots, host } = await lancer('fusion', 2, { rounds: 2, teamMode: true, teams: {}, fusionThemes: ['jeuxvideo'] });
    check('démarré en ingame', host.state.phase === 'ingame' && host.state.game.game === 'fusion');
    check('prompt présent', Array.isArray(host.state.game.prompt) && host.state.game.prompt.length === 2);
    check('mode équipe transmis', host.state.game.teamMode === true);
    bots.forEach((b) => b.send({ t: 'game', action: 'submit', text: 'test' }));
    await until(() => host.state.game.phase === 'reveal', 3000);
    check('révélation après soumissions', host.state.game.phase === 'reveal');
    bots.forEach((b) => b.ws.close());
  }

  // LADDER (min 3)
  console.log('\nÉCHELLE');
  {
    const { bots, host } = await lancer('ladder', 3, { rounds: 1 });
    check('démarré en ingame', host.state.game.game === 'ladder');
    check('thème présent', typeof host.state.game.theme === 'string' && host.state.game.theme.length > 0);
    check('nombre secret privé reçu', bots.every((b) => b.secret && typeof b.secret.ladderNumber === 'number'));
    check('nombre secret ABSENT du public', !JSON.stringify(host.state.game).match(/ladderNumber/));
    bots.forEach((b, i) => b.send({ t: 'game', action: 'answer', text: 'reponse' + i }));
    await until(() => host.state.game.phase === 'order', 3000);
    check('passage en phase order', host.state.game.phase === 'order');
    bots.forEach((b) => b.ws.close());
  }

  // TIME BOMB (min 4)
  console.log('\nTIME BOMB');
  {
    const { bots, host } = await lancer('timebomb', 4);
    check('démarré en ingame', host.state.game.game === 'timebomb');
    const g = host.state.game;
    check('rôle privé reçu', bots.every((b) => b.secret && typeof b.secret.role === 'string'));
    check('rôle non révélé pendant la partie', g.players.every((p) => p.role == null));
    check('cartes non révélées masquées (pas de type)', g.players.every((p) => (p.cards || []).every((c) => c.revealed || c.type === undefined)));
    bots.forEach((b) => b.ws.close());
  }

  // BOMB PARTY (min 2)
  console.log('\nBOMB PARTY');
  {
    const { bots, host } = await lancer('bombparty', 3);
    check('démarré en ingame', host.state.game.game === 'bombparty');
    check('syllabe présente', typeof host.state.game.syllabe === 'string' && host.state.game.syllabe.length >= 2);
    check('un joueur actif', !!host.state.game.activeId);
    // mot invalide → doit être refusé sans crash
    const actif = bots.find((b) => b.id === host.state.game.activeId);
    actif && actif.send({ t: 'game', action: 'word', text: 'zzz' });
    await sleep(200);
    check('toujours vivant après démarrage', host.state.phase === 'ingame');
    bots.forEach((b) => b.ws.close());
  }

  // WORD SCATTER (min 3)
  console.log('\nWORD SCATTER');
  {
    const { bots, host } = await lancer('wordscatter', 3);
    check('démarré en ingame', host.state.game.game === 'wordscatter');
    const g = host.state.game;
    check('mot secret ABSENT du public (avant fin)', g.reveal == null && !JSON.stringify(g.players).match(/"letters"/));
    check('lettres privées reçues', bots.every((b) => b.secret && Array.isArray(b.secret.letters)));
    // place une lettre valide (une lettre du joueur est forcément dans le mot)
    const j = bots.find((b) => b.secret && b.secret.letters.length);
    if (j) { j.send({ t: 'game', action: 'place', letter: j.secret.letters[0], side: 'start' }); await sleep(250); }
    check('placement d’une lettre accepté (built non vide ou gagné)', host.state.game.built.length >= 1 || host.state.game.phase !== 'play');
    bots.forEach((b) => b.ws.close());
  }

  // ASSASSIN (min 3)
  console.log('\nASSASSIN');
  {
    const { bots, host } = await lancer('assassin', 4, { rounds: 1 });
    const g = host.state.game;
    check('démarré en ingame', g.game === 'assassin' && g.phase === 'play');
    check('table de 4 sièges', Array.isArray(g.seats) && g.seats.length === 4);
    check('sièges masqués dans le public', g.seats.every((s) => !s.revealed && s.name === undefined));
    check('siège + cible reçus en privé', bots.every((b) => b.secret && Number.isInteger(b.secret.seat) && b.secret.target && typeof b.secret.target.name === 'string'));
    check('cible ABSENTE du public (pas de fuite de siège)', !JSON.stringify(g).match(/"target"/));
    // Chuchotement livré au bon destinataire (identifié par son siège).
    const b0 = bots[0];
    const dest = bots.find((b) => b !== b0 && b.secret);
    b0.send({ t: 'game', action: 'whisper', seat: dest.secret.seat, text: 'ping-secret' });
    await until(() => (dest.secret.chats || []).some((c) => c.seat === b0.secret.seat && c.messages.some((m) => !m.mine && m.text === 'ping-secret')), 3000);
    check('chuchotement reçu par le destinataire', (dest.secret.chats || []).some((c) => c.seat === b0.secret.seat && c.messages.some((m) => !m.mine)));
    // Tir : met fin à la manche (suspense), puis révélation.
    const cible = [0, 1, 2, 3].find((s) => s !== b0.secret.seat);
    b0.send({ t: 'game', action: 'shoot', seat: cible });
    await until(() => host.state.game.phase === 'suspense', 3000);
    check('un tir met la manche en suspense', host.state.game.phase === 'suspense');
    await until(() => host.state.game.phase === 'reveal', 5000);
    check('révélation : sièges dévoilés', host.state.game.seats.every((s) => s.revealed));
    bots.forEach((b) => b.ws.close());
  }

  console.log(`\n═══════════════════════════════════════`);
  console.log(`  Smoke jeux : ${ok} OK / ${ko} échec(s)`);
  console.log(`═══════════════════════════════════════`);
  process.exit(ko === 0 ? 0 : 1);
}
main().catch((e) => { console.error('ERREUR:', e); process.exit(1); });
