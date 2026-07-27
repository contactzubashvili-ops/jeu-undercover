// Dictionnaire français (paquet « an-array-of-french-words ») pour valider les
// mots de Bomb Party. Comparaison insensible aux accents. Si le dico est absent,
// on reste tolérant (motValide renvoie true) — le jeu marche quand même.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function normDic(w) {
  return String(w || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');
}

let SET = null;
let LIST = null;
try {
  const path = require.resolve('an-array-of-french-words');
  LIST = JSON.parse(readFileSync(path, 'utf8'));
  SET = new Set();
  for (const w of LIST) SET.add(normDic(w));
} catch (e) {
  console.warn('[dico-fr] indisponible, validation tolérante :', e.message);
}

export function dicoDisponible() { return !!SET; }
export function tailleDico() { return SET ? SET.size : 0; }
export function motValide(mot) {
  if (!SET) return true;        // dico absent → on ne bloque pas
  return SET.has(normDic(mot));
}

// Un vrai mot français contenant la syllabe (indice / tests). null si aucun.
export function unMotAvec(syllabe) {
  if (!LIST) return null;
  const n = normDic(syllabe);
  if (!n) return null;
  const start = Math.floor(Math.random() * LIST.length);
  for (let i = 0; i < LIST.length; i++) {
    const w = LIST[(start + i) % LIST.length];
    const nw = normDic(w);
    if (nw.length >= 3 && nw.includes(n)) return w;
  }
  return null;
}
