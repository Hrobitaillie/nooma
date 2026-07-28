// Génère fixtures/locasyst-project.flooow.json (format v3) : le cadrage par fonctionnalité de
// locasyst adapté sur Flooow (couche fonctionnelle). 9 modules (00→08), leurs fonctionnalités et
// les liens « dépend de » dérivés de la colonne « Dépend de » du catalogue. Déterministe, validé zod.
//   npx tsx scripts/generate-locasyst.ts
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createEmptyProject, createModule, createFeature, createEdge } from '@flooow/core/model/factory'
import { mergeFeatureFields } from '@flooow/core/model/richContent'
import { parseProjectDoc } from '@flooow/core/model/schema'
import { FIELD_PERIMETER } from '@flooow/core/model/types'
import type { FeatureOption, FlooowEdge, FlooowNode, ProjectDoc } from '@flooow/core/model/types'

/**
 * Périmètres du catalogue locasyst. Enum FIGÉ dans le modèle jusqu'en v6, il n'est plus qu'une
 * donnée SOURCE de ce générateur : le document produit porte des options de projet (v7), que l'on
 * amorce ci-dessous à partir des seules valeurs réellement employées par le catalogue.
 */
type RawPerimeter = 'site' | 'editor' | 'internal' | 'external'
const PERIMETER_LABELS: Record<RawPerimeter, string> = {
  site: 'Site',
  editor: 'Éditeur',
  internal: 'Interne',
  external: 'Externe',
}

interface RawFeature {
  code: string
  name: string
  perimeter: RawPerimeter | null
  dependsOn: string[]
  quoi: string
  toConfirm: string
}
interface RawModule {
  code: string
  name: string
  features: RawFeature[]
}

