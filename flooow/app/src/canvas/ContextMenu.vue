<script setup lang="ts">
// Menu contextuel (clic droit, evolution-v2.md §3) : Supprimer (cascade + confirm géré en amont),
// Définir page d'accueil (page), Changer le type (bloc → BlockType).
import { computed, ref } from 'vue'
import { useProjectStore } from '@/stores/project'
import { BLOCK_TYPES, isBlock, isPage, type BlockType } from '@flooow/core/model/types'

const props = defineProps<{ x: number; y: number; nodeId: string }>()
const emit = defineEmits<{
  (e: 'delete'): void
  (e: 'set-home'): void
  (e: 'set-block-type', type: BlockType): void
  (e: 'comment'): void
  (e: 'close'): void
}>()

const store = useProjectStore()
const node = computed(() => store.nodeById(props.nodeId))
const submenu = ref<'block' | null>(null)
</script>

<template>
  <div
    v-if="node"
    class="context-menu fixed z-50 min-w-[180px] rounded-md border border-slate-200 bg-white py-1 shadow-lg"
    :style="{ left: `${x}px`, top: `${y}px` }"
    @pointerdown.stop
    @contextmenu.prevent
  >
    <button
      v-if="isPage(node)"
      class="row"
      @click="emit('set-home')"
    >🏠 Définir comme page d’accueil</button>

    <!-- Changer le type de bloc -->
    <div v-if="isBlock(node)" class="relative">
      <button class="row justify-between" @click="submenu = submenu === 'block' ? null : 'block'">
        ▤ Changer le type <span class="text-slate-400">›</span>
      </button>
      <div
        v-if="submenu === 'block'"
        class="absolute left-full top-0 ml-1 min-w-[130px] rounded-md border border-slate-200 bg-white py-1 shadow-lg"
      >
        <button
          v-for="bt in BLOCK_TYPES"
          :key="bt"
          class="row"
          :class="{ 'font-semibold text-sky-600': bt === node.attrs.blockType }"
          @click="emit('set-block-type', bt)"
        >{{ bt }}</button>
      </div>
    </div>

    <!-- Commenter (v13) : pages et blocs — les seules ancres permises par le modèle Comment. -->
    <template v-if="isPage(node) || isBlock(node)">
      <div class="my-1 border-t border-slate-100"></div>
      <button class="row" @click="emit('comment')">💬 Commenter</button>
    </template>

    <div class="my-1 border-t border-slate-100"></div>
    <button class="row text-red-600 hover:bg-red-50" @click="emit('delete')">
      🗑 Supprimer
    </button>
  </div>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  width: 100%;
  padding: 0.375rem 0.75rem;
  text-align: left;
  font-size: 0.75rem;
  color: #334155;
}
.row:hover {
  background: #f0f9ff;
}
</style>
