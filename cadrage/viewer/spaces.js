// Configuration des deux espaces documentaires (nav, PDF, libellés).
import { DOCS_TREE, CATALOGUE_TREE } from './tree.js?v=1785321001';

export const DEFAULT_SPACE = 'catalogue';

export const SPACES = {
  catalogue: {
    base: '../catalogue/',
    tree: CATALOGUE_TREE,
    label: 'Catalogue',
    docTitle: 'Plouma — Catalogue de fonctionnalités',
    home: 'README.mdx',
    pdf: true,
    cover: { eyebrow: 'CADRAGE', title: 'Plouma', subtitle: 'Catalogue des fonctionnalités de l’application' },
    footer: 'Plouma — Catalogue de fonctionnalités',
    infoTitle: 'Plouma — Catalogue de fonctionnalités',
    download: 'nooma-catalogue-fonctionnalites.pdf',
  },
  docs: {
    base: '../../docs/',
    tree: DOCS_TREE,
    label: 'Docs projet',
    docTitle: 'Plouma — Documentation projet',
    home: 'README.md',
    // Les docs projet sont en markdown pur (rendu marked) : le pipeline PDF
    // (MDX) ne les couvre pas — bouton masqué sur cet espace.
    pdf: false,
    cover: { eyebrow: 'PROJET', title: 'Plouma', subtitle: 'Documentation projet complète' },
    footer: 'Plouma — Documentation projet',
    infoTitle: 'Plouma — Documentation projet',
    download: 'nooma-docs.pdf',
  },
};