// Données extraites du catalogue .audit/locasyst-api/catalogue-fonctionnalites/*.mdx (colonnes des
// tableaux + fiches « Quoi » / « À confirmer »). Les entités HTML sont dé-échappées ci-dessous.
const RAW: RawModule[] = [
  {
    code: '00',
    name: 'Socle',
    features: [
      { code: 'SOC-01', name: "Brancher le site sur l'API Locasuite (mode « site »)", perimeter: 'site', dependsOn: [], quoi: "consommer l'API Locasyst/Factsyst via un mode d'accès dédié au site.", toConfirm: '3 instances Locasyst, un point d’entrée API unique ou un par agence ?' },
      { code: 'SOC-02', name: 'Backend / proxy serveur (appels API côté serveur)', perimeter: 'site', dependsOn: ['SOC-01'], quoi: "le site appelle l'API Locasuite côté serveur, jamais depuis le navigateur (API interne).", toConfirm: '' },
      { code: 'SOC-03', name: 'Authentification du site', perimeter: 'site', dependsOn: ['SOC-02'], quoi: "le site porte sa propre auth (Locasyst n'expose aucun login/mot de passe).", toConfirm: 'approche A (autonome) ou B (IdP/SSO) ? On s’oriente vers A.' },
      { code: 'SOC-04', name: 'Matching compte web ↔ idTiers', perimeter: 'site', dependsOn: ['SOC-03'], quoi: 'relier chaque compte web au Tiers Locasyst (pivot universel).', toConfirm: 'clé = email (Contact.email) ou SIRET (Tiers.siret) ? Stabilité de l’idTiers dans le temps ?' },
      { code: 'SOC-05', name: 'Création de compte avec validation Loca (« à valider »)', perimeter: 'site', dependsOn: ['SOC-04'], quoi: 'la création n’est pas en self-service ; 3 voies (compte Locasyst existant / formulaire complet + SIRET / invité).', toConfirm: 'remontée « à valider » + notif côté Locasyst = workflow site (en attendant) ou évolution PGS ?' },
      { code: 'SOC-06', name: 'Comptes invités (ponctuel, sans Locasyst)', perimeter: 'site', dependsOn: ['SOC-03'], quoi: 'compte ponctuel pour une demande unique, sans connexion Locasyst (tel, mail, Calendly).', toConfirm: '' },
      { code: 'SOC-07', name: 'Multi-entité (un user ↔ plusieurs entreprises)', perimeter: 'site', dependsOn: ['SOC-04'], quoi: 'un même utilisateur rattaché à plusieurs entreprises, bascule d’entité à la connexion ; connexion par SIRET possible.', toConfirm: '' },
      { code: 'SOC-08', name: 'Sous-comptes / établissements', perimeter: 'site', dependsOn: ['SOC-07'], quoi: 'une entreprise a des établissements avec infos différentes (ex. Sodexo Paris vs Lyon).', toConfirm: '' },
      { code: 'SOC-09', name: 'Sync descendante par polling (date de modif)', perimeter: 'site', dependsOn: ['SOC-02'], quoi: 'détecter créations/modifs côté Locasyst (clients, devis/locations) sans webhooks.', toConfirm: '' },
      { code: 'SOC-10', name: 'Sync suppression Locasyst → site', perimeter: 'site', dependsOn: ['SOC-09'], quoi: 'une suppression côté Locasyst supprime le compte site.', toConfirm: '' },
      { code: 'SOC-11', name: 'Déduplication des comptes à la reprise', perimeter: 'site', dependsOn: ['SOC-04'], quoi: 'beaucoup de doublons de comptes aujourd’hui, à dédupliquer.', toConfirm: '' },
      { code: 'SOC-12', name: 'RGPD / périmètre de données', perimeter: 'site', dependsOn: ['SOC-02'], quoi: 'ne pas importer le superflu, pas de données bancaires ; lecture live ; accès strict à son idTiers ; droit à l’oubli via isInactifClient.', toConfirm: '' },
      { code: 'SOC-13', name: 'Reprise des comptes clients « location < 5 ans »', perimeter: 'site', dependsOn: [], quoi: 'reprendre uniquement les clients ayant loué il y a moins de 5 ans (pas les prospects).', toConfirm: '' },
    ],
  },
  {
    code: '01',
    name: 'Catalogue produit',
    features: [
      { code: 'CAT-01', name: 'Listing catalogue (public / non connecté)', perimeter: 'site', dependsOn: ['CAT-10', 'CAT-11'], quoi: 'toutes catégories, tous produits (hors exclus), services. Prix HT et TTC. Stock non affiché.', toConfirm: '' },
      { code: 'CAT-02', name: 'Fiche produit', perimeter: 'site', dependsOn: ['CAT-03', 'CAT-04', 'CAT-11'], quoi: 'nom, description, photos, caractéristiques, prix selon profil, produits liés, favoris, « demander un devis », inspirations / moodboard.', toConfirm: '' },
      { code: 'CAT-03', name: 'Caractéristiques produit (depuis PIM)', perimeter: 'site', dependsOn: [], quoi: 'afficher les caractéristiques riches (diamètre, matériau, capacité…) absentes de Locasyst.', toConfirm: '' },
      { code: 'CAT-04', name: 'Médias produit (galerie + images dédiées, DAM)', perimeter: 'site', dependsOn: [], quoi: "galerie d'images HD + champs d'images dédiés (mise en situation / ambiance).", toConfirm: '' },
      { code: 'CAT-05', name: 'Conditionnement affiché', perimeter: 'site', dependsOn: [], quoi: 'afficher correctement le conditionnement sur les fiches.', toConfirm: '' },
      { code: 'CAT-06', name: 'Lien vidéo YouTube sur la fiche', perimeter: 'site', dependsOn: [], quoi: 'afficher le lien tuto YouTube par produit + un espace « nos tutos ».', toConfirm: '' },
      { code: 'CAT-07', name: 'Variantes (produits distincts)', perimeter: 'site', dependsOn: ['CAT-02'], quoi: 'afficher les variantes (ex. nappe rouge ≠ blanche) ; sélection sur la fiche ; prix par variante.', toConfirm: '' },
      { code: 'CAT-08', name: 'Lots / ensembles (Kubo, Salon Palme)', perimeter: 'site', dependsOn: [], quoi: 'afficher un ensemble comme un produit unique, quantité fixe, louable uniquement en ensemble.', toConfirm: '' },
      { code: 'CAT-09', name: 'Cross-sell / accessoires', perimeter: 'site', dependsOn: ['CAT-02'], quoi: 'suggérer des accessoires / produits liés.', toConfirm: '' },
      { code: 'CAT-10', name: 'Recherche produit — 2 options (simple / Algolia)', perimeter: 'site', dependsOn: ['SOC-02'], quoi: 'recherche produit avec synonymes métier (chaise longue/chilienne, barnum/tente), facettes.', toConfirm: '' },
      { code: 'CAT-11', name: 'Prix (public / net / remise, barré + %, HT/TTC)', perimeter: 'site', dependsOn: ['SOC-04'], quoi: 'afficher prix public / net / remise ; prix barré + % ; HT en BtoB, TTC en BtoC.', toConfirm: 'TTC sur devis (exposé par PGS) vs recalcul site.' },
      { code: 'CAT-13', name: 'Visibilité par segment (+ extras super client)', perimeter: 'site', dependsOn: [], quoi: 'même base pour non-connecté et connecté ; super client en plus : exclusifs, avant-premières, prix préférentiels, fiche technique++.', toConfirm: 'les particuliers (BtoC) ont-ils un compte ?' },
      { code: 'CAT-14', name: 'Produits exclusifs par client / agence (OM)', perimeter: 'site', dependsOn: [], quoi: 'un client a des produits exclusifs, parfois avec une assiette réservée annuellement par agence (ex. OM).', toConfirm: 'comment obtenir l’info de réservation par client & agence côté PGS ?' },
      { code: 'CAT-17', name: 'Mise en avant des services (montage, accompagnement)', perimeter: 'site', dependsOn: ['CAT-01'], quoi: 'mettre en avant les services & l’accompagnement (montage/démontage, conseil).', toConfirm: 'périmètre éditorial exact.' },
    ],
  },
  {
    code: '02',
    name: 'Demande de devis',
    features: [
      { code: 'DEV-02', name: 'Pré-panier (liste pour devis, sans connexion)', perimeter: 'site', dependsOn: ['CAT-02'], quoi: '« panier » = liste pour devis (pas de blocage stock, pas de paiement), possible sans être connecté.', toConfirm: '' },
      { code: 'DEV-03', name: 'Gating connexion (devis / favoris → connexion)', perimeter: 'site', dependsOn: ['SOC-03'], quoi: '« demander un devis » et « ajouter aux favoris » déclenchent une connexion / création (même invité).', toConfirm: '' },
      { code: 'DEV-04', name: 'Formulaire de demande de devis → création location (statut 0)', perimeter: 'site', dependsOn: ['DEV-02', 'SOC-02'], quoi: 'collecte dates / plage + mode de retrait (livraison ou retrait agence), bloc livraison / montage-démontage, puis crée une location statut 0 dans Locasyst.', toConfirm: 'remontée propre côté ERP + création auto du contact (à cadrer PGS) ; arbre de questions livraison / montage à détailler.' },
      { code: 'DEV-06', name: 'Demande express / réservation (statut 1)', perimeter: 'site', dependsOn: ['DEV-04', 'SOC-05'], quoi: 'formulaire rapide pour urgences < 48 h, réservé aux pros connectés, qui skippe le devis, avec rappel le lendemain.', toConfirm: 'PGS autorise-t-il un statut 1 sans devis préalable ?' },
      { code: 'DEV-07', name: 'Calendly post-devis (RDV commercial)', perimeter: 'site', dependsOn: ['DEV-04'], quoi: 'après soumission, afficher un Calendly pour caler un RDV ; « heure de recontact souhaitée ».', toConfirm: '' },
      { code: 'DEV-08', name: 'Emails transactionnels (via Brevo)', perimeter: 'site', dependsOn: ['INT-01', 'SOC-09'], quoi: 'confirmation de demande, « devis prêt / accepté / refusé », « devis non signé », « facture disponible ».', toConfirm: '' },
      { code: 'DEV-09', name: 'Panier / devis abandonné', perimeter: 'site', dependsOn: ['DEV-02', 'INT-01'], quoi: 'relance « devis abandonné » (préparé non soumis), via timer côté site → Brevo.', toConfirm: '' },
      { code: 'DEV-10', name: 'Devis « vitrine » côté site', perimeter: 'site', dependsOn: [], quoi: 'générer de beaux devis (belles photos, mises en situation), distincts du document ERP.', toConfirm: '' },
      { code: 'DEV-11', name: 'Codes promo (via Brevo) / pas de parrainage', perimeter: null, dependsOn: ['INT-01'], quoi: 'codes promo portés par campagne marketing (Brevo), pas un code natif ; pas de parrainage.', toConfirm: 'le site doit-il accepter la saisie d’un code de campagne, ou tout est porté par Brevo ?' },
    ],
  },
  {
    code: '03',
    name: 'Paiement',
    features: [
      { code: 'PAY-01', name: 'Paiement du devis validé (CentralPay)', perimeter: 'site', dependsOn: ['DEV-04'], quoi: 'payer un devis validé via CentralPay, par acompte ou total, via un lien sur le devis et l’espace client.', toConfirm: 'identique BtoB / BtoC ? Décision A/B.' },
      { code: 'PAY-02', name: 'Récupération auto du lien + liaison au devis Locasyst', perimeter: 'site', dependsOn: ['PAY-01'], quoi: 'récupérer automatiquement le lien de paiement CentralPay et le lier au devis dans Locasyst.', toConfirm: 'faisabilité côté CentralPay (à creuser).' },
    ],
  },
  {
    code: '04',
    name: 'Espace perso',
    features: [
      { code: 'EP-01', name: 'Dashboard (mon compte) + 2 niveaux (admin / contact)', perimeter: 'site', dependsOn: ['SOC-03', 'EP-02'], quoi: 'accès « mon compte » ; tableau de bord différent selon admin entreprise vs contact.', toConfirm: 'BtoC a-t-il un espace perso ?' },
      { code: 'EP-02', name: 'Rôles 2 niveaux + gestion contacts & accès', perimeter: 'site', dependsOn: ['SOC-07'], quoi: 'admin entreprise (voit toutes les commandes) vs contact (voit les siennes). L’admin VIP crée/supprime des contacts.', toConfirm: '' },
      { code: 'EP-03', name: 'Mes devis (liste, statuts, PDF, dupliquer)', perimeter: 'site', dependsOn: ['SOC-02', 'SOC-09'], quoi: 'liste chronologique ; statuts ; télécharger le PDF ; dupliquer ; modifier → commercial ; lien devis ↔ facture (idAffaire).', toConfirm: '' },
      { code: 'EP-04', name: 'Mes factures (liste, détail, PDF, statut)', perimeter: 'site', dependsOn: [], quoi: 'liste des factures ; entête ; détail ligne à ligne ; téléchargement PDF ; statut « payée / en retard / à venir ».', toConfirm: 'accès aux factures pour un user classique ?' },
      { code: 'EP-05', name: 'Notification « facture disponible » (Brevo)', perimeter: 'site', dependsOn: ['INT-01'], quoi: 'mail automatique « votre facture est disponible », porté par le site via Brevo.', toConfirm: '' },
      { code: 'EP-06', name: 'Mes favoris', perimeter: 'site', dependsOn: ['SOC-03'], quoi: 'liste de produits sauvegardés, mise en avant dans le catalogue connecté, exportable en catalogue PDF.', toConfirm: '' },
      { code: 'EP-07', name: 'Mes produits (habituelles / favoris / exclusifs)', perimeter: 'site', dependsOn: ['EP-03'], quoi: 'mes commandes habituelles, mes favoris, mes produits exclusifs.', toConfirm: '' },
      { code: 'EP-08', name: 'Tuto (vidéos YouTube)', perimeter: 'site', dependsOn: [], quoi: 'espace « nos tutos » (vidéos YouTube).', toConfirm: '' },
      { code: 'EP-09', name: 'Exclus super client (ressources, codes, badges)', perimeter: 'site', dependsOn: ['CAT-13'], quoi: 'exclusifs, avant-premières, ressources privées, codes de réduction, badges visibles sur le compte.', toConfirm: '' },
      { code: 'EP-10', name: 'Informations personnelles (+ validation Loca fiche admin)', perimeter: 'site', dependsOn: ['EP-02'], quoi: 'l’utilisateur gère ses infos ; les modifs de la fiche admin passent par Loca pour validation.', toConfirm: 'que peut modifier un user vs un admin exactement ?' },
      { code: 'EP-11', name: 'Mes adresses (communes entreprise, validées Loca)', perimeter: 'site', dependsOn: ['EP-02'], quoi: 'adresses de livraison communes à l’entreprise ; le client peut en proposer, Loca valide.', toConfirm: '' },
      { code: 'EP-12', name: 'Transfert / suppression de compte', perimeter: 'site', dependsOn: ['EP-02', 'SOC-10'], quoi: 'l’admin supprime des contacts ; suppression Locasyst ⇒ suppression site.', toConfirm: '' },
    ],
  },
  {
    code: '05',
    name: 'Documents PDF',
    features: [
      { code: 'PDF-01', name: 'Fiche technique (dossier projet)', perimeter: 'site', dependsOn: ['EP-03'], quoi: 'PDF complet de la documentation d’un projet (produits, liens YouTube, brevets, fiches). Sans prix.', toConfirm: 'accès réservé VIP/super client, ou aussi BtoB classique sur demande ?' },
      { code: 'PDF-02', name: 'Catalogue PDF (depuis favoris)', perimeter: 'site', dependsOn: ['EP-06'], quoi: 'liste de produits + images, depuis Mes favoris.', toConfirm: '' },
    ],
  },
  {
    code: '06',
    name: 'Boutiques éphémères (LocaStand)',
    features: [
      { code: 'BOU-01', name: 'Boutique éphémère (page privée, lien + mot de passe)', perimeter: 'site', dependsOn: ['CAT-01'], quoi: 'page dédiée « salon XXX » reçue via un lien mail, avec les produits sélectionnés par Loca + le client.', toConfirm: '' },
      { code: 'BOU-02', name: 'Interface interne de génération (commerciaux)', perimeter: 'site', dependsOn: ['BOU-01'], quoi: 'back-office où les commerciaux créent une boutique, sélectionnent les produits et fixent le prix.', toConfirm: '' },
      { code: 'BOU-03', name: 'Produits hors PGS dans une boutique', perimeter: 'site', dependsOn: ['BOU-02'], quoi: 'inclure des articles absents de PGS (sous-traitance).', toConfirm: 'matérialisation (création manuelle PGS / code sous-traitant / côté site) ?' },
      { code: 'BOU-04', name: 'Paiement / commande de la boutique', perimeter: 'site', dependsOn: ['BOU-01', 'PAY-01'], quoi: 'commande / paiement de la boutique (dégradé V1, en ligne V2).', toConfirm: '' },
    ],
  },
  {
    code: '07',
    name: 'Intégrations & outils tiers',
    features: [
      { code: 'INT-01', name: 'Brevo : connecteur site → Brevo', perimeter: 'site', dependsOn: ['SOC-02'], quoi: 'le site appelle Brevo : newsletter, campagne, segmentation, transactionnels, relance abandon.', toConfirm: 'double opt-in Brevo ou consentement côté site (RGPD) ?' },
      { code: 'INT-02', name: 'Brevo : relais événementiel (polling) Locasyst → Brevo', perimeter: 'site', dependsOn: ['INT-01', 'SOC-09'], quoi: 'un événement Locasyst déclenche un mail Brevo (devis non signé, nouveau client → liste).', toConfirm: '' },
      { code: 'INT-03', name: 'PIM/DAM : consommation (enrichissement + médias)', perimeter: 'site', dependsOn: [], quoi: 'le site lit le PIM/DAM (descriptions, caractéristiques, médias HD) et combine avec Locasyst.', toConfirm: '' },
      { code: 'INT-04', name: 'Offres d’emploi (Kiloutou)', perimeter: 'site', dependsOn: [], quoi: 'afficher les offres d’emploi (portail recrutement Kiloutou) sur le site.', toConfirm: 'conditions d’accès au flux/API Gestmax ; périmètre des offres à afficher ?' },
    ],
  },
  {
    code: '08',
    name: 'Contenu éditorial (CMS)',
    features: [
      { code: 'CNT-01', name: 'Socle de contenu éditorial (CMS)', perimeter: 'site', dependsOn: [], quoi: 'gérer des pages et contenus éditoriaux (inspirations, expertises, à propos, ressources).', toConfirm: '' },
      { code: 'CNT-02', name: 'Archive inspirations (par thème)', perimeter: 'site', dependsOn: ['CNT-01', 'CAT-02'], quoi: 'listing des inspirations, organisé par thème, avec des images qui valorisent les produits.', toConfirm: '« Réalisations » a-t-il sa propre page ou est-il porté via le moodboard ?' },
      { code: 'CNT-03', name: 'Single inspiration', perimeter: 'site', dependsOn: ['CNT-02'], quoi: 'page détail d’une inspiration (galerie, mise en situation, produits associés).', toConfirm: '' },
      { code: 'CNT-04', name: 'Pages Expertises (template duplicable)', perimeter: 'site', dependsOn: ['CNT-01'], quoi: 'pages de présentation des expertises / services (création de salons, montage/démontage, livraison…).', toConfirm: 'liste exacte des pages expertises.' },
      { code: 'CNT-05', name: 'À propos : Qui sommes-nous', perimeter: 'site', dependsOn: ['CNT-01'], quoi: 'page institutionnelle de présentation.', toConfirm: '' },
      { code: 'CNT-06', name: 'Nos engagements / seconde vie (duplicable)', perimeter: 'site', dependsOn: ['CNT-01'], quoi: 'page(s) d’engagements (template duplicable), dont la seconde vie.', toConfirm: '' },
      { code: 'CNT-07', name: 'On recrute / Marque employeur (+ offres Kiloutou)', perimeter: 'site', dependsOn: ['CNT-01', 'INT-04'], quoi: 'page marque employeur + offres d’emploi (archive + single) alimentées par l’ATS Gestmax.', toConfirm: 'conditions d’accès au flux/API Gestmax (cf. INT-04).' },
      { code: 'CNT-08', name: 'Références : archive', perimeter: 'site', dependsOn: ['CNT-01'], quoi: 'listing des références (réalisations / clients marquants).', toConfirm: '' },
      { code: 'CNT-09', name: 'Single référence (duplicable)', perimeter: 'site', dependsOn: ['CNT-08'], quoi: 'page détail d’une référence (visuels, descriptif, produits / services mobilisés).', toConfirm: '' },
      { code: 'CNT-10', name: 'Actualités / Blog : archive', perimeter: 'site', dependsOn: ['CNT-01'], quoi: 'listing des actualités et articles de blog.', toConfirm: '' },
      { code: 'CNT-11', name: 'Single article / actualité (duplicable)', perimeter: 'site', dependsOn: ['CNT-10'], quoi: 'page détail d’un article de blog ou d’une actualité.', toConfirm: '' },
      { code: 'CNT-12', name: 'FAQ général', perimeter: 'site', dependsOn: ['CNT-01'], quoi: 'page FAQ (questions / réponses), organisée par rubriques.', toConfirm: '' },
      { code: 'CNT-13', name: 'Contact', perimeter: 'site', dependsOn: ['CNT-01', 'INT-01'], quoi: 'page de contact (formulaire + coordonnées), connectée à Brevo.', toConfirm: '' },
      { code: 'CNT-14', name: 'Nos agences', perimeter: 'site', dependsOn: ['CNT-01'], quoi: 'page présentant les 3 agences, coordonnées et zones.', toConfirm: '' },
      { code: 'CNT-15', name: 'Autres pages de contenu (à compléter)', perimeter: 'site', dependsOn: ['CNT-01'], quoi: 'd’autres pages de contenu, à définir.', toConfirm: 'lesquelles ? (liste à compléter)' },
    ],
  },
]

