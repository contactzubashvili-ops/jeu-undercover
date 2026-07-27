// ─────────────────────────────────────────────────────────────────────────
//  Base de mots + sélection cohérente
//  Chaque paire : { civil, undercover, category, relation, difficulty }
//  Règle : civil != undercover, une relation existe toujours, mots jouables.
//  La base est extensible : le socle ci-dessous garantit un jeu jouable même
//  sans fichier externe ; src/data/pairs.json vient l'enrichir (des milliers
//  de paires) et est fusionné au démarrage.
// ─────────────────────────────────────────────────────────────────────────
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Socle intégré — toujours présent, garantit un jeu jouable hors ligne.
const SOCLE = [
  // ── FACILE : mots très proches ──────────────────────────────────────────
  { civil: 'Chat', undercover: 'Tigre', category: 'Animaux', relation: 'Félins', difficulty: 'facile' },
  { civil: 'Chien', undercover: 'Loup', category: 'Animaux', relation: 'Canidés', difficulty: 'facile' },
  { civil: 'Pomme', undercover: 'Poire', category: 'Nourriture', relation: 'Fruits', difficulty: 'facile' },
  { civil: 'Avion', undercover: 'Hélicoptère', category: 'Transports', relation: 'Aéronefs', difficulty: 'facile' },
  { civil: 'Guitare', undercover: 'Piano', category: 'Instruments', relation: 'Instruments de musique', difficulty: 'facile' },
  { civil: 'Café', undercover: 'Thé', category: 'Boissons', relation: 'Boissons chaudes', difficulty: 'facile' },
  { civil: 'Mer', undercover: 'Océan', category: 'Nature', relation: "Étendues d'eau salée", difficulty: 'facile' },
  { civil: 'Roi', undercover: 'Empereur', category: 'Histoire', relation: 'Souverains', difficulty: 'facile' },
  { civil: 'Vélo', undercover: 'Moto', category: 'Transports', relation: 'Deux-roues', difficulty: 'facile' },
  { civil: 'Médecin', undercover: 'Infirmier', category: 'Métiers', relation: 'Soignants', difficulty: 'facile' },
  { civil: 'Football', undercover: 'Rugby', category: 'Sports', relation: 'Sports de ballon', difficulty: 'facile' },
  { civil: 'Lion', undercover: 'Panthère', category: 'Animaux', relation: 'Grands félins', difficulty: 'facile' },
  { civil: 'Fraise', undercover: 'Framboise', category: 'Nourriture', relation: 'Fruits rouges', difficulty: 'facile' },
  { civil: 'Soleil', undercover: 'Lune', category: 'Nature', relation: 'Astres', difficulty: 'facile' },
  { civil: 'Train', undercover: 'Métro', category: 'Transports', relation: 'Transports sur rail', difficulty: 'facile' },
  { civil: 'Chaise', undercover: 'Fauteuil', category: 'Maison', relation: "Sièges", difficulty: 'facile' },
  { civil: 'Batman', undercover: 'Superman', category: 'Super-héros', relation: 'Héros DC Comics', difficulty: 'facile' },
  { civil: 'Neige', undercover: 'Pluie', category: 'Nature', relation: 'Précipitations', difficulty: 'facile' },

  // ── MOYEN : liés mais bien distincts ────────────────────────────────────
  { civil: 'Plage', undercover: 'Piscine', category: 'Lieux', relation: 'Lieux de baignade', difficulty: 'moyen' },
  { civil: 'Château', undercover: 'Palais', category: 'Lieux', relation: 'Grandes demeures', difficulty: 'moyen' },
  { civil: 'Pizza', undercover: 'Hamburger', category: 'Nourriture', relation: 'Plats populaires', difficulty: 'moyen' },
  { civil: 'Police', undercover: 'Gendarmerie', category: 'Métiers', relation: "Forces de l'ordre", difficulty: 'moyen' },
  { civil: 'Vampire', undercover: 'Zombie', category: 'Horreur', relation: 'Créatures mortes-vivantes', difficulty: 'moyen' },
  { civil: 'Montagne', undercover: 'Volcan', category: 'Nature', relation: 'Reliefs', difficulty: 'moyen' },
  { civil: 'Prison', undercover: 'Hôpital', category: 'Lieux', relation: 'Institutions où l’on est enfermé', difficulty: 'moyen' },
  { civil: 'Guerre', undercover: 'Révolution', category: 'Histoire', relation: 'Conflits', difficulty: 'moyen' },
  { civil: 'Livre', undercover: 'Journal', category: 'Objets', relation: 'Supports écrits', difficulty: 'moyen' },
  { civil: 'Restaurant', undercover: 'Cantine', category: 'Lieux', relation: 'Lieux où l’on mange', difficulty: 'moyen' },
  { civil: 'Docteur', undercover: 'Pharmacien', category: 'Métiers', relation: 'Métiers de la santé', difficulty: 'moyen' },
  { civil: 'Théâtre', undercover: 'Cinéma', category: 'Lieux', relation: 'Salles de spectacle', difficulty: 'moyen' },
  { civil: 'Requin', undercover: 'Dauphin', category: 'Animaux', relation: 'Animaux marins', difficulty: 'moyen' },
  { civil: 'Guitare', undercover: 'Violon', category: 'Instruments', relation: 'Instruments à cordes', difficulty: 'moyen' },
  { civil: 'Noël', undercover: 'Anniversaire', category: 'Fêtes', relation: 'Occasions de cadeaux', difficulty: 'moyen' },
  { civil: 'Sorcier', undercover: 'Magicien', category: 'Fantastique', relation: 'Utilisateurs de magie', difficulty: 'moyen' },

  // ── DIFFICILE : lien plus indirect ──────────────────────────────────────
  { civil: 'Couronne', undercover: 'Pouvoir', category: 'Concepts abstraits', relation: 'Symbole et ce qu’il représente', difficulty: 'difficile' },
  { civil: 'Prison', undercover: 'Justice', category: 'Concepts abstraits', relation: 'Système judiciaire', difficulty: 'difficile' },
  { civil: 'Désert', undercover: 'Solitude', category: 'Concepts abstraits', relation: 'Vide et isolement', difficulty: 'difficile' },
  { civil: 'Horloge', undercover: 'Temps', category: 'Concepts abstraits', relation: 'Instrument et notion', difficulty: 'difficile' },
  { civil: 'Miroir', undercover: 'Vérité', category: 'Concepts abstraits', relation: 'Ce qui reflète', difficulty: 'difficile' },
  { civil: 'Feu', undercover: 'Passion', category: 'Concepts abstraits', relation: 'Métaphore de l’intensité', difficulty: 'difficile' },
  { civil: 'Ancre', undercover: 'Stabilité', category: 'Concepts abstraits', relation: 'Objet et ce qu’il évoque', difficulty: 'difficile' },
  { civil: 'Masque', undercover: 'Mensonge', category: 'Concepts abstraits', relation: 'Ce qui dissimule', difficulty: 'difficile' },
  { civil: 'Chaîne', undercover: 'Esclavage', category: 'Concepts abstraits', relation: 'Objet et condition', difficulty: 'difficile' },
  { civil: 'Racine', undercover: 'Origine', category: 'Concepts abstraits', relation: 'Ce qui fonde', difficulty: 'difficile' },
  { civil: 'Pont', undercover: 'Lien', category: 'Concepts abstraits', relation: 'Ce qui relie', difficulty: 'difficile' },
  { civil: 'Balance', undercover: 'Équité', category: 'Concepts abstraits', relation: 'Symbole de justice', difficulty: 'difficile' },

  // ── GEEK — Animés & Mangas ──────────────────────────────────────────────
  { civil: 'Goku', undercover: 'Vegeta', category: 'Animés & Mangas', relation: 'Saiyans de Dragon Ball', difficulty: 'facile' },
  { civil: 'Naruto', undercover: 'Sasuke', category: 'Animés & Mangas', relation: 'Ninjas rivaux de Konoha', difficulty: 'moyen' },
  { civil: 'Luffy', undercover: 'Zoro', category: 'Animés & Mangas', relation: 'Équipage du Chapeau de paille', difficulty: 'moyen' },
  { civil: 'Tanjiro', undercover: 'Nezuko', category: 'Animés & Mangas', relation: 'Frère et sœur de Demon Slayer', difficulty: 'moyen' },
  { civil: 'Pikachu', undercover: 'Dracaufeu', category: 'Animés & Mangas', relation: 'Pokémon', difficulty: 'facile' },
  { civil: 'Itachi', undercover: 'Sasuke', category: 'Animés & Mangas', relation: 'Frères Uchiha', difficulty: 'difficile' },
  { civil: 'Deku', undercover: 'Bakugo', category: 'Animés & Mangas', relation: 'Héros de My Hero Academia', difficulty: 'moyen' },
  { civil: 'Eren', undercover: 'Mikasa', category: 'Animés & Mangas', relation: 'L’Attaque des Titans', difficulty: 'moyen' },
  { civil: 'Gojo', undercover: 'Sukuna', category: 'Animés & Mangas', relation: 'Puissants de Jujutsu Kaisen', difficulty: 'difficile' },
  { civil: 'Light', undercover: 'Ryuk', category: 'Animés & Mangas', relation: 'Death Note', difficulty: 'difficile' },
  { civil: 'Edward', undercover: 'Alphonse', category: 'Animés & Mangas', relation: 'Frères Elric', difficulty: 'moyen' },
  { civil: 'Ichigo', undercover: 'Rukia', category: 'Animés & Mangas', relation: 'Bleach', difficulty: 'moyen' },
  { civil: 'Saitama', undercover: 'Genos', category: 'Animés & Mangas', relation: 'One Punch Man', difficulty: 'moyen' },
  { civil: 'Kirua', undercover: 'Gon', category: 'Animés & Mangas', relation: 'Hunter x Hunter', difficulty: 'moyen' },
  { civil: 'Totoro', undercover: 'Ponyo', category: 'Animés & Mangas', relation: 'Studio Ghibli', difficulty: 'moyen' },
  { civil: 'Asuka', undercover: 'Rei', category: 'Animés & Mangas', relation: 'Pilotes d’Evangelion', difficulty: 'difficile' },

  // ── GEEK — Jeux vidéo ───────────────────────────────────────────────────
  { civil: 'Mario', undercover: 'Luigi', category: 'Jeux vidéo', relation: 'Frères plombiers', difficulty: 'facile' },
  { civil: 'Sonic', undercover: 'Tails', category: 'Jeux vidéo', relation: 'Duo de Sega', difficulty: 'facile' },
  { civil: 'Link', undercover: 'Zelda', category: 'Jeux vidéo', relation: 'Héros d’Hyrule', difficulty: 'facile' },
  { civil: 'Kratos', undercover: 'Atreus', category: 'Jeux vidéo', relation: 'God of War', difficulty: 'moyen' },
  { civil: 'Ryu', undercover: 'Ken', category: 'Jeux vidéo', relation: 'Combattants de Street Fighter', difficulty: 'moyen' },
  { civil: 'Crash', undercover: 'Spyro', category: 'Jeux vidéo', relation: 'Mascottes PlayStation', difficulty: 'moyen' },
  { civil: 'Bowser', undercover: 'Ganon', category: 'Jeux vidéo', relation: 'Grands méchants Nintendo', difficulty: 'moyen' },
  { civil: 'Cloud', undercover: 'Sephiroth', category: 'Jeux vidéo', relation: 'Final Fantasy VII', difficulty: 'moyen' },
  { civil: 'Scorpion', undercover: 'Reptile', category: 'Jeux vidéo', relation: 'Ninjas de Mortal Kombat', difficulty: 'moyen' },
  { civil: 'Ezio', undercover: 'Altaïr', category: 'Jeux vidéo', relation: 'Assassin’s Creed', difficulty: 'difficile' },
  { civil: 'Nathan Drake', undercover: 'Lara Croft', category: 'Jeux vidéo', relation: 'Aventuriers pilleurs de tombes', difficulty: 'moyen' },
  { civil: 'Creeper', undercover: 'Enderman', category: 'Jeux vidéo', relation: 'Créatures de Minecraft', difficulty: 'moyen' },
  { civil: 'Peach', undercover: 'Daisy', category: 'Jeux vidéo', relation: 'Princesses du Royaume Champignon', difficulty: 'moyen' },
  { civil: 'Steve', undercover: 'Alex', category: 'Jeux vidéo', relation: 'Héros de Minecraft', difficulty: 'facile' },
  { civil: 'Pac-Man', undercover: 'Sonic', category: 'Jeux vidéo', relation: 'Icônes rétro du jeu vidéo', difficulty: 'moyen' },
  { civil: 'Geralt', undercover: 'Ciri', category: 'Jeux vidéo', relation: 'The Witcher', difficulty: 'difficile' },

  // ── GEEK — JDR & Fantasy ────────────────────────────────────────────────
  { civil: 'Elfe', undercover: 'Nain', category: 'JDR & Fantasy', relation: 'Peuples de fantasy', difficulty: 'facile' },
  { civil: 'Orc', undercover: 'Gobelin', category: 'JDR & Fantasy', relation: 'Créatures monstrueuses', difficulty: 'moyen' },
  { civil: 'Magicien', undercover: 'Sorcier', category: 'JDR & Fantasy', relation: 'Lanceurs de sorts', difficulty: 'facile' },
  { civil: 'Paladin', undercover: 'Barbare', category: 'JDR & Fantasy', relation: 'Classes de personnage', difficulty: 'moyen' },
  { civil: 'Dragon', undercover: 'Wyverne', category: 'JDR & Fantasy', relation: 'Créatures ailées', difficulty: 'moyen' },
  { civil: 'Troll', undercover: 'Ogre', category: 'JDR & Fantasy', relation: 'Grands monstres brutaux', difficulty: 'moyen' },
  { civil: 'Licorne', undercover: 'Pégase', category: 'JDR & Fantasy', relation: 'Créatures légendaires', difficulty: 'moyen' },
  { civil: 'Chevalier', undercover: 'Écuyer', category: 'JDR & Fantasy', relation: 'Guerriers en armure', difficulty: 'moyen' },
  { civil: 'Sorcière', undercover: 'Enchanteresse', category: 'JDR & Fantasy', relation: 'Magiciennes', difficulty: 'moyen' },
  { civil: 'Golem', undercover: 'Gargouille', category: 'JDR & Fantasy', relation: 'Gardiens de pierre', difficulty: 'difficile' },
  { civil: 'Vampire', undercover: 'Loup-garou', category: 'JDR & Fantasy', relation: 'Monstres de la nuit', difficulty: 'facile' },
  { civil: 'Nécromancien', undercover: 'Invocateur', category: 'JDR & Fantasy', relation: 'Mages qui appellent des créatures', difficulty: 'difficile' },
  { civil: 'Barde', undercover: 'Ménestrel', category: 'JDR & Fantasy', relation: 'Musiciens errants', difficulty: 'difficile' },
  { civil: 'Rôdeur', undercover: 'Chasseur', category: 'JDR & Fantasy', relation: 'Traqueurs des bois', difficulty: 'moyen' },
  { civil: 'Griffon', undercover: 'Phénix', category: 'JDR & Fantasy', relation: 'Créatures mythiques', difficulty: 'moyen' },
  { civil: 'Liche', undercover: 'Zombie', category: 'JDR & Fantasy', relation: 'Morts-vivants', difficulty: 'moyen' },
];

