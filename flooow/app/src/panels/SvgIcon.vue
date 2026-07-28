<script setup lang="ts">
// Équivalent Vue du helper PHP `get_svg()` de Pilo'Blocks : rend une icône d'un sprite
// SVG en INLINE (le <symbol> est extrait et injecté, pas de <use>) → l'icône hérite de
// currentColor et se style en CSS/Tailwind, sans sprite à injecter dans le DOM.
//
// Usage :
//   <SvgIcon icon="chevron-right" class="size-4" />       sprite par défaut (project)
//   <SvgIcon icon="project:trash" class="size-4" />       format sprite:id
//   <SvgIcon icon="trash" sprite="autre" />               override du sprite (prioritaire)
//
// Les sprites vivent dans src/assets/sprites/<nom>.svg (un <symbol id="…"> par icône),
// embarqués au build (?raw eager — quelques Ko) et parsés une seule fois (cache module).
import { computed } from 'vue'

const props = defineProps<{
  /** Nom de l'icône : `'id'` (sprite par défaut) ou `'sprite:id'`. */
  icon: string
  /** Sprite à utiliser — prioritaire sur le préfixe `sprite:` de `icon`. */
  sprite?: string
}>()

const DEFAULT_SPRITE = 'project'

const sprites = import.meta.glob('../assets/sprites/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

interface SpriteSymbol {
  attrs: Record<string, string>
  inner: string
}

// Mémoïsé par (sprite, icône) : le scan regex du sprite ne se fait qu'une fois par icône.
const symbolCache = new Map<string, SpriteSymbol | null>()

function parseSymbol(sprite: string, id: string): SpriteSymbol | null {
  const key = `${sprite}:${id}`
  const cached = symbolCache.get(key)
  if (cached !== undefined) return cached

  let parsed: SpriteSymbol | null = null
  const entry = Object.entries(sprites).find(([path]) => path.endsWith(`/${sprite}.svg`))
  if (entry) {
    const match = new RegExp(`<symbol([^>]*id="${id}"[^>]*)>([\\s\\S]*?)</symbol>`).exec(entry[1])
    if (match) {
      const attrs: Record<string, string> = {}
      for (const a of (match[1] as string).matchAll(/([a-zA-Z_:][-\w:.]*)="([^"]*)"/g)) {
        attrs[a[1] as string] = a[2] as string
      }
      delete attrs.id
      parsed = { attrs, inner: (match[2] as string).trim() }
    }
  }
  if (!parsed && import.meta.env.DEV) {
    console.warn(`[SvgIcon] icône introuvable : ${key} (src/assets/sprites/${sprite}.svg)`)
  }
  symbolCache.set(key, parsed)
  return parsed
}

const resolved = computed(() => {
  let sprite = DEFAULT_SPRITE
  let id = props.icon
  const sep = props.icon.indexOf(':')
  if (sep !== -1) {
    sprite = props.icon.slice(0, sep)
    id = props.icon.slice(sep + 1)
  }
  if (props.sprite) sprite = props.sprite
  return parseSymbol(sprite, id)
})
</script>

<template>
  <!-- class/style/attrs de l'appelant fusionnent avec les attributs du symbol (fallthrough). -->
  <svg v-if="resolved" v-bind="resolved.attrs" aria-hidden="true" v-html="resolved.inner" />
</template>
