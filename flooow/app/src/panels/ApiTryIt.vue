<script setup lang="ts">
// Console d'essai d'UN endpoint (vue API) : panneau sombre façon readme.io —
// URL éditable, headers/corps optionnels, envoi via le proxy serveur, réponse
// mise en forme et snippet curl. L'auth vient du parent (mémorisée par service).
import { computed, ref } from 'vue'
import {
  applyAuth,
  buildCurl,
  joinUrl,
  parseHeaderLines,
  prettyBody,
  sendRequest,
  type PreparedRequest,
  type ProxyResponse,
  type ServiceAuth,
} from '@/io/apiTester'

const props = defineProps<{
  method: string
  path: string
  baseUrl: string
  auth: ServiceAuth
  /** false = rôle client (lecture seule) : le proxy refuserait, on désactive l'envoi. */
  canSend: boolean
}>()

const path = ref(props.path)
const headersText = ref('')
const bodyText = ref('')
const showOptions = ref(false)
const showCurl = ref(false)
const pending = ref(false)
const response = ref<ProxyResponse | null>(null)
const error = ref('')
const copied = ref(false)

const hasBody = computed(() => !['GET', 'HEAD'].includes(props.method.toUpperCase()))

/** Requête telle qu'elle partira (auth appliquée) — sert à l'envoi ET au curl. */
const prepared = computed<PreparedRequest>(() =>
  applyAuth(
    {
      method: props.method.toUpperCase(),
      url: joinUrl(props.baseUrl, path.value),
      headers: {
        ...(hasBody.value && bodyText.value.trim() ? { 'Content-Type': 'application/json' } : {}),
        ...parseHeaderLines(headersText.value),
      },
      body: hasBody.value && bodyText.value.trim() ? bodyText.value : null,
    },
    props.auth,
  ),
)

const curl = computed(() => buildCurl(prepared.value))

const statusTone = computed(() => {
  const s = response.value?.status ?? 0
  if (s >= 200 && s < 300) return 'bg-emerald-500/20 text-emerald-300'
  if (s >= 300 && s < 400) return 'bg-sky-500/20 text-sky-300'
  return 'bg-rose-500/20 text-rose-300'
})

const responseBody = computed(() => {
  if (!response.value) return ''
  const pretty = prettyBody(response.value.body)
  return pretty.length > 20_000 ? `${pretty.slice(0, 20_000)}\n… (affichage tronqué)` : pretty
})

async function send(): Promise<void> {
  pending.value = true
  error.value = ''
  response.value = null
  try {
    response.value = await sendRequest(prepared.value)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Échec de la requête.'
  } finally {
    pending.value = false
  }
}

async function copyCurl(): Promise<void> {
  try {
    await navigator.clipboard.writeText(curl.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  } catch {
    /* clipboard refusé : le snippet reste sélectionnable à la main */
  }
}
</script>

<template>
  <div class="overflow-hidden rounded-lg bg-slate-900 text-xs text-slate-100">
    <!-- Barre de requête -->
    <div class="flex items-center gap-2 px-3 py-2">
      <span class="shrink-0 font-mono font-bold uppercase text-sky-300">{{ method }}</span>
      <input
        v-model="path"
        class="min-w-0 flex-1 rounded-sm border border-slate-700 bg-slate-800 px-2 py-1 font-mono text-slate-100 outline-none focus:border-slate-500"
        spellcheck="false"
      />
      <button
        type="button"
        class="shrink-0 rounded-sm bg-sky-600 px-3 py-1 font-medium text-white enabled:hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
        :disabled="pending || !canSend"
        :title="canSend ? 'Envoyer la requête (via le serveur Flooow)' : 'Rôle lecture seule : essai désactivé'"
        @click="send"
      >
        {{ pending ? '…' : 'Envoyer' }}
      </button>
    </div>
    <p class="truncate px-3 pb-2 font-mono text-[10px] text-slate-500" :title="prepared.url">
      → {{ prepared.url }}
    </p>

    <!-- Options (headers / corps) et curl -->
    <div class="border-t border-slate-800 px-3 py-1.5">
      <button type="button" class="mr-3 text-slate-400 hover:text-slate-200" @click="showOptions = !showOptions">
        {{ showOptions ? '▾' : '▸' }} Headers{{ hasBody ? ' & corps' : '' }}
      </button>
      <button type="button" class="text-slate-400 hover:text-slate-200" @click="showCurl = !showCurl">
        {{ showCurl ? '▾' : '▸' }} curl
      </button>
    </div>
    <div v-if="showOptions" class="space-y-2 border-t border-slate-800 px-3 py-2">
      <label class="block">
        <span class="mb-1 block text-[10px] text-slate-400">Headers additionnels — un par ligne, « Nom: valeur »</span>
        <textarea
          v-model="headersText"
          rows="2"
          class="w-full rounded-sm border border-slate-700 bg-slate-800 px-2 py-1 font-mono text-slate-100 outline-none focus:border-slate-500"
          placeholder="Accept: application/json"
          spellcheck="false"
        ></textarea>
      </label>
      <label v-if="hasBody" class="block">
        <span class="mb-1 block text-[10px] text-slate-400">Corps de la requête</span>
        <textarea
          v-model="bodyText"
          rows="4"
          class="w-full rounded-sm border border-slate-700 bg-slate-800 px-2 py-1 font-mono text-slate-100 outline-none focus:border-slate-500"
          placeholder="{ … }"
          spellcheck="false"
        ></textarea>
      </label>
    </div>
    <div v-if="showCurl" class="relative border-t border-slate-800">
      <pre class="overflow-x-auto px-3 py-2 font-mono text-[10px] leading-relaxed text-slate-300">{{ curl }}</pre>
      <button
        type="button"
        class="absolute right-2 top-2 rounded-sm bg-slate-700 px-2 py-0.5 text-[10px] text-slate-200 hover:bg-slate-600"
        @click="copyCurl"
      >
        {{ copied ? 'Copié ✓' : 'Copier' }}
      </button>
    </div>

    <!-- Réponse -->
    <div v-if="error" class="border-t border-slate-800 px-3 py-2 text-rose-300">{{ error }}</div>
    <div v-else-if="response" class="border-t border-slate-800">
      <div class="flex items-center gap-2 px-3 py-2">
        <span class="rounded-sm px-1.5 py-0.5 font-mono font-semibold" :class="statusTone">
          {{ response.status }} {{ response.statusText }}
        </span>
        <span class="text-slate-400">{{ response.durationMs }} ms</span>
        <span v-if="response.truncated" class="text-amber-300">réponse tronquée (&gt; 2 Mo)</span>
      </div>
      <pre
        v-if="responseBody"
        class="max-h-80 overflow-auto border-t border-slate-800 px-3 py-2 font-mono text-[11px] leading-relaxed text-slate-200"
        >{{ responseBody }}</pre
      >
    </div>
  </div>
</template>
