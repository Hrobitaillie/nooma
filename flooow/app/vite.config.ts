import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// Cible du serveur Node (Hono + Hocuspocus) sur l'hôte. Le Caddy du container
// reverse-proxy vers Vite (host.containers.internal:VITE_PORT), et Vite relaie
// /api + /collab vers le Node — cf cadrage/05-implementation/multi-user-serveur.md.
const VITE_PORT = Number(process.env.VITE_PORT ?? 5173)
const API_PORT = Number(process.env.API_PORT ?? 3011)
const apiTarget = `http://localhost:${API_PORT}`

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      // Cœur partagé (model + domain) extrait dans packages/core, consommé aussi
      // par le serveur — cf cadrage/05-implementation/multi-user-serveur.md (jalon 5).
      '@flooow/core': fileURLToPath(new URL('../packages/core/src', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
    // yjs DOIT être une instance unique dans le bundle (sinon « Yjs was already
    // imported ») : le core et @hocuspocus/provider doivent partager la même copie.
    dedupe: ['yjs'],
  },
  server: {
    // 0.0.0.0 REQUIS pour être joignable depuis le container via
    // host.containers.internal. Le HMR (wss) passe par le domaine public,
    // le double-proxy Caddy gère l'upgrade — pas de config hmr nécessaire.
    host: '0.0.0.0',
    port: VITE_PORT,
    strictPort: true,
    // Autorise l'API JS Self-Profiling (`new Profiler(...)`) en dev : c'est l'outil d'attribution
    // des coûts de la refonte canvas (baseline phase 0+). Sans cet en-tête, Document Policy la
    // désactive. Dev uniquement — le build de prod n'est pas servi par Vite.
    headers: { 'Document-Policy': 'js-profiling' },
    // Vite bloque par défaut les Host non-IP (durcissement CVE). Derrière le
    // double-proxy Caddy le Host peut être le domaine public → on l'autorise
    // explicitement (le serveur reste protégé par AuthCrunch + pare-feu).
    allowedHosts: ['.pilot-in.net', 'host.containers.internal', 'localhost'],
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true },
      // Temps réel Yjs (Hocuspocus) — WebSocket.
      '/collab': { target: apiTarget, changeOrigin: true, ws: true },
    },
  },
})
