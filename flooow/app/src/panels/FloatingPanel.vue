<script setup lang="ts">
// Coquille commune à TOUS les panneaux flottants (interface.md §Calque de panneaux).
// Style `panel` : fond flou translucide, bord fin, arrondi, double ombre douce. Thème clair
// par défaut, variantes sombres via `prefers-color-scheme` (Tailwind `dark:`).
//
// - `title` optionnel : en-tête discret.
// - `padded` (défaut true) : ajoute un padding interne au corps ; les panneaux « pilule »
//   (ModeSwitcher, ToolDock) le désactivent pour gérer leur propre espacement.
// Les attributs non déclarés (class, role, aria-*) retombent sur la <section> racine.
withDefaults(defineProps<{ title?: string; padded?: boolean }>(), { title: '', padded: true })
</script>

<template>
  <section
    class="floating-panel  bg-primary-300 rounded-xl ">
    <header
      v-if="title"
      class="border-b border-black/6 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:border-white/10 dark:text-zinc-400"
    >
      {{ title }}
    </header>
    <div :class="padded ? 'p-3' : ''">
      <slot />
    </div>
  </section>
</template>
