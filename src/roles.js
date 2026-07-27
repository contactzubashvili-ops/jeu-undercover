// ─────────────────────────────────────────────────────────────────────────
//  Attribution des rôles — selon le MODE de jeu choisi par l'hôte :
//
//   • Mode « undercover » : 1 Undercover (mot proche) + le reste Civils.
//   • Mode « mrwhite »    : 1 Mister White (aucun mot, doit deviner) + Civils.
//   • Mode « both » (Classique) : 1 Undercover + 1 Mister White + Civils.
//
//  Dans tous les cas : au plus 1 Undercover et au plus 1 Mister White (jamais 2).
//  Minimum 3 joueurs. Rotation : on évite de redonner le même rôle spécial.
// ─────────────────────────────────────────────────────────────────────────

export const ROLES = { CIVIL: 'civil', UNDERCOVER: 'undercover', MRWHITE: 'mrwhite' };
export const MODES = { UNDERCOVER: 'undercover', MRWHITE: 'mrwhite', BOTH: 'both' };
export const MIN_JOUEURS = 3;

function melanger(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Choisit l'index d'un joueur pour un rôle spécial en pénalisant ceux qui l'ont
// eu récemment (rotation), surtout à la manche précédente.
function tirerPondere(candidats, roleVise) {
  const poids = candidats.map((p) => {
    const compte = (p.roleCounts && p.roleCounts[roleVise]) || 0;
    let w = 1 / (1 + compte);
    if (p.lastSpecial === roleVise) w *= 0.15;
    return w;
  });
  const somme = poids.reduce((s, w) => s + w, 0);
  let seuil = Math.random() * somme;
  for (let i = 0; i < candidats.length; i++) {
    seuil -= poids[i];
    if (seuil <= 0) return i;
  }
  return candidats.length - 1;
}

// Distribue les rôles selon le mode. Mute p.role et l'historique de rotation.
export function distribuerRoles(joueurs, mode = MODES.UNDERCOVER) {
  if (joueurs.length < MIN_JOUEURS) {
    throw new Error(`Il faut au moins ${MIN_JOUEURS} joueurs.`);
  }

  // Tout le monde civil au départ.
  for (const p of joueurs) {
    p.role = ROLES.CIVIL;
    p.lastSpecial = null;
    if (!p.roleCounts) p.roleCounts = { civil: 0, undercover: 0, mrwhite: 0 };
  }

  // Pioche pondérée (mélange de base + rotation).
  const restant = melanger(joueurs);
  const result = { undercoverId: null, mrWhiteId: null, civilIds: [] };
  const attribuer = (role) => {
    const idx = tirerPondere(restant, role);
    const p = restant[idx];
    restant.splice(idx, 1);
    p.role = role;
    p.lastSpecial = role;
    return p;
  };

  if (mode === MODES.UNDERCOVER || mode === MODES.BOTH) result.undercoverId = attribuer(ROLES.UNDERCOVER).id;
  if (mode === MODES.MRWHITE || mode === MODES.BOTH) result.mrWhiteId = attribuer(ROLES.MRWHITE).id;

  for (const p of joueurs) p.roleCounts[p.role] = (p.roleCounts[p.role] || 0) + 1;
  result.civilIds = joueurs.filter((p) => p.role === ROLES.CIVIL).map((p) => p.id);
  return result;
}

// Composition théorique pour un effectif + mode (affichage lobby).
export function composition(total, mode = MODES.UNDERCOVER) {
  const assez = total >= MIN_JOUEURS;
  const undercover = (mode === MODES.UNDERCOVER || mode === MODES.BOTH) && assez ? 1 : 0;
  const mrwhite = (mode === MODES.MRWHITE || mode === MODES.BOTH) && assez ? 1 : 0;
  const civils = Math.max(0, total - undercover - mrwhite);
  return { civils, undercover, mrwhite };
}