// Géométrie : un module par colonne (conteneur), ses fonctionnalités empilées EN RELATIF dedans.
const COL_STEP = 360 // largeur module (300) + gouttière (60)
// Pas vertical : au-dessus du plancher d'une carte (FEATURE_STEP = 236 en v7, cartes plus hautes
// depuis les sélecteurs libellés) — les fiches locasyst ont un contenu long, donc on reste large.
const ROW_STEP = 260

const nodes: FlooowNode[] = []
const edges: FlooowEdge[] = []
const idByCode = new Map<string, string>()

// Une option de périmètre par valeur RÉELLEMENT utilisée par le catalogue (ordre des libellés).
const usedPerimeters = new Set(
  RAW.flatMap((m) => m.features.map((f) => f.perimeter)).filter((p): p is RawPerimeter => p != null),
)
const perimeterOptions: FeatureOption[] = (Object.keys(PERIMETER_LABELS) as RawPerimeter[])
  .filter((p) => usedPerimeters.has(p))
  .map((p) => ({ id: `opt-perimeter-${p}`, fieldId: FIELD_PERIMETER, name: PERIMETER_LABELS[p] }))

RAW.forEach((mod, i) => {
  const x = i * COL_STEP
  const moduleNode = createModule({
    name: `${mod.code} · ${mod.name}`,
    position: { x, y: 0 },
    attrs: { name: `${mod.code} · ${mod.name}`, description: '', notes: '' },
  })
  nodes.push(moduleNode)
  mod.features.forEach((f, k) => {
    const feat = createFeature({
      parentId: moduleNode.id,
      code: f.code,
      name: f.name,
      // Position RELATIVE au module (empilement) : le canvas ajoute l'inset + l'en-tête.
      // Positionnement libre : espacement vertical généreux (les cartes hautes ne se chevauchent pas).
      position: { x: 0, y: k * ROW_STEP },
      attrs: {
        code: f.code,
        name: f.name,
        content: mergeFeatureFields({ description: f.quoi, toConfirm: f.toConfirm }),
        fieldValues: { [FIELD_PERIMETER]: f.perimeter ? `opt-perimeter-${f.perimeter}` : null },
        estimate: '',
      },
    })
    nodes.push(feat)
    idByCode.set(f.code, feat.id)
  })
})