// Normalise une paire (trim, cohérence des clés) et la valide.
function normaliserPaire(p) {
  if (!p || typeof p !== 'object') return null;
  const civil = String(p.civil ?? '').trim();
  const undercover = String(p.undercover ?? '').trim();
  const category = String(p.category ?? 'Divers').trim() || 'Divers';
  const relation = String(p.relation ?? '').trim();
  let difficulty = String(p.difficulty ?? 'moyen').trim().toLowerCase();
  if (!['facile', 'moyen', 'difficile'].includes(difficulty)) difficulty = 'moyen';
  // Règles impératives : deux mots, différents, une relation existe.
  if (!civil || !undercover) return null;
  if (civil.toLowerCase() === undercover.toLowerCase()) return null;
  if (!relation) return null;
  // Un mot ne doit pas contenir l'autre (évite les révélations triviales).
  const a = civil.toLowerCase();
  const b = undercover.toLowerCase();
  if (a.includes(b) || b.includes(a)) return null;
  return { civil, undercover, category, relation, difficulty };
}

function clePaire(p) {
  // Clé insensible à l'ordre pour dédoublonner (Chat/Tigre == Tigre/Chat).
  const [x, y] = [p.civil.toLowerCase(), p.undercover.toLowerCase()].sort();
  return `${x}|${y}`;
}

