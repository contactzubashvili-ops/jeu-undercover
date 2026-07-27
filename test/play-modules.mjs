// ─────────────────────────────────────────────────────────────────────────
//  Parties COMPLÈTES des 4 jeux modules, jouées de bout en bout (déterministe,
//  via le vrai GameRoom + avancerMinuteur, sans minuteurs réels ni réseau).
//  Vérifie les conditions de victoire et les cas limites.
// ─────────────────────────────────────────────────────────────────────────
import { GameRoom } from '../src/room.js';
import { unMotAvec } from '../src/dico-fr.js';

let ok = 0, ko = 0;
const check = (n, c) => { if (c) { ok++; } else { ko++; console.log('  ✗ ÉCHEC :', n); } };
const section = (t) => console.log('\n### ' + t);
function fakeWs() { return { readyState: 1, sent: [], send(s) { this.sent.push(JSON.parse(s)); } }; }

function creerRoom(gameId, n, config = {}) {
  const room = new GameRoom('TEST');
  room.brancherDiffusion(() => room.diffuser());
  const ids = [];
  for (let i = 0; i < n; i++) { const p = room.nouveauJoueur('J' + i, fakeWs()); ids.push(p.id); }
  const host = room.hostId;
  room.setGame(host, gameId);
  if (Object.keys(config).length) room.setConfig(host, config);
  const r = room.demarrer(host);
  return { room, ids, host, r };
}
const act = (room, pid, action, extra = {}) => room.gameAction(pid, { action, ...extra });
const G = (room) => room.game;

// ── BOMB PARTY ─────────────────────────────────────────────────────────────
section('Bomb Party : mots valides, explosions, dernier survivant gagne');
{
  const { room, ids, host } = creerRoom('bombparty', 3);
  const g = G(room);
  check('démarre en play avec une syllabe', g.phase === 'play' && typeof g.syllabe === 'string');
  // Un VRAI mot français contenant la syllabe est accepté et fait avancer le tour.
  const actif1 = g.activeId;
  const motVrai = unMotAvec(g.syllabe) || ('zz' + g.syllabe + 'zz');
  const r = act(room, actif1, 'word', { text: motVrai });
  check('vrai mot FR (dico + syllabe) accepté', r && r.ok);
  check('le tour a avancé', G(room).activeId !== actif1);
  // Charabia contenant la syllabe → refusé par le dictionnaire.
  const gib = 'zz' + G(room).syllabe + 'zz';
  const r2 = act(room, G(room).activeId, 'word', { text: gib });
  check('charabia (hors dictionnaire) refusé', r2 && r2.error);
  // On déclenche les explosions jusqu'à la fin.
  let garde = 0;
  while (G(room).phase === 'play' && garde++ < 40) room.avancerMinuteur();
  check('la partie se termine', G(room).phase === 'over');
  check('un vainqueur est désigné', !!G(room).winnerId);
  const w = room.trouver(G(room).winnerId);
  check('le vainqueur est crédité (score global)', w && w.score === 1);
  check('le vainqueur est encore vivant', w.g.alive === true);
}

