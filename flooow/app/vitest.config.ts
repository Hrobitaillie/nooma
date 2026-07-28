import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@flooow/core': fileURLToPath(new URL('../packages/core/src', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['test/**/*.{test,spec}.ts', 'src/**/*.{test,spec}.ts'],
    coverage: {
      provider: 'v8',
      include: ['../packages/core/src/domain/**', '../packages/core/src/model/**'],
      reporter: ['text', 'html'],
    },
  },
})
