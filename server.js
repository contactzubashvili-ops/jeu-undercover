// ─────────────────────────────────────────────────────────────────────────
//  Serveur Undercover — HTTP (fichiers statiques + petite API) + WebSocket.
//  Le serveur est l'AUTORITÉ : il détient les parties, les rôles et les mots.
//  Lancer :  npm start   (ou  node server.js)
// ─────────────────────────────────────────────────────────────────────────
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize } from 'node:path';
import { networkInterfaces } from 'node:os';
import { WebSocketServer } from 'ws';

import { GameRoom, PHASES } from './src/room.js';
import { genererCode, safeSend } from './src/util.js';
import { facettes } from './src/words.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(__dirname, 'public');
const PORT = process.env.PORT || 3000;

// ── Hub des parties ────────────────────────────────────────────────────────
const rooms = new Map(); // code -> GameRoom
const EMPTY_TTL = 15 * 60 * 1000;   // partie sans aucun connecté : purge après 15 min
const LOBBY_GRACE = 45 * 1000;      // en lobby : retrait d'un déconnecté après 45 s
const HOST_GRACE = 25 * 1000;       // migration d'hôte seulement s'il ne revient pas sous 25 s

function creerRoom() {
  const code = genererCode((c) => !rooms.has(c));
  const room = new GameRoom(code);
  room.brancherDiffusion(() => room.diffuser());
  room.lastActivity = Date.now();
  rooms.set(code, room);
  return room;
}

function purger() {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const connectes = room.connectes.length;
    if (connectes === 0 && now - (room.lastActivity || room.createdAt) > EMPTY_TTL) {
      rooms.delete(code);
    }
  }
}
setInterval(purger, 30 * 1000).unref?.();

// ── Fichiers statiques ─────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

async function servirStatique(req, res) {
  let url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/') url = '/index.html';

  // API légère.
  if (url === '/api/facettes') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(facettes()));
    return;
  }
  if (url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }

  // Anti-traversée de répertoire.
  const chemin = normalize(join(PUBLIC, url));
  if (!chemin.startsWith(PUBLIC)) { res.writeHead(403); res.end('Interdit'); return; }
  if (!existsSync(chemin)) {
    // SPA : tout chemin inconnu renvoie l'app (permet /rejoindre, liens…).
    return servirFichier(join(PUBLIC, 'index.html'), res);
  }
  return servirFichier(chemin, res);
}

async function servirFichier(chemin, res) {
  try {
    const data = await readFile(chemin);
    const type = MIME[extname(chemin)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Introuvable');
  }
}

const server = http.createServer(servirStatique);

// ── WebSocket ──────────────────────────────────────────────────────────────
const wss = new WebSocketServer({ server });

function envoyer(ws, obj) { safeSend(ws, obj); }
function erreur(ws, message) { safeSend(ws, { t: 'error', message }); }

function attacher(ws, room, player) {
  ws._roomCode = room.code;
  ws._playerId = player.id;
  room.lastActivity = Date.now();
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (buf) => {
    let msg;
    try { msg = JSON.parse(buf.toString()); } catch { return; }
    if (!msg || typeof msg.t !== 'string') return;
    try { router(ws, msg); } catch (e) { erreur(ws, 'Erreur serveur : ' + e.message); }
  });

  ws.on('close', () => {
    const room = rooms.get(ws._roomCode);
    if (!room) return;
    const pid = ws._playerId;
    const p = room.trouver(pid);
    if (!p || p.socket !== ws) return; // socket déjà remplacée par une reconnexion
    const etaitHote = room.hostId === pid;
    room.marquerDeconnecte(pid);
    room.lastActivity = Date.now();
    // En lobby, on retire le joueur après un délai de grâce (gère les refresh).
    if (room.phase === PHASES.LOBBY) {
      setTimeout(() => {
        const cur = room.trouver(pid);
        if (cur && !cur.connected && room.phase === PHASES.LOBBY) {
          room.retirer(pid);
          if (rooms.has(room.code)) room.diffuser();
        }
      }, LOBBY_GRACE).unref?.();
    }
    // Migration d'hôte différée : seulement si l'hôte ne s'est pas reconnecté.
    if (etaitHote) {
      setTimeout(() => {
        const cur = room.trouver(pid);
        if (rooms.has(room.code) && room.hostId === pid && (!cur || !cur.connected)) {
          room._migrerHote();
          room.diffuser();
        }
      }, HOST_GRACE).unref?.();
    }
    room.diffuser();
  });
});

