// Composants enregistrés GLOBALEMENT dans main.ts (app.component). Cette déclaration
// donne l'autocomplete et le typage des props à Volar/vue-tsc dans tous les templates.
import type SvgIcon from '@/panels/SvgIcon.vue'

declare module 'vue' {
  interface GlobalComponents {
    SvgIcon: typeof SvgIcon
  }
}

export {}