// Charge le socle + le fichier externe (généré), dédoublonne, valide.
function chargerBase() {
  const paires = [];
  const vues = new Set();
  const ajouter = (liste) => {
    for (const brute of liste) {
      const p = normaliserPaire(brute);
      if (!p) continue;
      const cle = clePaire(p);
      if (vues.has(cle)) continue;
      vues.add(cle);
      paires.push(p);
    }
  };
  ajouter(SOCLE);
  const fichier = join(__dirname, 'data', 'pairs.json');
  if (existsSync(fichier)) {
    try {
      const externe = JSON.parse(readFileSync(fichier, 'utf8'));
      if (Array.isArray(externe)) ajouter(externe);
    } catch (e) {
      console.warn('[mots] pairs.json illisible, socle seul utilisé :', e.message);
    }
  }
  return paires;
}

const BASE = chargerBase();

// Regroupement des catégories en grandes familles (pour les chips de thèmes).
const GROUPES = [
  { icon: '🐾', label: 'Nature & vivant', cats: ['Animaux', 'Nature', 'Corps humain', 'Médecine', 'Sciences'] },
  { icon: '🍔', label: 'Nourriture & boisson', cats: ['Nourriture', 'Boissons', 'Cuisine'] },
  { icon: '🗺️', label: 'Lieux & voyage', cats: ['Lieux', 'Pays', 'Villes', 'Transports'] },
  { icon: '🎮', label: 'Geek — animés, jeux vidéo, JDR', cats: ['Animés & Mangas', 'Jeux vidéo', 'JDR & Fantasy', 'Super-héros', 'Fantastique'] },
  { icon: '🎬', label: 'Culture & écrans', cats: ['Films', 'Séries', 'Personnages fictifs', 'Horreur', 'Mythologie', 'Musique', 'Instruments'] },
  { icon: '🔧', label: 'Objets & maison', cats: ['Objets', 'Maison', 'Vêtements', 'Outils', 'Technologie', 'Internet'] },
  { icon: '🏛️', label: 'Société & vie', cats: ['Métiers', 'Travail', 'École', 'Histoire', 'Politique', 'Sports', 'Jeux', 'Fêtes', 'Fêtes et traditions', 'Émotions', 'Concepts abstraits', 'Situations de la vie quotidienne'] },
];

