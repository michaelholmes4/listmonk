<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { MediaFile } from '@/api/types'
import MediaPickerDialog from '@/features/media/MediaPickerDialog.vue'
import { fixTemplateQuotes } from './builder'

/**
 * The drag-and-drop email builder. It is a separate React app (built by `make build-email-builder`
 * and served by the backend), so it lives in an iframe and is driven through `window.EmailBuilder`.
 * The builder owns its own look; only the frame around it follows the theme.
 */
const props = defineProps<{ source: string | null; body: string; height?: string; disabled?: boolean }>()
const emit = defineEmits<{ change: [value: { source: string; body: string }] }>()

const BUILDER_URL = '/admin/static/email-builder/email-builder.umd.js'
const CONTAINER = 'visual-editor-container'

interface Builder {
  render(id: string, opts: { data: unknown; onChange: (data: unknown, html: string) => void }): void
  resetDocument(doc: unknown): void
  isRendered(id: string): boolean
}

const { t } = useI18n()
const frame = ref<HTMLIFrameElement>()
const mediaOpen = ref(false)

const srcdoc = `<!DOCTYPE html><html><head><style>body{margin:0;padding:0}#${CONTAINER}{width:100%;height:100%}</style></head>
<body><div id="${CONTAINER}"></div><script src="${BUILDER_URL}">${"</"}script></body></html>`

const builder = () => (frame.value?.contentWindow as (Window & { EmailBuilder?: Builder }) | null | undefined)?.EmailBuilder

function onChange(data: unknown, html: string) {
  const source = JSON.stringify(data)
  // The builder reports once after loading a document; if that is what we already hold, say nothing
  // so opening a campaign doesn't make it look edited.
  if (source === props.source && props.body) return
  emit('change', { source, body: fixTemplateQuotes(html) })
}

function parse(source: string | null) {
  try {
    return source ? JSON.parse(source) : null
  } catch {
    return null
  }
}

/** Load a document into the builder (first render, or importing a visual template). */
function reset(doc: unknown) {
  const b = builder()
  if (!b) return
  if (!b.isRendered(CONTAINER)) b.render(CONTAINER, { data: {}, onChange })
  if (!doc) return
  // resetDocument fires onChange, which is what produces the HTML for a document we were handed.
  // The first render is asynchronous, so wait for the builder's DOM before replacing the document.
  let tries = 0
  const timer = window.setInterval(() => {
    const el = frame.value?.contentDocument?.getElementById(CONTAINER)
    if (el?.hasChildNodes() || ++tries > 50) {
      window.clearInterval(timer)
      if (el?.hasChildNodes()) b.resetDocument(doc)
    }
  }, 100)
}
defineExpose({ reset })

// The builder asks its host for an image by posting a message; the answer goes into its URL input.
function onMessage(e: MessageEvent) {
  if (e.source === frame.value?.contentWindow && e.data === 'visualeditor.select-media') mediaOpen.value = true
}

function onMedia(file: MediaFile) {
  const input = frame.value?.contentDocument?.querySelector<HTMLInputElement>('.image-url input')
  if (!input) return
  // React ignores a plain `.value =`; go through the native setter so it sees an input event.
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set?.call(input, file.url)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

onMounted(() => {
  window.addEventListener('message', onMessage)
  const f = frame.value!
  f.onload = () => reset(parse(props.source))
  f.srcdoc = srcdoc
})
onBeforeUnmount(() => window.removeEventListener('message', onMessage))
</script>

<template>
  <div class="overflow-hidden rounded-md border bg-white" :class="disabled && 'pointer-events-none opacity-60'" data-cy="visual-editor">
    <iframe ref="frame" :title="t('campaigns.visual')" class="block w-full border-0" :style="{ height: height ?? '65vh', minHeight: '500px' }" />
    <MediaPickerDialog v-model:open="mediaOpen" @select="onMedia" />
  </div>
</template>
