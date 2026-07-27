// Utilitaires partagés côté serveur.
import { randomUUID, randomInt } from 'node:crypto';

// Envoi WebSocket sûr (ignore les sockets fermées / absentes).
export function safeSend(ws, obj) {
  try {
    if (ws && ws.readyState === 1 /* OPEN */) {
      ws.send(JSON.stringify(obj));
    }
  } catch { /* socket morte : on ignore */ }
}

export function uuid() {
  return randomUUID();
}

// Code de partie : 6 caractères sans ambiguïté (pas de 0/O, 1/I).
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function genererCode(estLibre) {
  for (let essai = 0; essai < 50; essai++) {
    let code = '';
    for (let i = 0; i < 6; i++) code += ALPHABET[randomInt(ALPHABET.length)];
    if (!estLibre || estLibre(code)) return code;
  }
  // Repli très improbable : on rallonge.
  return 'X' + Date.now().toString(36).toUpperCase().slice(-6);
}

// Avatars et couleurs générés automatiquement (identité visuelle par joueur).
const EMOJIS = ['🦊', '🐼', '🦉', '🐙', '🦁', '🐸', '🐺', '🦅', '🐝', '🦋', '🐬', '🦈', '🐢', '🦖', '🦝', '🐯', '🦓', '🦔', '🐨', '🐷', '🦇', '🦂', '🐍', '🦩', '🦜', '🐳', '🦭', '🦡', '🐊', '🦚'];

export function avatarPour(index) {
  return EMOJIS[index % EMOJIS.length];
}

export function couleurPour(index) {
  // Teintes bien réparties, saturation/luminosité constantes → lisible sur fond sombre.
  const hue = (index * 47) % 360;
  return `hsl(${hue} 70% 62%)`;
}

// Normalisation d'un mot pour comparer la réponse de Mister White au mot des Civils.
// Minuscule, sans accents, sans ponctuation/espaces, pluriel simple toléré.
export function normaliserMot(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .replace(/s$/, '');
}

export function melangerTableau(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