// Arêtes « dépend de » : source = la fonctionnalité, cible = ce dont elle dépend. On ne garde que
// les dépendances vers des codes réellement présents dans le catalogue (référentiel intègre).
for (const mod of RAW) {
  for (const f of mod.features) {
    const sourceId = idByCode.get(f.code)
    if (!sourceId) continue
    for (const dep of f.dependsOn) {
      const targetId = idByCode.get(dep)
      if (!targetId) continue
      edges.push(createEdge({ type: 'dependsOn', source: sourceId, target: targetId }))
    }
  }
}

const base = createEmptyProject('Cadrage locasyst (adapté)')
const doc: ProjectDoc = {
  ...base,
  site: {
    attrs: {
      context:
        'Cadrage par fonctionnalité du site locasyst (LocaReception / Kiloutou), adapté sur Flooow. Source : catalogue .mdx locasyst-api.',
      constraints: [],
      notes: '',
    },
  },
  // `featureFields` vient de createEmptyProject (les deux champs amorcés) ; seules les options
  // sont propres au catalogue. « Branchement sur le site » reste sans option : la donnée n'existe
  // pas dans la source locasyst.
  featureOptions: perimeterOptions,
  nodes,
  edges,
}

// Validation zod (forme). L'intégrité référentielle est couverte par test/io.locasyst.test.ts.
parseProjectDoc(doc)

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), '../fixtures')
mkdirSync(outDir, { recursive: true })
const outFile = resolve(outDir, 'locasyst-project.flooow.json')
writeFileSync(outFile, JSON.stringify(doc, null, 2) + '\n', 'utf8')
console.log(
  `✓ ${outFile}\n  ${RAW.length} modules · ${nodes.length - RAW.length} fonctionnalités · ${edges.length} liens « dépend de »`,
)
