// ─────────────────────────────────────────────────────────────────────────
//  Registre des jeux de la plateforme.
//  Chaque jeu partage le même socle multijoueur (salon, joueurs, hôte,
//  temps réel, reconnexion, score) et n'ajoute que sa logique propre.
//  `available:false` = carte visible mais « Bientôt » (module pas encore livré).
// ─────────────────────────────────────────────────────────────────────────
export const GAMES = [
  {
    id: 'undercover',
    name: 'Undercover',
    tagline: 'Qui ment ?',
    description: 'Tout le monde a le même mot… sauf un imposteur, et parfois un Mister White sans mot. Donnez des indices, débattez, votez.',
    icon: '🕵️',
    accent: '#8f7cf6',
    min: 3, max: 20, recommended: '5 à 10',
    durMin: 15, durMax: 30,
    available: true,
  },
  {
    id: 'timebomb',
    name: 'Time Bomb',
    tagline: 'Désamorcez la bombe.',
    description: 'Deux camps secrets : gentils et traîtres. Coupez les bons fils avant l’explosion — ou sabotez en douce.',
    icon: '💣',
    accent: '#f0555f',
    min: 4, max: 8, recommended: '4 à 8',
    durMin: 15, durMax: 30,
    available: true,
  },
  {
    id: 'bombparty',
    name: 'Bomb Party',
    tagline: 'Un mot avant l’explosion.',
    description: 'Chacun son tour, trouvez vite un mot contenant la syllabe imposée. Le dernier à tenir la bombe saute.',
    icon: '🧨',
    accent: '#ffb020',
    min: 2, max: 16, recommended: '3 à 8',
    durMin: 5, durMax: 15,
    available: true,
  },
  {
    id: 'ladder',
    name: 'Échelle',
    tagline: 'Classez les réponses.',
    description: 'Chacun reçoit un nombre secret de 1 à 100 et répond au thème. Classez les réponses dans le bon ordre… ensemble.',
    icon: '🪜',
    accent: '#37d0a0',
    min: 3, max: 12, recommended: '4 à 8',
    durMin: 10, durMax: 20,
    available: true,
  },
  {
    id: 'fusion',
    name: 'Fusion',
    tagline: 'Trouvez le mot commun.',
    description: 'Deux mots sont donnés. Trouvez celui qui les relie — les joueurs qui tombent d’accord marquent des points.',
    icon: '🔗',
    accent: '#5ab0ff',
    min: 2, max: 16, recommended: '3 à 10',
    durMin: 10, durMax: 20,
    available: true,
  },
  {
    id: 'wordscatter',
    name: 'Word Scatter',
    tagline: 'Construisez le mot sans erreur.',
    description: 'Un mot secret, ses lettres réparties entre vous. Placez-les dans le bon ordre, en coopérant par indices.',
    icon: '🔤',
    accent: '#e879f9',
    min: 3, max: 10, recommended: '3 à 6',
    durMin: 10, durMax: 20,
    available: true,
  },
  {
    id: 'pinturillo',
    name: 'Pinturillo',
    tagline: 'Dessine et fais deviner.',
    description: 'Chacun son tour, un joueur dessine un mot secret ; les autres devinent dans le chat. Plus on trouve vite, plus on marque.',
    icon: '🎨',
    accent: '#ff7eb6',
    min: 2, max: 12, recommended: '3 à 8',
    durMin: 10, durMax: 25,
    available: true,
  },
];

export const GAMES_BY_ID = Object.fromEntries(GAMES.map((g) => [g.id, g]));

export function jeuDisponible(id) {
  const g = GAMES_BY_ID[id];
  return !!(g && g.available);
}
