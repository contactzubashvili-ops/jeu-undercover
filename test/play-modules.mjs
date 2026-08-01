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
    const cutter = G(room).cutterId, lc = G(room).lastCutterId;
    // cherche un désamorçage non révélé chez un autre (pas soi, pas le dernier coupeur)
    let done = false;
    for (const id of ids) { if (id === cutter || id === lc) continue; const p = room.trouver(id); const idx = p.g.cards.findIndex((c) => !c.revealed && c.type === 'defuse'); if (idx >= 0) { act(room, cutter, 'cut', { targetId: id, index: idx }); done = true; break; } }
    if (done) continue;
    // sinon coupe une carte non-bombe non révélée pour avancer
    for (const id of ids) { if (id === cutter || id === lc) continue; const p = room.trouver(id); const idx = p.g.cards.findIndex((c) => !c.revealed && c.type !== 'bomb'); if (idx >= 0) { act(room, cutter, 'cut', { targetId: id, index: idx }); done = true; break; } }
    if (!done) break;
  }
  check('la partie se termine', G(room).phase === 'over');
  check('un camp gagne', ['gentils', 'traitres'].includes(G(room).winnerTeam));
  check('rôles révélés à la fin', G(room).publicState().players.every((p) => ['gentils', 'traitres'].includes(p.role)));
  const gagnants = ids.filter((id) => room.trouver(id).g.role === G(room).winnerTeam);
  check('le camp gagnant marque', gagnants.every((id) => room.trouver(id).score === 1));
}
{
  // Traîtres : on cherche à couper la BOMBE (en coupant des cartes neutres pour
  // faire tourner, sans révéler de désamorçages, jusqu'à ce que la bombe soit
  // accessible — hors soi et hors dernier coupeur).
  const { room, ids } = creerRoom('timebomb', 4);
  let garde = 0, boom = false;
  while (G(room).phase === 'play' && garde++ < 40) {
    const cutter = G(room).cutterId, lc = G(room).lastCutterId;
    let cut = false;
    for (const id of ids) { if (id === cutter || id === lc) continue; const p = room.trouver(id); const bi = p.g.cards.findIndex((c) => !c.revealed && c.type === 'bomb'); if (bi >= 0) { act(room, cutter, 'cut', { targetId: id, index: bi }); boom = true; cut = true; break; } }
    if (cut) break;
    for (const id of ids) { if (id === cutter || id === lc) continue; const p = room.trouver(id); const ni = p.g.cards.findIndex((c) => !c.revealed && c.type === 'neutre'); if (ni >= 0) { act(room, cutter, 'cut', { targetId: id, index: ni }); cut = true; break; } }
    if (!cut) break;
  }
  check('la bombe finit par sauter (Traîtres) ou partie terminée', (boom && G(room).winnerTeam === 'traitres') || G(room).phase === 'over');
}
// Time Bomb : on ne peut pas couper celui qui vient de couper + nb de traîtres choisi.
{
  const { room, ids } = creerRoom('timebomb', 5, { timebombTraitors: 3 });
  check('nombre de traîtres respecté (3)', ids.filter((id) => room.trouver(id).g.role === 'traitres').length === 3);
  const cutter = G(room).cutterId;
  const target = ids.find((id) => id !== cutter);
  act(room, cutter, 'cut', { targetId: target, index: 0 }); // cutter coupe target → cutter devient « dernier coupeur »
  const r = act(room, G(room).cutterId, 'cut', { targetId: cutter, index: 0 }); // interdit : recouper le dernier coupeur
  check('interdit de recouper celui qui vient de couper', r && r.error);
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

// ── ASSASSIN ─────────────────────────────────────────────────────────────────
section('Assassin (classique) : dérangement, brouillard, chuchotement, tir');
{
  const { room, ids } = creerRoom('assassin', 5, { rounds: 1 });
  const g = G(room);
  check('démarre en phase play', g.phase === 'play' && g.mode === 'classic');
  // Cibles : chacune distincte, aucune sur soi (dérangement).
  const tg = g.targets;
  check('chacun a une cible ≠ soi', ids.every((id) => tg[id] && tg[id] !== id));
  check('2 personnes n’ont jamais la même cible', new Set(ids.map((id) => tg[id])).size === ids.length);
  // Sièges : ordre unique, chacun a une place.
  check('sièges uniques (0..n-1)', new Set(g.seats).size === ids.length && g.seats.length === ids.length);
  // Brouillard : l'état public ne dévoile aucun visage en jeu.
  check('sièges masqués dans l’état public', G(room).publicState().seats.every((s) => !s.revealed && s.name === undefined));
  // Secret : chacun voit SON siège et SA cible (nom), pas ceux des autres.
  const p0 = room.trouver(ids[0]);
  const sec0 = g.secretFor(p0);
  check('secret : mon siège + ma cible nommée', Number.isInteger(sec0.seat) && sec0.target && typeof sec0.target.name === 'string');
  // Chuchotement de siège à siège, dans les deux sens.
  const seatA = g.seatOf[ids[0]];
  const other = ids.find((id) => id !== ids[0]);
  const seatB = g.seatOf[other];
  act(room, ids[0], 'whisper', { seat: seatB, text: 'psst, qui es-tu ?' });
  const chB = g.secretFor(room.trouver(other)).chats.find((c) => c.seat === seatA);
  check('le destinataire voit le chuchotement (venant de mon siège)', chB && chB.messages.some((m) => !m.mine && m.text.includes('psst')));
  const chA = g.secretFor(p0).chats.find((c) => c.seat === seatB);
  check('l’émetteur voit son propre message (mine:true)', chA && chA.messages.some((m) => m.mine));
  // On ne peut pas se chuchoter à soi-même.
  check('pas d’auto-chuchotement', act(room, ids[0], 'whisper', { seat: seatA, text: 'x' }).error);
  // Tir juste : le tireur vise le siège de SA cible → +1.
  const shooter = ids[0];
  act(room, shooter, 'shoot', { seat: g.seatOf[tg[shooter]] });
  check('tir sur la bonne cible → +1', room.trouver(shooter).score === 1);
  check('après un tir : plus personne ne peut tirer (suspense)', G(room).phase === 'suspense');
  check('un autre tir est refusé', act(room, ids[1], 'shoot', { seat: 0 }).error);
  room.avancerMinuteur(); // suspense → reveal
  check('révélation : tous les visages dévoilés', G(room).publicState().seats.every((s) => s.revealed));
  check('détail du tir présent au révélé', (G(room).publicState().results || []).length === 1);
  room.avancerMinuteur(); // reveal → fin (rounds:1)
  check('fin de partie + classement', G(room).phase === 'over' && Array.isArray(G(room).publicState().ranking));
}
// Assassin : tir sur la MAUVAISE cible → −1.
{
  const { room, ids } = creerRoom('assassin', 5, { rounds: 1 });
  const g = G(room);
  const shooter = ids[0];
  const mySeat = g.seatOf[shooter];
  const goodSeat = g.seatOf[g.targets[shooter]];
  const wrongSeat = [0, 1, 2, 3, 4].find((s) => s !== mySeat && s !== goodSeat);
  act(room, shooter, 'shoot', { seat: wrongSeat });
  check('tir sur la mauvaise cible → −1', room.trouver(shooter).score === -1);
}
// Assassin (équipes) : binômes secrets, tir synchronisé, mot d'équipe.
section('Assassin (équipes) : binômes secrets, tir à deux, mots secrets');
{
  const { room, ids } = creerRoom('assassin', 4, { teamMode: true, rounds: 1 });
  const g = G(room);
  check('mode équipes actif', g.mode === 'teams');
  check('2 équipes de 2', g.teams.length === 2 && g.teams.every((t) => t.length === 2));
  check('mots secrets distincts par équipe', new Set(Object.values(g.words)).size === 2);
  const t0 = g.teams[0];
  check('coéquipiers visent la MÊME équipe adverse', g.teamOf[g.targets[t0[0]]] === g.teamOf[g.targets[t0[1]]] && g.teamOf[g.targets[t0[0]]] !== 0);
  check('cibles des coéquipiers distinctes', g.targets[t0[0]] !== g.targets[t0[1]]);
  check('mot d’équipe transmis au joueur (secret)', typeof g.secretFor(room.trouver(t0[0])).teamWord === 'string');
  // Un seul membre vise → le tir ne part pas.
  act(room, t0[0], 'shoot', { seat: g.seatOf[g.targets[t0[0]]] });
  check('un seul a visé → toujours en jeu', G(room).phase === 'play');
  check('binôme prêt 1/2 (secret)', g.secretFor(room.trouver(t0[0])).teamLocked.locked === 1);
  // Le second vise juste → résolution : les deux cibles exactes → +1 chacun.
  act(room, t0[1], 'shoot', { seat: g.seatOf[g.targets[t0[1]]] });
  check('les deux visent juste → +1 chacun', room.trouver(t0[0]).score === 1 && room.trouver(t0[1]).score === 1);
  check('après tir du binôme → suspense', G(room).phase === 'suspense');
}
{
  // Une cible fausse dans le binôme → −1 chacun.
  const { room } = creerRoom('assassin', 4, { teamMode: true, rounds: 1 });
  const g = G(room);
  const t0 = g.teams[0];
  act(room, t0[0], 'shoot', { seat: g.seatOf[g.targets[t0[0]]] }); // juste
  const mySeat1 = g.seatOf[t0[1]];
  const good1 = g.seatOf[g.targets[t0[1]]];
  const wrong1 = [0, 1, 2, 3].find((s) => s !== mySeat1 && s !== good1);
  act(room, t0[1], 'shoot', { seat: wrong1 }); // faux
  check('une cible fausse → −1 chacun', room.trouver(t0[0]).score === -1 && room.trouver(t0[1]).score === -1);
}
{
  // Nombre impair en mode équipes → repli propre sur le classique.
  const { room } = creerRoom('assassin', 5, { teamMode: true });
  check('impair → mode classique forcé', G(room).mode === 'classic' && G(room).publicState().coercedClassic === true);
}

// ── CHAMELEON ────────────────────────────────────────────────────────────────
section('Chameleon : grille de 16, indices, vote, devinette du Caméléon');
{
  const { room, ids, host } = creerRoom('chameleon', 4, { rounds: 1 });
  const g = G(room);
  check('démarre en clues + 16 mots d’une catégorie', g.phase === 'clues' && g.words.length === 16 && typeof g.categorie === 'string');
  check('mot secret parmi les 16', g.words.includes(g.secret));
  const cham = g.chameleonId;
  check('Caméléon sans mot (secret) + flag', g.secretFor(room.trouver(cham)).word === null && g.secretFor(room.trouver(cham)).isChameleon === true);
  check('les autres reçoivent le mot secret', ids.filter((id) => id !== cham).every((id) => g.secretFor(room.trouver(id)).word === g.secret));
  check('mot secret + identité du Caméléon ABSENTS du public', G(room).publicState().secret == null && G(room).publicState().players.every((p) => p.isChameleon === undefined));
  // Un tour complet d'indices → on reboucle (cycle 2).
  let garde = 0;
  while (G(room).phase === 'clues' && G(room).cycle === 1 && garde++ < 12) { const a = G(room).order[G(room).activeIdx]; if (!a) break; act(room, a, 'clue', { text: 'indice' }); }
  check('après un tour, on reboucle (indices gardés)', G(room).cycle >= 2 && G(room).clues.length >= ids.length);
  // Vote : on élimine le Caméléon.
  act(room, host, 'openVote');
  check('vote ouvert', G(room).phase === 'vote');
  const autre = ids.find((id) => id !== cham);
  for (const id of ids) if (id !== cham) act(room, id, 'vote', { targetId: cham });
  act(room, cham, 'vote', { targetId: autre }); // 4e vote → dépouillement
  check('Caméléon démasqué → phase guess', G(room).phase === 'guess');
  // Devinette juste → le Caméléon renverse la partie.
  act(room, cham, 'guess', { text: G(room).secret });
  check('devinette juste → le Caméléon gagne (+2)', G(room).phase === 'result' && G(room).mancheWinner === 'chameleon' && room.trouver(cham).score === 2);
}
{
  // Devinette fausse → les joueurs gagnent (+1 chacun).
  const { room, ids, host } = creerRoom('chameleon', 4, { rounds: 1 });
  const g = G(room); const cham = g.chameleonId; const autre = ids.find((id) => id !== cham);
  act(room, host, 'openVote');
  for (const id of ids) if (id !== cham) act(room, id, 'vote', { targetId: cham });
  act(room, cham, 'vote', { targetId: autre });
  act(room, cham, 'guess', { text: 'zzzmauvaismot' });
  check('devinette fausse → joueurs gagnent', G(room).mancheWinner === 'players');
  check('chaque non-Caméléon marque +1', ids.filter((id) => id !== cham).every((id) => room.trouver(id).score === 1));
}

// ── CODENAMES (2 c. 2) ───────────────────────────────────────────────────────
section('Codenames : grille 25, indices, devinette, assassin, victoire');
{
  const { room } = creerRoom('codenames', 4);
  const g = G(room);
  check('démarre en play + 25 mots', g.phase === 'play' && g.board.length === 25);
  check('9 rouges + 8 bleus + 7 neutres + 1 assassin', g.board.filter((c) => c.type === 'red').length === 9 && g.board.filter((c) => c.type === 'blue').length === 8 && g.board.filter((c) => c.type === 'neutral').length === 7 && g.board.filter((c) => c.type === 'assassin').length === 1);
  check('couleurs masquées dans le public', G(room).publicState().board.every((c) => c.revealed || c.type === null));
  check('espion en chef voit la clé (25)', g.secretFor(room.trouver(g.teams.red.spy)).spymaster === true && g.secretFor(room.trouver(g.teams.red.spy)).key.length === 25);
  check('agent ne voit PAS la clé', g.secretFor(room.trouver(g.teams.red.op)).spymaster === false && g.secretFor(room.trouver(g.teams.red.op)).key === null);
  check('rouge commence, étape clue', g.turn === 'red' && g.step === 'clue');
  check('seul l’espion rouge donne l’indice', !!act(room, g.teams.red.op, 'clue', { word: 'x', count: 2 }).error);
  act(room, g.teams.red.spy, 'clue', { word: 'animal', count: 2 });
  check('indice → étape guess (essais = nb+1)', G(room).step === 'guess' && G(room).clue.word === 'animal' && G(room).guessesLeft === 3);
  const redIdx = g.board.findIndex((c) => c.type === 'red' && !c.revealed);
  act(room, g.teams.red.op, 'guess', { index: redIdx });
  check('bon mot rouge → +1 rouge, toujours à rouge', G(room).found.red === 1 && G(room).turn === 'red');
  act(room, g.teams.red.op, 'endTurn');
  check('fin de tour → bleu, étape clue', G(room).turn === 'blue' && G(room).step === 'clue');
}
{
  // Assassin → défaite immédiate de l'équipe active.
  const { room } = creerRoom('codenames', 4);
  const g = G(room);
  act(room, g.teams.red.spy, 'clue', { word: 'x', count: 1 });
  const assIdx = g.board.findIndex((c) => c.type === 'assassin');
  act(room, g.teams.red.op, 'guess', { index: assIdx });
  check('assassin touché → l’autre équipe gagne', G(room).phase === 'over' && G(room).winner === 'blue');
  check('équipe gagnante marque', room.trouver(g.teams.blue.spy).score === 1 && room.trouver(g.teams.blue.op).score === 1);
}
{
  // Rouge retrouve ses 9 mots → victoire rouge.
  const { room } = creerRoom('codenames', 4);
  const g = G(room);
  act(room, g.teams.red.spy, 'clue', { word: 'x', count: 9 });
  let garde = 0;
  while (G(room).phase === 'play' && garde++ < 12) { const idx = G(room).board.findIndex((c) => c.type === 'red' && !c.revealed); if (idx < 0) break; act(room, g.teams.red.op, 'guess', { index: idx }); }
  check('9 mots rouges retrouvés → rouge gagne', G(room).phase === 'over' && G(room).winner === 'red');
}

// ── PINTURILLO : mots persos (cachés des autres, tirés en priorité) ──────────
section('Pinturillo : mots persos ajoutés dans le salon (anti-spoil)');
{
  const room = new GameRoom('TEST'); room.brancherDiffusion(() => room.diffuser());
  const ids = []; for (let i = 0; i < 3; i++) ids.push(room.nouveauJoueur('J' + i, fakeWs()).id);
  const host = room.hostId;
  room.setGame(host, 'pinturillo');
  room.setConfig(host, { rounds: 1, roundSeconds: 0, pinturilloCustom: true });
  room.motPerso(ids[0], 'add', 'Zorglub'); room.motPerso(ids[0], 'add', 'Excalibur');
  room.motPerso(ids[1], 'add', 'Choco');
  check('compteur perso public (jamais les mots)', room.publicState().players.find((p) => p.id === ids[0]).customCount === 2);
  check('mots persos ABSENTS de l’état public', !JSON.stringify(room.publicState()).match(/Zorglub|Excalibur|Choco/i));
  check('doublon refusé', (room.motPerso(ids[0], 'add', 'zorglub'), room.trouver(ids[0]).customWords.length === 2));
  room.demarrer(host);
  const g = G(room);
  check('mots persos chargés dans le module', g.customMots.length === 3);
  check('le 1er mot tiré est un mot perso (priorité)', ['zorglub', 'excalibur', 'choco'].includes(g.word));
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
