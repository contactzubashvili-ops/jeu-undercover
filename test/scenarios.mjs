// ─────────────────────────────────────────────────────────────────────────
//  Tests de scénario — pilotent directement le moteur GameRoom (sans réseau).
//  Vérifient les règles imposées : 1 undercover + 1 mister white toujours,
//  mots cohérents, secrets protégés, votes, victoires, Mister White.
// ─────────────────────────────────────────────────────────────────────────
import { GameRoom, PHASES } from '../src/room.js';
import { ROLES } from '../src/roles.js';
import { facettes } from '../src/words.js';

let ok = 0, ko = 0;
function check(nom, cond) {
  if (cond) { ok++; } else { ko++; console.log('  ✗ ÉCHEC :', nom); }
}
function section(t) { console.log('\n### ' + t); }

// Faux socket qui capture les messages reçus par chaque joueur.
function fakeWs() {
  return { readyState: 1, sent: [], send(s) { this.sent.push(JSON.parse(s)); } };
}

function creerPartie(nbJoueurs, config = {}) {
  const room = new GameRoom('TEST01');
  room.brancherDiffusion(() => room.diffuser());
  const sockets = [];
  for (let i = 0; i < nbJoueurs; i++) {
    const ws = fakeWs();
    const p = room.nouveauJoueur('J' + (i + 1), ws);
    ws._pid = p.id;
    sockets.push(ws);
  }
  const hostId = room.hostId;
  room.setConfig(hostId, { clueSeconds: 0, discussionSeconds: 0, voteSeconds: 0, rounds: 3, ...config });
  return { room, sockets, hostId };
}

// Donne les indices dans l'ordre pour arriver en discussion.
function passerIndices(room) {
  let garde = 0;
  while (room.phase === PHASES.CLUES && garde++ < 100) {
    const actifId = room.publicState().activeClueId;
    room.soumettreIndice(actifId, 'indice');
  }
}

// Fait voter tout le monde (vivants) contre `cibleId`.
function voterContre(room, cibleId) {
  for (const p of room.vivants) {
    if (p.id === cibleId) {
      // le condamné vote quelqu'un d'autre
      const autre = room.vivants.find((x) => x.id !== cibleId);
      room.voter(p.id, autre.id);
    } else {
      room.voter(p.id, cibleId);
    }
  }
}

function roleDe(room, id) { return room.trouver(id).role; }
function parRole(room, role) { return room.players.filter((p) => p.role === role); }

// ── 1) Composition des rôles pour 3, 5, 8, 10 joueurs, 200 tirages ─────────
section('Composition des rôles (jamais 2 undercover / 2 mister white)');
for (const n of [3, 5, 8, 10]) {
  let compositionOK = true, motsOK = true, secretsOK = true;
  for (let essai = 0; essai < 200; essai++) {
    const { room, hostId } = creerPartie(n);
    room.demarrer(hostId);
    const uc = parRole(room, ROLES.UNDERCOVER);
    const mw = parRole(room, ROLES.MRWHITE);
    const civ = parRole(room, ROLES.CIVIL);
    if (uc.length !== 1 || mw.length !== 1 || civ.length !== n - 2) compositionOK = false;
    // Mots : tous les civils ont le MÊME mot = civilWord ; undercover a un mot différent ; MW aucun.
    const cw = room.secret.civilWord;
    if (!civ.every((p) => p.word === cw)) motsOK = false;
    if (uc[0].word === cw || !uc[0].word) motsOK = false;
    if (mw[0].word !== null) motsOK = false;
    // Anti-triche structurel : aucun joueur public ne porte de champ role/word,
    // et l'état public ne contient ni le mot secret ni la clé `secret`.
    const pub = room.publicState();
    for (const pp of pub.players) { if ('word' in pp || 'role' in pp) secretsOK = false; }
    if ('secret' in pub || 'words' in pub) secretsOK = false;
    if (pub.players.some((pp) => pp.word === cw || pp.word === uc[0].word)) secretsOK = false;
  }
  check(`${n} joueurs : 1 UC + 1 MW + ${n - 2} civils (×200)`, compositionOK);
  check(`${n} joueurs : mots civils identiques, UC différent, MW aucun`, motsOK);
  check(`${n} joueurs : aucun mot secret dans l'état public`, secretsOK);
}