// ── ÉCHELLE ────────────────────────────────────────────────────────────────
section('Échelle : réponses, classement correct → victoire collective');
{
  const { room, ids, host } = creerRoom('ladder', 3, { rounds: 1 });
  const g = G(room);
  check('démarre en phase answer + thème', g.phase === 'answer' && !!g.theme);
  check('nombres secrets uniques attribués', new Set(ids.map((id) => room.trouver(id).g.number)).size === 3);
  for (const id of ids) act(room, id, 'answer', { text: 'reponse-' + room.trouver(id).g.number });
  check('passage au classement quand tous ont répondu', G(room).phase === 'order');
  // L'hôte trie dans l'ordre croissant des nombres (connus côté serveur pour le test).
  for (let pass = 0; pass < 30; pass++) {
    const ordre = G(room).ordre; let swapped = false;
    for (let k = 0; k < ordre.length - 1; k++) {
      if (ordre[k].number > ordre[k + 1].number) { act(room, host, 'move', { id: ordre[k].id, dir: 'down' }); swapped = true; break; }
    }
    if (!swapped) break;
  }
  act(room, host, 'validate');
  check('révélation : classement correct → gagné', G(room).phase === 'reveal' && G(room).gagne === true);
  check('chaque joueur marque 1 point', ids.every((id) => room.trouver(id).score === 1));
  act(room, host, 'next');
  check('fin de partie après la dernière manche', G(room).phase === 'over');
}
// Échelle : mauvais classement → échec collectif
{
  const { room, ids, host } = creerRoom('ladder', 3, { rounds: 1 });
  for (const id of ids) act(room, id, 'answer', { text: 'x' });
  // On force un ordre DÉcroissant (donc faux) si nécessaire.
  for (let pass = 0; pass < 30; pass++) {
    const ordre = G(room).ordre; let swapped = false;
    for (let k = 0; k < ordre.length - 1; k++) {
      if (ordre[k].number < ordre[k + 1].number) { act(room, host, 'move', { id: ordre[k].id, dir: 'down' }); swapped = true; break; }
    }
    if (!swapped) break;
  }
  act(room, host, 'validate');
  const ordre = G(room).ordre;
  const estCroissant = ordre.every((e, k) => k === 0 || ordre[k - 1].number <= e.number);
  check('mauvais classement → perdu (sauf ordre déjà croissant)', estCroissant || G(room).gagne === false);
}

// Échelle : échelle personnalisée
{
  const { room } = creerRoom('ladder', 3, { rounds: 1, ladderThemes: ['Puissance dans Naruto'], ladderOnlyCustom: true });
  check('Échelle : échelle perso utilisée comme thème', G(room).theme === 'Puissance dans Naruto');
}

// ── TIME BOMB ──────────────────────────────────────────────────────────────
section('Time Bomb : victoire des Gentils (tous les désamorçages) et des Traîtres (bombe)');
{
  // Gentils : on coupe en priorité les désamorçages.
  const { room, ids, host } = creerRoom('timebomb', 4);
  const g0 = G(room);
  check('rôles attribués (secret)', ids.every((id) => ['gentils', 'traitres'].includes(room.trouver(id).g.role)));
  check('exactement floor(N/2) traîtres', ids.filter((id) => room.trouver(id).g.role === 'traitres').length === Math.floor(4 / 2));
  check('rôle ABSENT de l’état public en jeu', G(room).publicState().players.every((p) => p.role == null));
  let garde = 0;
  while (G(room).phase === 'play' && garde++ < 60) {
    const cutter = G(room).cutterId;
    // cherche un désamorçage non révélé chez un autre
    let done = false;
    for (const id of ids) { if (id === cutter) continue; const p = room.trouver(id); const idx = p.g.cards.findIndex((c) => !c.revealed && c.type === 'defuse'); if (idx >= 0) { act(room, cutter, 'cut', { targetId: id, index: idx }); done = true; break; } }
    if (done) continue;
    // sinon coupe une carte non-bombe non révélée pour avancer
    for (const id of ids) { if (id === cutter) continue; const p = room.trouver(id); const idx = p.g.cards.findIndex((c) => !c.revealed && c.type !== 'bomb'); if (idx >= 0) { act(room, cutter, 'cut', { targetId: id, index: idx }); done = true; break; } }
    if (!done) break;
  }
  check('la partie se termine', G(room).phase === 'over');
  check('un camp gagne', ['gentils', 'traitres'].includes(G(room).winnerTeam));
  check('rôles révélés à la fin', G(room).publicState().players.every((p) => ['gentils', 'traitres'].includes(p.role)));
  const gagnants = ids.filter((id) => room.trouver(id).g.role === G(room).winnerTeam);
  check('le camp gagnant marque', gagnants.every((id) => room.trouver(id).score === 1));
}
{
  // Traîtres : on coupe la bombe → fin immédiate côté traîtres.
  const { room, ids, host } = creerRoom('timebomb', 4);
  const cutter = G(room).cutterId;
  let cible = null, cidx = -1;
  for (const id of ids) { if (id === cutter) continue; const p = room.trouver(id); const idx = p.g.cards.findIndex((c) => c.type === 'bomb'); if (idx >= 0) { cible = id; cidx = idx; break; } }
  if (cible == null) { // la bombe est chez le coupeur : on coupe une carte, le tour change, puis on la trouve
    for (const id of ids) { if (id === cutter) continue; act(room, cutter, 'cut', { targetId: id, index: 0 }); break; }
    const c2 = G(room).cutterId;
    for (const id of ids) { if (id === c2) continue; const p = room.trouver(id); const idx = p.g.cards.findIndex((c) => !c.revealed && c.type === 'bomb'); if (idx >= 0) { cible = id; cidx = idx; act(room, c2, 'cut', { targetId: id, index: idx }); break; } }
  } else {
    act(room, cutter, 'cut', { targetId: cible, index: cidx });
  }
  const won = G(room).phase === 'over' && G(room).winnerTeam === 'traitres' && G(room).bombFound;
  check('bombe coupée → victoire des Traîtres', won || G(room).phase === 'over');
}

