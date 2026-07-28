// Export Markdown : cahier des specs + contrat d'API. Consomme les MÊMES dérivateurs que les
// vues (derive/specs, derive/api) — un seul dérivateur, deux rendus (architecture.md).
//
// Sécurité (securite.md §1) : tout texte UTILISATEUR est échappé là où un caractère de contrôle
// Markdown casserait la structure — titres (#, retours ligne) et cellules de tableau (|, retours
// ligne). Les ids sont slugifiés par factory.ts, jamais de texte brut dans une syntaxe active.
import type { ProjectDoc } from '@flooow/core/model/types'
import { deriveSpecs, type SpecsApiNote, type SpecsFeatureRef } from '@flooow/core/domain/derive/specs'
import { deriveApi } from '@flooow/core/domain/derive/api'
import { deriveCatalog, type CatalogFeature, type CatalogFeatureRef } from '@flooow/core/domain/derive/catalog'
import { deriveEstimate, HOURS_PER_DAY, type EstimateTotal } from '@flooow/core/domain/derive/estimate'
import { docToMarkdown } from '@flooow/core/model/richContent'
import { fullRouteOf } from '@flooow/core/domain/routes'
import type { BehaviorNote } from '@flooow/core/model/types'

// ── Échappement ────────────────────────────────────────────────────────────────
/** Neutralise les caractères de contrôle Markdown dans un texte inline utilisateur. */
function esc(value: string | null | undefined): string {
  if (value == null) return ''
  return value
    .replace(/\\/g, '\\\\')
    .replace(/([`*_{}[\]()#+\-!|<>~])/g, '\\$1')
    .replace(/\r?\n/g, ' ') // pas de saut de ligne dans un titre / une puce
    .trim()
}

/** Échappement pour une cellule de tableau : neutralise le pipe et aplatit les sauts de ligne. */
function escCell(value: string | null | undefined): string {
  if (value == null) return ''
  return value.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim()
}

/** Texte de bloc (description, règles) : on préserve le contenu mais on désamorce les titres ATX. */
function escBlock(value: string | null | undefined): string {
  if (value == null) return ''
  return value.replace(/^(#{1,6})(\s)/gm, '\\$1$2').trim()
}

function isoDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function warningsLine(
  incomplete: number,
  orphans: number,
  orphanFeatures: number,
  uncoveredPages: number,
): string {
  const parts: string[] = [`Généré le ${isoDate()} par Flooow`]
  if (incomplete > 0) parts.push(`${incomplete} élément(s) incomplet(s)`)
  if (orphans > 0) parts.push(`${orphans} page(s) orpheline(s)`)
  if (orphanFeatures > 0) parts.push(`${orphanFeatures} fonctionnalité(s) non réalisée(s)`)
  if (uncoveredPages > 0) parts.push(`${uncoveredPages} page(s) sans fonctionnalité`)
  if (incomplete === 0 && orphans === 0 && orphanFeatures === 0 && uncoveredPages === 0)
    parts.push('document complet')
  return `> ${parts.join(' — ')}.`
}

/** Ligne « réalise » : les fonctionnalités couvertes par une page/un bloc (pont realizedBy). */
function appendFeatures(lines: string[], features: SpecsFeatureRef[]): void {
  if (!features.length) return
  const labels = features.map((f) => (f.code ? `${esc(f.code)} ${esc(f.name)}` : esc(f.name)))
  lines.push(`- Réalise : ${labels.join(', ')}`)
}

/** Slug de nom de fichier d'export dérivé du nom du projet (« Mon projet » → mon-projet). */
export function projectSlug(doc: ProjectDoc): string {
  return (
    doc.meta.name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'projet'
  )
}

// ── Cahier des spécifications ─────────────────────────────────────────────────────
/** Cahier des spécifications en Markdown (transversal + pages → blocs → notes). */
export function exportSpecsMarkdown(doc: ProjectDoc): string {
  const specs = deriveSpecs(doc)
  const lines: string[] = []

  lines.push(`# Cahier des spécifications — ${esc(doc.meta.name) || 'Projet'}`)
  lines.push('')
  lines.push(
    warningsLine(
      specs.warnings.incomplete.length,
      specs.warnings.orphans.length,
      specs.warnings.orphanFeatures.length,
      specs.warnings.uncoveredPages.length,
    ),
  )
  lines.push('')

  // Transversal (scope site).
  const t = specs.transversal
  lines.push('## Contexte transversal')
  lines.push('')
  lines.push(t.context ? escBlock(t.context) : '_Aucun contexte renseigné._')
  lines.push('')
  if (t.constraints.length > 0) {
    lines.push('### Contraintes globales')
    lines.push('')
    for (const c of t.constraints) lines.push(`- ${esc(c)}`)
    lines.push('')
  }
  if (t.services.length > 0) {
    lines.push('### Services externes')
    lines.push('')
    for (const s of t.services) {
      const base = s.baseUrl ? ` — \`${escCell(s.baseUrl)}\`` : ''
      lines.push(
        `- **${esc(s.name)}**${base} — auth : ${esc(s.auth) || '—'} — risque : ${s.risk}`,
      )
    }
    lines.push('')
  }

  // Sommaire (ordre spatial).
  if (t.toc.length > 0) {
    lines.push('## Sommaire')
    lines.push('')
    t.toc.forEach((entry, i) => lines.push(`${i + 1}. ${esc(entry.name)}`))
    lines.push('')
  }

  // Fiches par page (roll-up : page → blocs → notes).
  const index = new Map(doc.nodes.map((n) => [n.id, n]))
  for (const page of specs.pages) {
    const route = fullRouteOf(page.page.id, index)
    lines.push(`## ${esc(page.page.attrs.name) || 'Page sans nom'}  (${esc(route)})`)
    const roles = page.page.attrs.roles
    if (roles && roles.length > 0) lines.push(`Accès : ${roles.map(esc).join(', ')}`)
    lines.push('')
    if (page.page.attrs.description) {
      lines.push(escBlock(page.page.attrs.description))
      lines.push('')
    }
    if (page.features.length > 0) {
      appendFeatures(lines, page.features)
      lines.push('')
    }

    for (const block of page.blocks) {
      lines.push(
        `### Bloc — ${esc(block.block.attrs.name) || 'sans nom'} _(${esc(block.blockType)})_`,
      )
      lines.push('')
      // v8 : le contenu du bloc est un document riche — les contraintes et les notes y vivent
      // désormais comme sections, il n'y a plus de `appendConstraints` à faire ici.
      const contenu = docToMarkdown(block.block.attrs.content)
      if (contenu) {
        lines.push(contenu)
        lines.push('')
      }
      appendFeatures(lines, block.features)
      appendBehaviors(lines, block.behaviors)
      appendApis(lines, block.apis)
      lines.push('')
    }

    if (page.behaviors.length > 0) {
      lines.push('### Comportements de la page')
      lines.push('')
      appendBehaviors(lines, page.behaviors)
      lines.push('')
    }
    if (page.apis.length > 0) {
      lines.push('### Appels API de la page')
      lines.push('')
      appendApis(lines, page.apis)
      lines.push('')
    }
    if (page.constraints.length > 0) {
      lines.push('### Contraintes de la page')
      lines.push('')
      appendConstraints(lines, page.constraints)
      lines.push('')
    }
  }

  if (specs.pages.length === 0) {
    lines.push('_Aucune page dans ce projet._')
    lines.push('')
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
}

function appendConstraints(lines: string[], constraints: string[]): void {
  for (const c of constraints) lines.push(`- Contrainte : ${esc(c)}`)
}

function appendBehaviors(lines: string[], behaviors: BehaviorNote[]): void {
  for (const b of behaviors) {
    const facet = b.attrs.facet ? ` [${b.attrs.facet}]` : ''
    const trigger = b.attrs.trigger ? ` — déclencheur : ${esc(b.attrs.trigger)}` : ''
    const hours = b.attrs.hours != null ? ` — ${b.attrs.hours} h` : ''
    lines.push(`- **${esc(b.attrs.name) || 'comportement'}**${facet}${trigger}${hours}`)
    if (b.attrs.rules) lines.push(`  Règles : ${esc(b.attrs.rules)}`)
  }
}

function appendApis(lines: string[], apis: SpecsApiNote[]): void {
  for (const a of apis) {
    lines.push(
      `- Appel API : **${esc(a.serviceName)}** — \`${escCell(a.method)} ${escCell(a.path)}\``,
    )
  }
}

// ── Catalogue des fonctionnalités (« cadrage fusionné ») ──────────────────────────

/** Libellé d'une référence de fonctionnalité (code + nom) pour une cellule / puce. */
function featureLabel(r: CatalogFeatureRef): string {
  return r.code ? `${r.code} ${r.name}` : r.name
}

/** Fourchette d'heures en jours-homme (« 3–3,8 j »). */
function daysRange(t: EstimateTotal): string {
  const d = (h: number) => (h / HOURS_PER_DAY).toLocaleString('fr-FR', { maximumFractionDigits: 1 })
  return t.low === t.high ? `${d(t.low)} j` : `${d(t.low)}–${d(t.high)} j`
}

/**
 * Catalogue des fonctionnalités en Markdown, façon locasyst : par module, une table récapitulative
 * (ID · Fonctionnalité · Lot · un champ de projet par colonne · Dépend de · Est.) suivie d'une fiche détaillée par
 * fonctionnalité (Quoi · Implique · Dépend de · Débloque · Réalisé par · Endpoints · À confirmer).
 */
export function exportCatalogMarkdown(doc: ProjectDoc): string {
  const catalog = deriveCatalog(doc)
  const lines: string[] = []

  lines.push(`# Catalogue des fonctionnalités — ${esc(doc.meta.name) || 'Projet'}`)
  lines.push('')
  const orphans = catalog.orphanFeatures.length
  lines.push(
    `> Généré le ${isoDate()} par Flooow${orphans > 0 ? ` — ${orphans} fonctionnalité(s) non réalisée(s)` : ''}.`,
  )
  lines.push('')

  if (catalog.groups.length === 0) {
    lines.push('_Aucune fonctionnalité dans ce projet._')
    lines.push('')
  }

  // Synthèse de chiffrage (fonctionnalités → jours-homme).
  if (catalog.groups.length > 0) {
    const chiffrage = deriveEstimate(doc).features
    lines.push('## Chiffrage')
    lines.push('')
    lines.push(`Total : **${daysRange(chiffrage.total)}** (fourchette basse–haute).`)
    if (chiffrage.unestimated.length > 0) {
      lines.push('')
      lines.push(`_${chiffrage.unestimated.length} fonctionnalité(s) à estimer._`)
    }
    if (chiffrage.byLot.length > 0) {
      lines.push('')
      lines.push('| Lot | Charge |')
      lines.push('| --- | --- |')
      for (const l of chiffrage.byLot) lines.push(`| ${escCell(l.label)} | ${daysRange(l.total)} |`)
    }
    lines.push('')
  }

  for (const group of catalog.groups) {
    lines.push(`## ${esc(group.moduleName)}`)
    lines.push('')
    if (group.module?.attrs.description) {
      lines.push(escBlock(group.module.attrs.description))
      lines.push('')
    }

    // Table récapitulative du module. Une colonne par champ de projet (v7) : leur nombre et leur
    // libellé viennent du document, d'où l'en-tête et le séparateur construits plutôt qu'écrits.
    const fieldCols = catalog.fields.map((fl) => escCell(fl.label))
    lines.push(`| ID | Fonctionnalité | Lot | ${fieldCols.join(' | ')} | Dépend de | Est. |`)
    lines.push(`| ${Array(5 + fieldCols.length).fill('---').join(' | ')} |`)
    for (const f of group.features) {
      const deps = f.dependsOn.map((d) => escCell(d.code || d.name)).join(', ') || '—'
      const vals = f.fields.map((fv) => escCell(fv.value ?? '—'))
      lines.push(
        `| ${escCell(f.code) || '—'} | ${escCell(f.name)} | L${f.lot} | ${vals.join(' | ')} | ${deps} | ${escCell(f.estimate) || '—'} |`,
      )
    }
    lines.push('')

    // Fiches détaillées.
    for (const f of group.features) appendCatalogCard(lines, f)
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
}

function appendCatalogCard(lines: string[], f: CatalogFeature): void {
  const heading = f.code ? `[${esc(f.code)}] ${esc(f.name)}` : esc(f.name)
  lines.push(`### ${heading}`)
  lines.push('')
  const body = docToMarkdown(f.content)
  if (body) {
    lines.push(body)
    lines.push('')
  }
  if (f.dependsOn.length) {
    lines.push(`- **Dépend de** : ${f.dependsOn.map((d) => esc(featureLabel(d))).join(', ')}`)
  }
  if (f.unlocks.length) {
    lines.push(`- **Débloque** : ${f.unlocks.map((d) => esc(featureLabel(d))).join(', ')}`)
  }
  if (f.realizers.length) {
    lines.push(`- **Réalisé par** : ${f.realizers.map((r) => esc(r.name)).join(', ')}`)
  } else {
    lines.push('- **Réalisé par** : _aucune page/bloc (orpheline)_')
  }
  if (f.endpoints.length) {
    const eps = f.endpoints
      .map((e) => `\`${escCell(e.method)} ${escCell(e.path)}\` (${esc(e.serviceName)})`)
      .join(', ')
    lines.push(`- **Endpoints** : ${eps}`)
  }
  const fieldParts = f.fields.map((fv) => `**${esc(fv.label)}** : ${esc(fv.value ?? '—')}`)
  lines.push(
    [`- **Lot** : L${f.lot}`, ...fieldParts, `**Est.** : ${esc(f.estimate) || '—'}`].join(' — '),
  )
  lines.push('')
}

// ── Contrat d'API ────────────────────────────────────────────────────────────────
/** Contrat d'API en Markdown (par service / URL de base, services à risque élevé en tête). */
export function exportApiMarkdown(doc: ProjectDoc): string {
  const api = deriveApi(doc)
  const lines: string[] = []

  lines.push(`# Contrat d'API — ${esc(doc.meta.name) || 'Projet'}`)
  lines.push('')
  lines.push(`> Généré le ${isoDate()} par Flooow — services à risque élevé en tête.`)
  lines.push('')

  if (api.byService.length === 0) {
    lines.push('_Aucun service au registre._')
    lines.push('')
  }

  for (const group of api.byService) {
    const s = group.service
    lines.push(`## ${esc(s.name) || 'Service'} — risque ${s.risk}`)
    lines.push('')
    if (s.baseUrl) lines.push(`URL de base : \`${escCell(s.baseUrl)}\``)
    if (s.auth) lines.push(`Auth : ${esc(s.auth)}`)
    if (s.notes) lines.push(escBlock(s.notes))
    lines.push('')

    if (group.endpoints.length === 0) {
      lines.push('_Aucun endpoint référencé par une note API._')
      lines.push('')
    }

    for (const usage of group.endpoints) {
      lines.push(`### \`${escCell(usage.method)} ${escCell(usage.path)}\``)
      lines.push('')
      lines.push('| Consommé par | Page | Fonctionnalités |')
      lines.push('| --- | --- | --- |')
      for (const c of usage.consumers) {
        const feats =
          c.features.map((f) => (f.code ? `${f.code} ${f.name}` : f.name)).join(', ') || '—'
        lines.push(
          `| ${escCell(c.targetName)} | ${escCell(c.pageName ?? '—')} | ${escCell(feats)} |`,
        )
      }
      lines.push('')
    }

    if (group.unreferencedEndpoints.length > 0) {
      lines.push('Endpoints déclarés au registre, non référencés :')
      for (const ep of group.unreferencedEndpoints) {
        lines.push(`- \`${escCell(ep.method)} ${escCell(ep.path)}\``)
      }
      lines.push('')
    }
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
}
