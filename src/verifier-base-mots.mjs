// Contrôle de la base de mots : nombre, facettes, règles (civil != undercover…).
import { BASE, facettes, normaliserPaire } from './words.js';

let erreurs = 0;
for (const p of BASE) {
  if (!normaliserPaire(p)) { erreurs++; console.log('  ✗ paire invalide :', JSON.stringify(p)); }
}

const f = facettes();
console.log('Base de mots Undercover');
console.log('───────────────────────');
console.log('Paires valides :', f.total);
console.log('Difficultés    :', f.difficultes.join(', '));
console.log('Catégories     :', f.categories.length);
console.log('Relations      :', f.relations.length);
console.log(erreurs === 0 ? '✓ Toutes les paires respectent les règles.' : `✗ ${erreurs} paire(s) invalide(s).`);
process.exit(erreurs === 0 ? 0 : 1);