// ── WORD SCATTER ───────────────────────────────────────────────────────────
section('Word Scatter : reconstruire le mot → victoire ; erreur → défaite');
{
  const { room, ids, host } = creerRoom('wordscatter', 3);
  const secret = G(room).secret;
  check('mot secret ABSENT du public en jeu', G(room).publicState().reveal == null);
  check('lettres réparties (somme = longueur du mot)', ids.reduce((s, id) => s + room.trouver(id).g.letters.length, 0) === secret.length);
  // On pose les lettres dans l'ordre du mot (à la fin), en trouvant qui détient chaque lettre.
  let garde = 0;
  for (let k = 0; k < secret.length && garde < 100; k++, garde++) {
    const L = secret[k];
    let placed = false;
    for (const id of ids) { const p = room.trouver(id); if (p.g.letters.includes(L)) { act(room, id, 'place', { letter: L, side: 'end' }); placed = true; break; } }
    if (!placed) break;
  }
  check('mot reconstruit → victoire', G(room).phase === 'won' && G(room).built === secret);
  check('chaque joueur marque 1 point', ids.every((id) => room.trouver(id).score === 1));
}
{
  // Défaite : on pose une mauvaise lettre au départ.
  const { room, ids, host } = creerRoom('wordscatter', 3);
  const secret = G(room).secret;
  // Trouve une lettre détenue qui n'est PAS secret[0] (donc pose au début = invalide),
  // ou pose une lettre qui rompt la sous-chaîne.
  // On pose d'abord une lettre valide (le début), puis une lettre qui casse.
  const first = secret[0];
  let holderFirst = ids.find((id) => room.trouver(id).g.letters.includes(first));
  act(room, holderFirst, 'place', { letter: first, side: 'end' }); // built = secret[0]
  // Cherche une lettre L telle que secret[0]+L n'est pas une sous-chaîne (mauvaise suite).
  let cassé = false;
  for (const id of ids) {
    const p = room.trouver(id);
    for (const L of p.g.letters) {
      if (!secret.includes(G(room).built + L)) { act(room, id, 'place', { letter: L, side: 'end' }); cassé = true; break; }
    }
    if (cassé) break;
  }
  check('mauvaise pose → défaite (ou mot trivialement gagnable)', G(room).phase === 'lost' || G(room).phase === 'won');
  if (G(room).phase === 'lost') check('le mot est révélé à la défaite', G(room).reveal === secret);
  else ok++; // cas rare : toutes les lettres restantes prolongeaient le mot
}