// ── 1b) Modes : undercover seul / mister white seul ─────────────────────────
section('Modes de jeu : undercover seul et mister white seul');
for (const [mode, expUC, expMW] of [['undercover', 1, 0], ['mrwhite', 0, 1]]) {
  let compOK = true, motsOK = true;
  for (let i = 0; i < 100; i++) {
    const { room, hostId } = creerPartie(6, { mode });
    room.demarrer(hostId);
    const uc = parRole(room, ROLES.UNDERCOVER).length;
    const mw = parRole(room, ROLES.MRWHITE).length;
    const civ = parRole(room, ROLES.CIVIL).length;
    if (uc !== expUC || mw !== expMW || civ !== 6 - expUC - expMW) compOK = false;
    const cw = room.secret.civilWord;
    for (const p of parRole(room, ROLES.CIVIL)) if (p.word !== cw) motsOK = false;
    if (expUC) { const u = parRole(room, ROLES.UNDERCOVER)[0]; if (!u.word || u.word === cw) motsOK = false; }
    if (expMW) { const m = parRole(room, ROLES.MRWHITE)[0]; if (m.word !== null) motsOK = false; }
  }
  check(`mode ${mode} : ${expUC} undercover + ${expMW} mister white (×100)`, compOK);
  check(`mode ${mode} : mots cohérents`, motsOK);
}
{
  const { room, hostId } = creerPartie(5, { mode: 'undercover' });
  room.demarrer(hostId); room.lancerIndices(hostId); passerIndices(room); room.ouvrirVote(hostId);
  const uc = parRole(room, ROLES.UNDERCOVER)[0];
  voterContre(room, uc.id); room.avancerMinuteur();
  check('mode undercover : civils gagnent en éliminant l’undercover', room.phase === PHASES.ROUND_END && room.winner === 'civils');
}
{
  const { room, hostId } = creerPartie(5, { mode: 'mrwhite' });
  room.demarrer(hostId); room.lancerIndices(hostId); passerIndices(room); room.ouvrirVote(hostId);
  const mw = parRole(room, ROLES.MRWHITE)[0];
  voterContre(room, mw.id); room.avancerMinuteur();
  check('mode mrwhite : MW éliminé passe en devinette', room.phase === PHASES.MRWHITE_GUESS);
  room.deviner(mw.id, room.secret.civilWord);
  check('mode mrwhite : MW gagne en devinant le mot', room.phase === PHASES.ROUND_END && room.winner === 'mrwhite');
}

// ── 2) Secrets envoyés uniquement au bon socket ────────────────────────────
section('Distribution secrète : chaque joueur ne reçoit que son secret');
{
  const { room, sockets, hostId } = creerPartie(5);
  room.demarrer(hostId);
  room.diffuser(); // en production, c'est le routeur qui diffuse après 'start'
  let bon = true, sansRole = true;
  for (const ws of sockets) {
    const secrets = ws.sent.filter((m) => m.t === 'secret');
    const dernier = secrets[secrets.length - 1];
    const p = room.trouver(ws._pid);
    if (!dernier) { bon = false; continue; }
    if (dernier.word !== (p.word ?? null)) bon = false;    // son propre mot
    if ('role' in dernier) sansRole = false;               // JAMAIS le rôle
  }
  check('chaque socket reçoit son propre mot', bon);
  check('le message secret ne contient JAMAIS le rôle (anti-triche)', sansRole);
}

// ── 3) Élimination d'un civil : le rôle est révélé, la partie continue ─────
section('Élimination d’un civil');
{
  const { room, hostId } = creerPartie(6);
  room.demarrer(hostId);
  room.lancerIndices(hostId);
  passerIndices(room);
  room.ouvrirVote(hostId);
  const civ = parRole(room, ROLES.CIVIL)[0];
  voterContre(room, civ.id);           // clôture le vote (tous ont voté)
  check('phase = voteReveal après vote', room.phase === PHASES.VOTE_REVEAL);
  check('civil éliminé, rôle révélé', room.trouver(civ.id).revealedRole === ROLES.CIVIL);
  room.avancerMinuteur();              // fin de l'écran de résultat
  check('partie continue (nouveau cycle d’indices)', room.phase === PHASES.CLUES);
}

// ── 4) Mister White éliminé → devine → BON mot → gagne la manche ───────────
section('Mister White éliminé devine le bon mot');
{
  const { room, hostId } = creerPartie(5);
  room.demarrer(hostId);
  room.lancerIndices(hostId);
  passerIndices(room);
  room.ouvrirVote(hostId);
  const mw = parRole(room, ROLES.MRWHITE)[0];
  voterContre(room, mw.id);
  room.avancerMinuteur();              // voteReveal → phase MW
  check('phase = mrWhiteGuess', room.phase === PHASES.MRWHITE_GUESS);
  room.deviner(mw.id, room.secret.civilWord);
  check('Mister White gagne la manche', room.phase === PHASES.ROUND_END && room.winner === 'mrwhite');
}