function router(ws, msg) {
  const t = msg.t;

  // — Création / connexion (ne nécessitent pas d'être déjà dans une partie) —
  if (t === 'create') {
    const room = creerRoom();
    const player = room.nouveauJoueur(msg.name, ws);
    if (msg.config) room.setConfig(player.id, msg.config);
    attacher(ws, room, player);
    envoyer(ws, { t: 'joined', code: room.code, playerId: player.id, token: player.token });
    room.diffuser();
    return;
  }

  if (t === 'join') {
    const code = String(msg.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const room = rooms.get(code);
    if (!room) return erreur(ws, "Cette partie n'existe pas (vérifiez le code).");
    if (room.phase !== PHASES.LOBBY) return erreur(ws, 'Cette partie a déjà commencé.');
    if (room.players.length >= 20) return erreur(ws, 'Cette partie est complète (20 joueurs max).');
    const nom = room.nomDisponible(msg.name);
    const player = room.nouveauJoueur(nom, ws);
    attacher(ws, room, player);
    envoyer(ws, { t: 'joined', code: room.code, playerId: player.id, token: player.token });
    room.diffuser();
    return;
  }

  if (t === 'reconnect') {
    const code = String(msg.code || '').toUpperCase();
    const room = rooms.get(code);
    if (!room) return erreur(ws, 'expired'); // le client effacera ses identifiants
    const player = room.reconnecter(msg.token, ws);
    if (!player) return erreur(ws, 'expired');
    attacher(ws, room, player);
    envoyer(ws, { t: 'joined', code: room.code, playerId: player.id, token: player.token });
    room.diffuser();
    return;
  }

  // — Actions nécessitant une partie + un joueur attaché —
  const room = rooms.get(ws._roomCode);
  if (!room) return erreur(ws, 'expired');
  const pid = ws._playerId;
  const player = room.trouver(pid);
  if (!player) return erreur(ws, 'expired');
  room.lastActivity = Date.now();

  let r;
  switch (t) {
    case 'ready': room.setReady(pid, msg.value); break;
    case 'avatar': room.setAvatar(pid, msg.avatar); break;
    case 'selectGame': room.setGame(pid, msg.gameId); break;
    case 'config': room.setConfig(pid, msg.patch || {}); break;
    case 'kick': room.kick(pid, msg.targetId); break;
    case 'start': r = room.demarrer(pid); break;
    case 'startClues': room.lancerIndices(pid); break;
    case 'clue': r = room.soumettreIndice(pid, msg.text); break;
    case 'passClue': room.passerIndice(pid); break;
    case 'voteReady': room.marquerPretVote(pid, msg.value); break;
    case 'openVote': room.ouvrirVote(pid); break;
    case 'vote': r = room.voter(pid, msg.targetId); break;
    case 'guess': r = room.deviner(pid, msg.text); break;
    case 'emote': room.emote(pid, msg.emoji, msg.img); return; // transitoire : pas de diffusion d'état
    case 'draw': room.drawAction(pid, msg); return;            // dessin en direct (Pinturillo)
    case 'game': r = room.gameAction(pid, msg); break;
    case 'nextRound': r = room.mancheSuivante(pid); break;
    case 'endGame': room.terminerPartie(pid); break;
    case 'backToLobby': room.retourLobby(pid); break;
    case 'leave':
      room.retirer(pid);
      ws._roomCode = null; ws._playerId = null;
      if (rooms.has(room.code)) room.diffuser();
      return;
    default: return;
  }
  if (r && r.error) erreur(ws, r.error);
  room.diffuser();
}

// Battement de cœur : coupe les sockets mortes.
const battement = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) { try { ws.terminate(); } catch {} continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch {}
  }
}, 30 * 1000);
battement.unref?.();

// ── Démarrage + affichage des URLs (dont l'IP locale pour les mobiles) ──────
function ipsLocales() {
  const out = [];
  for (const [, addrs] of Object.entries(networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family === 'IPv4' && !a.internal) out.push(a.address);
    }
  }
  return out;
}

server.listen(PORT, () => {
  const ips = ipsLocales();
  console.log('\n  🕵️  UNDERCOVER — serveur démarré');
  console.log('  ───────────────────────────────');
  console.log(`  Sur cet ordinateur : http://localhost:${PORT}`);
  for (const ip of ips) console.log(`  Sur le réseau local : http://${ip}:${PORT}   ← pour les téléphones/tablettes du même Wi-Fi`);
  console.log('\n  Pour jouer en ligne (hors du Wi-Fi), déployez ce dossier sur un hébergeur Node (Render, Railway, Fly.io…).\n');
});
