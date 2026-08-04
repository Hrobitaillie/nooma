// Arbres de navigation (source de vérité : nav, ordre du PDF, fils d'Ariane).
// L'espace « catalogue » pointe vers ../catalogue/ (.mdx, composants Est/Lot),
// l'espace « docs » vers ../../docs/ (.md, rendu marked).

export const CATALOGUE_TREE = [
  { type: 'page', label: "Vue d'ensemble", path: 'README.mdx' },
  {
    type: 'section', label: 'Modules', children: [
      { type: 'page', label: '00 · Socle applicatif', path: '00-socle.mdx' },
      { type: 'page', label: '01 · Carte-monde & biomes', path: '01-carte-monde.mdx' },
      { type: 'page', label: '02 · Mini-jeux', path: '02-mini-jeux.mdx' },
      { type: 'page', label: '03 · Le Directeur (adaptatif)', path: '03-directeur.mdx' },
      { type: 'page', label: '04 · Mascotte', path: '04-mascotte.mdx' },
      { type: 'page', label: '05 · Récompenses & maison', path: '05-recompenses.mdx' },
      { type: 'page', label: '06 · Modes & rendez-vous', path: '06-modes.mdx' },
      { type: 'page', label: '07 · Espace parent', path: '07-espace-parent.mdx' },
      { type: 'page', label: '08 · Audio & voix', path: '08-audio.mdx' },
      { type: 'page', label: '09 · Contenus & assets', path: '09-contenu-assets.mdx' },
      { type: 'page', label: '10 · Lancement (paiement, stores)', path: '10-lancement.mdx' },
    ]
  },
  { type: 'page', label: 'Chiffrage (totaux)', path: 'chiffrage.mdx' },
];

export const DOCS_TREE = [
  { type: 'page', label: 'Sommaire', path: 'README.md' },
  {
    type: 'section', label: 'Produit', children: [
      { type: 'page', label: '01 · Vision & positionnement', path: '01-vision-et-positionnement.md' },
      { type: 'page', label: '02 · Pédagogie', path: '02-pedagogie.md' },
      { type: 'page', label: '03 · Game design', path: '03-game-design.md' },
      { type: 'page', label: '04 · Progression adaptative', path: '04-progression-adaptative.md' },
      { type: 'page', label: '05 · Direction artistique', path: '05-direction-artistique.md' },
      { type: 'page', label: '17 · Modes & mécaniques (relecture)', path: '17-modes-et-mecaniques.md' },
    ]
  },
  {
    type: 'section', label: 'Technique', children: [
      { type: 'page', label: '06 · Architecture', path: '06-architecture-technique.md' },
      { type: 'page', label: '07 · Sécurité & vie privée', path: '07-securite-vie-privee.md' },
      { type: 'page', label: '08 · Performances', path: '08-performances.md' },
      { type: 'page', label: '14 · Production 3D Blender', path: '14-production-3d-blender.md' },
      { type: 'page', label: '15 · Production des cartes', path: '15-production-cartes.md' },
      { type: 'page', label: '16 · Habillage des props', path: '16-habillage-props.md' },
      { type: 'page', label: '18 · Mise en ligne & studio', path: '18-mise-en-ligne-et-studio.md' },
    ]
  },
  {
    type: 'section', label: 'Business', children: [
      { type: 'page', label: '09 · Business model', path: '09-business-model.md' },
      { type: 'page', label: '10 · Marketing & communication', path: '10-marketing-communication.md' },
      { type: 'page', label: '11 · Conformité stores', path: '11-conformite-stores.md' },
    ]
  },
  {
    type: 'section', label: 'Pilotage', children: [
      { type: 'page', label: '12 · Roadmap', path: '12-roadmap.md' },
      { type: 'page', label: '13 · Décisions & questions', path: '13-decisions.md' },
      { type: 'page', label: 'Ressources YouTube (Blender)', path: 'ressources-youtube.md' },
    ]
  },
];