// ── 5) Mister White éliminé → MAUVAIS mot → éliminé pour de bon ────────────
section('Mister White éliminé se trompe');
{
  const { room, hostId } = creerPartie(6);
  room.demarrer(hostId);
  room.lancerIndices(hostId);
  passerIndices(room);
  room.ouvrirVote(hostId);
  const mw = parRole(room, ROLES.MRWHITE)[0];
  voterContre(room, mw.id);
  room.avancerMinuteur();
  room.deviner(mw.id, 'motcompletementfaux');
  check('MW faux : ne gagne pas immédiatement', !(room.phase === PHASES.ROUND_END && room.winner === 'mrwhite'));
  check('MW reste éliminé', room.trouver(mw.id).alive === false);
}

// ── 6) Victoire des Civils : UC puis MW éliminés (MW se trompe) ────────────
section('Victoire des Civils (UC et MW éliminés)');
{
  const { room, hostId } = creerPartie(5);
  room.demarrer(hostId);
  // éliminer l'undercover
  room.lancerIndices(hostId); passerIndices(room); room.ouvrirVote(hostId);
  const uc = parRole(room, ROLES.UNDERCOVER)[0];
  voterContre(room, uc.id); room.avancerMinuteur();
  check('UC éliminé, partie continue', room.trouver(uc.id).alive === false);
  // éliminer le mister white
  if (room.phase === PHASES.CLUES) { passerIndices(room); room.ouvrirVote(hostId); }
  const mw = parRole(room, ROLES.MRWHITE)[0];
  voterContre(room, mw.id); room.avancerMinuteur();
  if (room.phase === PHASES.MRWHITE_GUESS) room.deviner(mw.id, 'faux');
  check('Civils gagnent', room.phase === PHASES.ROUND_END && room.winner === 'civils');
}

// ── 7) Victoire de l’Undercover : parité ───────────────────────────────────
section('Victoire de l’Undercover (parité)');
{
  // 3 joueurs : 1 civil, 1 UC, 1 MW. On élimine le civil → UC + MW = parité, UC vivant.
  const { room, hostId } = creerPartie(3);
  room.demarrer(hostId);
  room.lancerIndices(hostId); passerIndices(room); room.ouvrirVote(hostId);
  const civ = parRole(room, ROLES.CIVIL)[0];
  voterContre(room, civ.id); room.avancerMinuteur();
  check('Undercover gagne à la parité', room.phase === PHASES.ROUND_END && room.winner === 'undercover');
}

// ── 8) Égalité au vote → second tour ───────────────────────────────────────
section('Égalité au vote déclenche un second tour');
{
  const { room, hostId } = creerPartie(4);
  room.demarrer(hostId);
  room.lancerIndices(hostId); passerIndices(room); room.ouvrirVote(hostId);
  const v = room.vivants;
  // 2 votes chacun pour v[0] et v[1] → égalité.
  room.voter(v[0].id, v[1].id);
  room.voter(v[2].id, v[1].id);
  room.voter(v[1].id, v[0].id);
  room.voter(v[3].id, v[0].id);
  check('phase = voteReveal (annonce égalité)', room.phase === PHASES.VOTE_REVEAL);
  check('égalité détectée', room.voteResult && room.voteResult.egalite === true);
  room.avancerMinuteur();
  check('retour en phase de vote (second tour)', room.phase === PHASES.VOTE);
  check('candidats du second tour définis', Array.isArray(room.voteCandidates) && room.voteCandidates.length === 2);
}

// ── 8b) Vote lancé à la majorité des « prêts à voter » ─────────────────────
section('Vote à la majorité (« prêt à voter »)');
{
  const { room, hostId } = creerPartie(5); // voteReady true par défaut
  room.demarrer(hostId); room.lancerIndices(hostId); passerIndices(room);
  check('après les indices → discussion', room.phase === PHASES.DISCUSSION);
  const vivants = room.vivants;
  room.marquerPretVote(vivants[0].id, true);
  room.marquerPretVote(vivants[1].id, true);
  check('2/5 prêts : pas encore de vote', room.phase === PHASES.DISCUSSION);
  room.marquerPretVote(vivants[2].id, true);
  check('3/5 prêts (>50 %) : le vote se lance', room.phase === PHASES.VOTE);
}
{
  const { room, hostId } = creerPartie(5, { voteReady: false });
  room.demarrer(hostId); room.lancerIndices(hostId); passerIndices(room);
  for (const p of room.vivants) room.marquerPretVote(p.id, true);
  check('option désactivée : « prêt à voter » n’ouvre pas le vote', room.phase === PHASES.DISCUSSION);
}