// Index des catégories / relations + catégories groupées (présentes seulement).
function facettes() {
  const categories = new Set();
  const relations = new Set();
  const compteCat = {};
  for (const p of BASE) {
    categories.add(p.category);
    relations.add(p.relation);
    compteCat[p.category] = (compteCat[p.category] || 0) + 1;
  }
  const presentes = new Set(categories);
  const rangees = new Set();
  const groupes = GROUPES.map((g) => {
    const cats = g.cats.filter((c) => presentes.has(c));
    cats.forEach((c) => rangees.add(c));
    return { icon: g.icon, label: g.label, categories: cats };
  }).filter((g) => g.categories.length);
  // Catégories non rangées → un groupe « Autres ».
  const autres = [...presentes].filter((c) => !rangees.has(c)).sort((a, b) => a.localeCompare(b, 'fr'));
  if (autres.length) groupes.push({ icon: '✨', label: 'Autres', categories: autres });

  return {
    total: BASE.length,
    categories: [...categories].sort((a, b) => a.localeCompare(b, 'fr')),
    groupes,
    compteCat,
    difficultes: ['facile', 'moyen', 'difficile'],
    relations: [...relations].sort((a, b) => a.localeCompare(b, 'fr')),
  };
}

// Sélectionne une paire selon les filtres (tous optionnels : 'any' = pas de filtre).
// `exclure` : ensemble de clés de paires déjà utilisées dans la partie.
// `melangerSens` : décide au hasard quel mot est « civil » (variété).
function choisirPaire({ categories = [], difficulty = 'any', relation = 'any' } = {}, exclure = new Set()) {
  // `categories` : tableau de catégories choisies (vide = toutes). Rétro-compatible
  // avec une chaîne unique.
  const cats = Array.isArray(categories)
    ? categories.filter((c) => c && c !== 'any')
    : (categories && categories !== 'any' ? [categories] : []);

  const filtrer = (strict) => BASE.filter((p) => {
    if (cats.length && !cats.includes(p.category)) return false;
    if (difficulty !== 'any' && p.difficulty !== difficulty) return false;
    if (relation !== 'any' && p.relation !== relation) return false;
    if (strict && exclure.has(clePaire(p))) return false;
    return true;
  });

  // On tente d'abord en excluant les paires déjà jouées ; sinon on relâche.
  let pool = filtrer(true);
  if (pool.length === 0) pool = filtrer(false);
  // Si les filtres ne donnent rien, on relâche vers toute la base.
  if (pool.length === 0) pool = BASE;

  const p = pool[Math.floor(Math.random() * pool.length)];
  // Variété : on peut inverser le sens (les relations du socle sont symétriques).
  const inverser = Math.random() < 0.5;
  const civilWord = inverser ? p.undercover : p.civil;
  const undercoverWord = inverser ? p.civil : p.undercover;
  return {
    civilWord,
    undercoverWord,
    category: p.category,
    relation: p.relation,
    difficulty: p.difficulty,
    key: clePaire(p),
  };
}

export { choisirPaire, facettes, BASE, normaliserPaire, clePaire };
