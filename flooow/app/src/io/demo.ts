// Chargement du projet de démo (evolution-v2.md §5).
// Importe app/fixtures/demo-project.flooow.json (format v2), le repasse par le pipeline de
// validation (validateProjectDoc : migration → zod .strict() → invariants) en garde de sécurité,
// puis charge le document dans le store project.
import demoDoc from '../../fixtures/demo-project.flooow.json'
import locasystDoc from '../../fixtures/locasyst-project.flooow.json'
import { validateProjectDoc } from '@/io/file'
import { useProjectStore } from '@/stores/project'

/**
 * Charge le projet de démonstration « Portail client B2B » dans le store project.
 *
 * Le JSON embarqué est revalidé à l'exécution (garde-fou : il ne doit jamais entrer dans le
 * store sans passer la même validation qu'un fichier ouvert par l'utilisateur).
 *
 * @param options.confirmIfDirty callback appelé si le projet courant a des modifications non
 *   enregistrées ; renvoyer `false` annule le chargement. Par défaut on écrase sans confirmer.
 */
export async function loadDemoProject(options?: {
  confirmIfDirty?: () => boolean | Promise<boolean>
}): Promise<void> {
  const project = useProjectStore()

  if (project.dirty && options?.confirmIfDirty) {
    const proceed = await options.confirmIfDirty()
    if (!proceed) return
  }

  // Garde de sécurité : même pipeline que l'ouverture d'un fichier non fiable.
  const doc = validateProjectDoc(demoDoc)
  project.load(doc)
}

/**
 * Charge le cadrage locasyst adapté (couche fonctionnelle : modules 00→08, fonctionnalités et liens
 * « dépend de »). Même garde de validation que la démo. Le passage en mode Fonctionnalités est fait
 * par l'appelant (l'UI), le store restant agnostique de l'affichage.
 */
export async function loadLocasystProject(options?: {
  confirmIfDirty?: () => boolean | Promise<boolean>
}): Promise<void> {
  const project = useProjectStore()

  if (project.dirty && options?.confirmIfDirty) {
    const proceed = await options.confirmIfDirty()
    if (!proceed) return
  }

  const doc = validateProjectDoc(locasystDoc)
  project.load(doc)
}
