// Router : hub d'arrivée (/) puis éditeur d'un fichier de projet (/p/:folder/:file/:mode?).
// history mode ; fallback → hub. Le fallback SPA côté Caddy container viendra plus tard.
//
// `mode` est optionnel : /p/:folder/:file (lien émis par le hub) ouvre le canvas, et useRouteSync
// canonicalise l'URL en /p/:folder/:file/canvas. La couche du canvas voyage en query
// (?layer=functional) — voir composables/useRouteSync.
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import HubView from '@/views/HubView.vue'
import EditorView from '@/views/EditorView.vue'

const routes: RouteRecordRaw[] = [
  { path: '/', name: 'hub', component: HubView },
  {
    path: '/p/:folder/:file/:mode(canvas|specs|api)?',
    name: 'editor',
    component: EditorView,
    // `mode` est LU par useRouteSync, pas passé en prop : l'exposer ici le ferait retomber en
    // attribut sur la racine d'EditorView (fallthrough).
    props: (route) => ({ folder: String(route.params.folder), file: String(route.params.file) }),
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
})
