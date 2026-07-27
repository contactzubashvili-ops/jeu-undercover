// ─────────────────────────────────────────────────────────────────────────
//  Test d'intégration RÉSEAU — connecte de vrais clients WebSocket au serveur
//  en cours d'exécution et joue une partie complète de bout en bout.
//  Lancer le serveur (npm start) puis :  node test/integration.mjs
// ─────────────────────────────────────────────────────────────────────────
import { WebSocket } from 'ws';

const URL = process.env.URL || 'ws://localhost:3000';
let ok = 0, ko = 0;
const check = (n, c) => { if (c) ok++; else { ko++; console.log('  ✗', n); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Client de test : garde le dernier état public + son secret.
function client(name) {
  const ws = new WebSocket(URL);
  const c = { name, ws, id: null, token: null, code: null, state: null, secret: null, log: [] };
  ws.on('message', (b) => {
    const m = JSON.parse(b.toString());
    c.log.push(m);
    if (m.t === 'joined') { c.id = m.playerId; c.token = m.token; c.code = m.code; }
    else if (m.t === 'room') c.state = m.state;
    else if (m.t === 'secret') { c.secret = { role: m.role, word: m.word }; c.secretSeq = (c.secretSeq || 0) + 1; }
    else if (m.t === 'error') c.lastError = m.message;
  });
  c.send = (o) => ws.send(JSON.stringify(o));
  c.ready = new Promise((res) => ws.on('open', res));
  return c;
}

async function waitFor(pred, timeout = 3000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { if (pred()) return true; await sleep(30); }
  return false;
}

async function main() {
  console.log('Connexion au serveur', URL);

  // 4 joueurs.
  const A = client('Alice'), B = client('Bob'), C = client('Chloé'), D = client('David');
  await Promise.all([A.ready, B.ready, C.ready, D.ready]);

  // A crée, les autres rejoignent.
  A.send({ t: 'create', name: 'Alice', config: { clueSeconds: 0, discussionSeconds: 0, voteSeconds: 0, rounds: 2 } });
  await waitFor(() => A.code);
  const code = A.code;
  check('code de partie reçu', /^[A-Z0-9]{6}$/.test(code));

  for (const cl of [B, C, D]) cl.send({ t: 'join', name: cl.name, code });
  await waitFor(() => A.state && A.state.players.length === 4);
  check('4 joueurs dans le lobby (synchro)', A.state.players.length === 4);
  check('les autres voient aussi 4 joueurs', D.state && D.state.players.length === 4);

  // Reconnexion : D coupe puis revient avec son token.
  const tokenD = D.token, idD = D.id;
  D.ws.close();
  await waitFor(() => A.state.players.find((p) => p.id === idD && !p.connected), 3000);
  check('déconnexion de D visible par A', !!A.state.players.find((p) => p.id === idD && !p.connected));
  const D2 = client('David'); await D2.ready;
  D2.send({ t: 'reconnect', code, token: tokenD });
  await waitFor(() => D2.id === idD && A.state.players.find((p) => p.id === idD && p.connected), 3000);
  check('reconnexion de D réussie', D2.id === idD);

  // Démarrage.
  A.send({ t: 'start' });
  await waitFor(() => A.state.phase === 'reveal');
  check('phase reveal', A.state.phase === 'reveal');

  const clients = [A, B, C, D2];
  await waitFor(() => clients.every((c) => c.secret));

  // ANTI-TRICHE : le message secret ne doit JAMAIS contenir le rôle.
  const secMsg = A.log.filter((m) => m.t === 'secret').pop();
  check('le message secret n’envoie jamais le rôle', secMsg && !('role' in secMsg));

  // On déduit les camps à partir des MOTS (comme un vrai joueur) :
  //  aucun mot ⇒ Mister White ; mot minoritaire ⇒ Undercover ; majoritaire ⇒ Civils.
  const mwClients = clients.filter((c) => c.secret.word === null);
  check('exactement 1 Mister White (aucun mot)', mwClients.length === 1);
  const avecMot = clients.filter((c) => c.secret.word !== null);
  const compteMot = {};
  for (const c of avecMot) compteMot[c.secret.word] = (compteMot[c.secret.word] || 0) + 1;
  const motUnder = Object.keys(compteMot).find((w) => compteMot[w] === 1);
  const motCivil = Object.keys(compteMot).find((w) => compteMot[w] > 1);
  const uc = avecMot.find((c) => c.secret.word === motUnder);
  const civ = avecMot.filter((c) => c.secret.word === motCivil);
  const mw = mwClients[0];
  check('exactement 1 Undercover (mot minoritaire)', avecMot.filter((c) => c.secret.word === motUnder).length === 1);
  check('2 civils (même mot majoritaire)', civ.length === 2);
  check('les civils ont le même mot', civ.length === 2 && civ[0].secret.word === civ[1].secret.word && !!motCivil);
  check('undercover a un mot différent', !!motUnder && motUnder !== motCivil);
  check('mister white n’a aucun mot', mw.secret.word === null);

  // ANTI-TRICHE : l'état public reçu par un client ne porte aucun rôle/mot de joueur.
  const fuite = A.state.players.some((p) => 'word' in p || 'role' in p || p.word === civ[0].secret.word || p.word === uc.secret.word);
  check('aucun rôle/mot de joueur dans l’état public', !fuite && !('secret' in A.state));
  // Un civil ne connaît pas le rôle de l'undercover via son état.
  const ucVisibleParCivil = civ[0].state.players.find((p) => p.id === uc.id);
  check('un joueur ne voit pas le rôle des autres (vivants)', !ucVisibleParCivil.revealedRole);

  // Indices.
  A.send({ t: 'startClues' });
  await waitFor(() => A.state.phase === 'clues');
  check('phase clues', A.state.phase === 'clues');
  // Chaque joueur donne un indice à son tour.
  for (let i = 0; i < 4; i++) {
    await waitFor(() => A.state.phase !== 'clues' || A.state.activeClueId);
    if (A.state.phase !== 'clues') break;
    const actifId = A.state.activeClueId;
    const actif = clients.find((c) => c.id === actifId);
    actif.send({ t: 'clue', text: 'indice' + i });
    await sleep(80);
  }
  check('indices enregistrés et diffusés (au moins un tour)', A.state.clues.length >= 4);

  // Les indices bouclent à l'infini : l'hôte ouvre le vote.
  A.send({ t: 'openVote' });
  await waitFor(() => A.state.phase === 'vote');
  check('phase vote', A.state.phase === 'vote');
  for (const c of clients) {
    const cible = c.id === uc.id ? civ[0].id : uc.id;
    c.send({ t: 'vote', targetId: cible });
    await sleep(40);
  }
  await waitFor(() => A.state.phase === 'voteReveal' || A.state.players.find((p) => p.id === uc.id && !p.alive), 4000);
  // L'undercover doit être révélé éliminé.
  await waitFor(() => A.state.players.find((p) => p.id === uc.id && p.revealedRole === 'undercover'), 4000);
  check('undercover éliminé et rôle révélé', !!A.state.players.find((p) => p.id === uc.id && p.revealedRole === 'undercover'));

  // On pilote la manche jusqu'à sa fin, en attendant chaque transition de phase.
  async function driveUntilRoundEnd(timeout = 60000) {
    const t0 = Date.now();
    let last = '';
    while (A.state.phase !== 'roundEnd' && Date.now() - t0 < timeout) {
      const ph = A.state.phase;
      if (ph !== last) { console.log('    …phase:', ph, '| vivants:', A.state.players.filter(p => p.alive).length); last = ph; }
      if (ph === 'clues') {
        const actifId = A.state.activeClueId;
        const actif = clients.find((c) => c.id === actifId);
        if (actif) actif.send({ t: 'clue', text: 'x' }); else A.send({ t: 'passClue' });
        A.send({ t: 'openVote' }); // les indices bouclent : on force le vote
        await waitFor(() => A.state.phase !== 'clues', 3000);
      } else if (ph === 'discussion') {
        A.send({ t: 'openVote' });
        await waitFor(() => A.state.phase === 'vote', 3000);
      } else if (ph === 'vote') {
        const vivants = A.state.players.filter((p) => p.alive);
        const cible = vivants.find((p) => !p.revealedRole) || vivants[0];
        for (const c of clients) {
          const meAlive = c.state.players.find((p) => p.id === c.id)?.alive;
          if (!meAlive) continue;
          const tid = cible.id === c.id ? vivants.find((p) => p.id !== c.id)?.id : cible.id;
          if (tid) c.send({ t: 'vote', targetId: tid });
        }
        await waitFor(() => A.state.phase !== 'vote', 4000);
      } else if (ph === 'voteReveal') {
        await waitFor(() => A.state.phase !== 'voteReveal', 9000);
      } else if (ph === 'mrWhiteGuess') {
        const g = clients.find((c) => c.id === A.state.mrWhite.playerId);
        g && g.send({ t: 'guess', text: 'reponsefausse' });
        await waitFor(() => A.state.phase !== 'mrWhiteGuess', 3000);
      } else {
        await sleep(200);
      }
    }
  }
  await driveUntilRoundEnd();
  check('la manche se termine (roundEnd)', A.state.phase === 'roundEnd');
  check('un vainqueur est désigné', ['civils', 'undercover', 'mrwhite'].includes(A.state.winner));
  check('résumé de manche complet (mots révélés)', A.state.roundSummary && A.state.roundSummary.civilWord && A.state.roundSummary.undercoverWord);
  check('des points sont diffusés', A.state.players.some((p) => p.score !== 0));

  // Manche suivante : rôles redistribués + nouveaux secrets.
  const seqBefore = clients.map((c) => c.secretSeq || 0);
  A.send({ t: 'nextRound' });
  await waitFor(() => A.state.phase === 'reveal' && A.state.round === 2);
  check('manche 2 démarrée', A.state.phase === 'reveal' && A.state.round === 2);
  // attendre un NOUVEAU secret pour chaque joueur (distribution de la manche 2)
  await waitFor(() => clients.every((c, i) => (c.secretSeq || 0) > seqBefore[i]), 5000);
  const mw2 = clients.filter((c) => c.secret.word === null).length;
  const avec2 = clients.filter((c) => c.secret.word !== null);
  const cnt2 = {}; for (const c of avec2) cnt2[c.secret.word] = (cnt2[c.secret.word] || 0) + 1;
  const under2 = Object.values(cnt2).filter((n) => n === 1).length;
  check('toujours 1 Mister White + 1 Undercover en manche 2 (déduit des mots)', mw2 === 1 && under2 === 1);

  for (const c of clients) c.ws.close();
  console.log(`\n═══════════════════════════════════════`);
  console.log(`  Intégration réseau : ${ok} OK / ${ko} échec(s)`);
  console.log(`═══════════════════════════════════════`);
  process.exit(ko === 0 ? 0 : 1);
}

main().catch((e) => { console.error('ERREUR TEST:', e); process.exit(1); });