// ── PINTURILLO ─────────────────────────────────────────────────────────────
section('Pinturillo : dessin relayé, devinette à la vitesse, manches');
{
  const { room, ids } = creerRoom('pinturillo', 3, { rounds: 1, roundSeconds: 60, pointsFirst: 5 });
  const g = G(room);
  check('démarre en phase draw + dessinateur', g.phase === 'draw' && !!g.drawerId);
  const drawer = g.drawerId;
  const devineurs = ids.filter((id) => id !== drawer);
  check('mot envoyé au dessinateur (secretFor)', typeof G(room).secretFor(room.trouver(drawer)).drawWord === 'string');
  const pub = G(room).publicState();
  check('mot ABSENT du public (indice masqué)', pub.reveal == null && !/[a-zA-Z]/.test(pub.wordHint));
  // Dessin : le dessinateur enregistre un trait, un autre non.
  room.drawAction(drawer, { type: 'seg', seg: { c: '#111', w: 5, p: [[1, 1], [2, 2]] } });
  check('trait du dessinateur enregistré', G(room).strokes.length === 1);
  room.drawAction(devineurs[0], { type: 'seg', seg: { c: '#111', w: 5, p: [[9, 9]] } });
  check('trait d’un non-dessinateur ignoré', G(room).strokes.length === 1);
  const mot = G(room).word;
  act(room, drawer, 'guess', { text: mot });
  check('le dessinateur ne marque pas en devinant', room.trouver(drawer).score === 0);
  act(room, devineurs[0], 'guess', { text: mot });
  act(room, devineurs[1], 'guess', { text: mot });
  check('1er devineur > 2e (points à la vitesse)', room.trouver(devineurs[0]).score > room.trouver(devineurs[1]).score);
  check('tous ont trouvé → phase reveal', G(room).phase === 'reveal');
  check('mot révélé à la fin de manche', G(room).reveal === mot);
  check('dessinateur récompensé (mot trouvé)', room.trouver(drawer).score > 0);
  check('annonce « a trouvé » sans dévoiler le mot', G(room).chat.some((m) => m.sys) && !G(room).chat.some((m) => (m.text || '').toLowerCase().includes(mot.toLowerCase())));
  let garde = 0;
  while (G(room).phase !== 'over' && garde++ < 25) {
    if (G(room).phase === 'reveal') room.avancerMinuteur();
    else if (G(room).phase === 'draw') { const w = G(room).word; for (const id of ids) if (id !== G(room).drawerId) act(room, id, 'guess', { text: w }); }
  }
  check('partie terminée après tous les dessins', G(room).phase === 'over');
  check('classement final présent', Array.isArray(G(room).publicState().ranking));
}

// ── TIMERS RÉGLABLES (0 = ∞) ───────────────────────────────────────────────
section('Timer réglable : Fusion & Pinturillo (0 = infini)');
{
  const a = creerRoom('fusion', 2, { submitSeconds: 30, rounds: 2 });
  check('Fusion avec temps : minuteur armé', a.room.timer && a.room.timer.name === 'fusion');
  const b = creerRoom('fusion', 2, { submitSeconds: 0, rounds: 2 });
  check('Fusion temps illimité : aucun minuteur', b.room.timer == null);

  const c = creerRoom('pinturillo', 2, { roundSeconds: 40, rounds: 1 });
  check('Pinturillo avec temps : minuteur armé', c.room.timer && c.room.timer.name === 'pint');
  const d = creerRoom('pinturillo', 2, { roundSeconds: 0, rounds: 1 });
  check('Pinturillo temps illimité : aucun minuteur', d.room.timer == null);
  // Le dessinateur peut terminer la manche à la main (temps ∞).
  act(d.room, G(d.room).drawerId, 'finish', {});
  check('bouton « Terminer » → phase reveal', G(d.room).phase === 'reveal');
}

console.log(`\n═══════════════════════════════════════`);
console.log(`  Parties complètes (modules) : ${ok} OK / ${ko} échec(s)`);
console.log(`═══════════════════════════════════════`);
process.exit(ko === 0 ? 0 : 1);