// ── 8c) Sélection de mots par catégories multiples ─────────────────────────
section('Mots filtrés par catégories choisies');
{
  const f = facettes();
  const deux = f.categories.slice(0, 2);
  let okCat = true;
  for (let i = 0; i < 60; i++) {
    const { room, hostId } = creerPartie(4, { categories: deux });
    room.demarrer(hostId);
    if (!deux.includes(room.secret.category)) okCat = false;
  }
  check(`les mots proviennent bien des catégories choisies (${deux.join(', ')})`, okCat);
}

// ── 9) Manches multiples : rôles redistribués, mots renouvelés, score gardé ─
section('Manches multiples : rotation et score conservé');
{
  const { room, hostId } = creerPartie(6, { rounds: 5 });
  const historique = [];
  const motsUtilises = new Set();
  for (let m = 0; m < 4; m++) {
    if (m === 0) room.demarrer(hostId); else room.mancheSuivante(hostId);
    historique.push(parRole(room, ROLES.UNDERCOVER)[0].id);
    motsUtilises.add(room.secret.key);
    // terminer vite la manche : parité undercover en éliminant les civils
    let garde = 0;
    while (room.phase !== PHASES.ROUND_END && garde++ < 30) {
      if (room.phase === PHASES.REVEAL) room.lancerIndices(hostId);
      else if (room.phase === PHASES.CLUES) passerIndices(room);
      else if (room.phase === PHASES.DISCUSSION) room.ouvrirVote(hostId);
      else if (room.phase === PHASES.VOTE) {
        const civ = room.vivants.find((p) => p.role === ROLES.CIVIL) || room.vivants[0];
        voterContre(room, civ.id);
      } else if (room.phase === PHASES.VOTE_REVEAL) room.avancerMinuteur();
      else if (room.phase === PHASES.MRWHITE_GUESS) room.deviner(room.mrWhite.playerId, 'faux');
    }
  }
  check('4 manches jouées', room.round === 4);
  check('mots renouvelés (paires différentes)', motsUtilises.size === 4);
  const scoreTotal = room.players.reduce((s, p) => s + p.score, 0);
  check('des points ont été attribués', scoreTotal > 0);
  const roundsJoues = room.players.every((p) => p.roundsPlayed === 4);
  check('roundsPlayed = 4 pour tous', roundsJoues);
}

// ── 10) Reconnexion : retrouver son rôle après coupure ─────────────────────
section('Reconnexion');
{
  const { room, sockets, hostId } = creerPartie(5);
  room.demarrer(hostId);
  const cible = sockets[2];
  const p = room.trouver(cible._pid);
  const roleAvant = p.role, motAvant = p.word ?? null, tokenP = p.token;
  room.marquerDeconnecte(p.id);
  check('marqué déconnecté', p.connected === false);
  const ws2 = fakeWs();
  const re = room.reconnecter(tokenP, ws2);
  check('reconnexion réussie', re && re.id === p.id);
  check('même rôle (côté serveur) après reconnexion', re.role === roleAvant);
  room.diffuser();
  const secret = ws2.sent.filter((m) => m.t === 'secret').pop();
  check('le mot est renvoyé à la reconnexion (sans le rôle)', secret && secret.word === motAvant && !('role' in secret));
}

// ── 11) Migration d’hôte ───────────────────────────────────────────────────
section('Migration d’hôte : conservée si l’hôte revient, migrée s’il part');
{
  // Déconnexion brève (rechargement) : l'hôte reste l'hôte.
  const p1 = creerPartie(4);
  p1.room.marquerDeconnecte(p1.hostId);
  check('déconnexion brève : l’hôte est conservé', p1.room.hostId === p1.hostId);

  // Départ volontaire : migration immédiate vers un joueur connecté.
  const p2 = creerPartie(4);
  p2.room.retirer(p2.hostId);
  check('départ volontaire : nouvel hôte désigné', p2.room.hostId && p2.room.hostId !== p2.hostId);
  check('nouvel hôte est connecté', p2.room.trouver(p2.room.hostId).connected === true);
}

// ── 12) Minimum de joueurs ─────────────────────────────────────────────────
section('Refus de démarrer à moins de 3 joueurs');
{
  const { room, hostId } = creerPartie(2);
  const r = room.demarrer(hostId);
  check('démarrage refusé à 2 joueurs', r && r.error);
  check('reste en lobby', room.phase === PHASES.LOBBY);
}

console.log(`\n═══════════════════════════════════════`);
console.log(`  Résultat : ${ok} OK / ${ko} échec(s)`);
console.log(`═══════════════════════════════════════`);
process.exit(ko === 0 ? 0 : 1);
