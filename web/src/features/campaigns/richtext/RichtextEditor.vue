<script setup lang="ts">
import Editor from '@tinymce/tinymce-vue'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Editor as TinyEditor, EditorOptions } from 'tinymce'
import CodeEditor from '@/components/CodeEditor.vue'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { useTheme } from '@/composables/useTheme'
import MediaPickerDialog from '@/features/media/MediaPickerDialog.vue'
import { beautifyHTML } from '../convert'
import { extendDialogs } from './dialogs'
import { loadSkin, loadTinyMCE, TINYMCE_PLUGINS } from './tinymce'

/**
 * WYSIWYG editor (TinyMCE 7, self-hosted). Beyond the stock editor: a source-code dialog, "insert
 * HTML", the media library as the image picker, link tracking and inline-image embedding.
 * `save` and `preview` are emitted for Ctrl+S / F9, which the page can't see inside the editor frame.
 */
const props = defineProps<{ disabled?: boolean }>()
const emit = defineEmits<{ save: []; preview: [] }>()
const body = defineModel<string>({ required: true })

const { t } = useI18n()
const theme = useTheme()
const dark = computed(() => theme.state.value === 'dark')

// --- Loading: the library and the skin for the current theme. A theme change re-creates the editor. --
const ready = ref(false)
const generation = ref(0)
const SKIN_ID = 'tinymce-skin'
let contentCss = ''

async function prepare() {
  ready.value = false
  await loadTinyMCE()
  const skin = await loadSkin(dark.value)
  contentCss = skin.content
  // The UI skin is page-level CSS (toolbars, dialogs); one <style>, swapped when the theme changes.
  let el = document.getElementById(SKIN_ID) as HTMLStyleElement | null
  if (!el) {
    el = document.createElement('style')
    el.id = SKIN_ID
    document.head.appendChild(el)
  }
  el.textContent = `${skin.ui}\n${TOKEN_OVERRIDES}`
  generation.value += 1
  ready.value = true
}

// Align the editor chrome with the app's tokens (surfaces, border, radius); the rest is the oxide skin.
const TOKEN_OVERRIDES = `
.tox.tox-tinymce { border: 1px solid var(--border); border-radius: var(--radius-lg); font-family: inherit; }
.tox .tox-editor-header, .tox .tox-toolbar-overlord, .tox .tox-toolbar__primary, .tox .tox-statusbar { background: var(--card); }
.tox .tox-edit-area__iframe { background: var(--background); }
.tox-tinymce-aux, .tox .tox-dialog { font-family: inherit; }
.tox-silver-sink { z-index: 100; }
`
prepare()
watch(dark, prepare)
onBeforeUnmount(() => document.getElementById(SKIN_ID)?.remove())

// --- Media library as the image picker. --------------------------------------------------------------
const mediaOpen = ref(false)
let pickImage: ((url: string) => void) | undefined

// --- Source code and "insert HTML" dialogs. -----------------------------------------------------------
let editor: TinyEditor | undefined
const sourceOpen = ref(false)
const source = ref('')
const insertOpen = ref(false)
const snippet = ref('')

function applySource() {
  body.value = source.value
  editor?.setContent(source.value)
  sourceOpen.value = false
}
function insertSnippet() {
  editor?.execCommand('mceInsertContent', false, snippet.value)
  snippet.value = ''
  insertOpen.value = false
}

// --- Editor configuration. --------------------------------------------------------------------------
function contentStyle() {
  const css = getComputedStyle(document.documentElement)
  const tok = (n: string) => css.getPropertyValue(n).trim()
  return `${contentCss}
    body { font-family: ${getComputedStyle(document.body).fontFamily}; font-size: 15px; background: ${tok('--background')}; color: ${tok('--foreground')}; }
    img { max-width: 100%; }
    img.img-float-left { float: left; margin: 0 1em 1em 0; }
    img.img-float-right { float: right; margin: 0 0 1em 1em; }
    a { color: ${tok('--link')}; }
    table, td { border-color: ${tok('--border')}; }`
}

const init = computed<Partial<EditorOptions>>(() => ({
  license_key: 'gpl',
  promotion: false,
  branding: false,
  menubar: false,
  skin: false,
  // `false` is valid at runtime (do not load a skin's content CSS) but missing from the typings.
  content_css: false as unknown as string[],
  content_style: ready.value ? contentStyle() : '',
  plugins: TINYMCE_PLUGINS,
  toolbar: [
    'undo redo | blocks styles fontsize | bold italic underline strikethrough forecolor backcolor subscript superscript',
    '| alignleft aligncenter alignright alignjustify | bullist numlist table image insert-html | outdent indent | link hr removeformat | html fullscreen',
  ].join(' '),
  toolbar_mode: 'wrap',
  toolbar_sticky: true,
  font_size_formats: '10px 11px 12px 14px 15px 16px 18px 24px 36px',
  min_height: 480,
  autoresize_bottom_margin: 24,
  browser_spellcheck: true,
  entity_encoding: 'raw',
  convert_urls: true,
  relative_urls: false,
  remove_script_host: false,
  // The classic editor allowed arbitrary attributes on images (data-embed, width, ...).
  extended_valid_elements: 'img[*]',
  image_advtab: true,
  image_class_list: [
    { title: t('globals.terms.none'), value: '' },
    { title: 'Float left', value: 'img-float-left' },
    { title: 'Float right', value: 'img-float-right' },
  ],
  file_picker_types: 'image',
  file_picker_callback: (callback: (url: string) => void) => {
    pickImage = callback
    mediaOpen.value = true
  },
  setup: (ed: TinyEditor) => {
    editor = ed
    ed.addShortcut('ctrl+s', 'Save content', () => emit('save'))
    ed.addShortcut('f9', 'Preview', () => emit('preview'))
    ed.on('init', () => {
      ed.focus()
      extendDialogs(ed, { trackLink: t('web.campaigns.trackLink'), embedImage: t('media.embed') }, (html) => (body.value = html))
    })
    ed.ui.registry.addButton('html', {
      icon: 'sourcecode',
      tooltip: t('web.campaigns.sourceCode'),
      onAction: () => {
        source.value = body.value
        sourceOpen.value = true
      },
    })
    ed.ui.registry.addButton('insert-html', {
      icon: 'code-sample',
      tooltip: t('web.campaigns.insertHTML'),
      onAction: () => (insertOpen.value = true),
    })
    ed.on('CloseWindow', () => ed.selection.getNode()?.scrollIntoView(false))
  },
}))
</script>

<template>
  <div data-cy="richtext">
    <Skeleton v-if="!ready" class="h-[480px] w-full" />
    <Editor v-else :key="generation" v-model="body" :disabled="props.disabled" :init="init" license-key="gpl" />

    <Dialog v-model:open="sourceOpen">
      <DialogContent class="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{{ t('web.campaigns.sourceCode') }}</DialogTitle>
          <DialogDescription class="sr-only">{{ t('web.campaigns.sourceCode') }}</DialogDescription>
        </DialogHeader>
        <CodeEditor v-model="source" lang="html" class="h-[55vh]" />
        <DialogFooter>
          <Button type="button" variant="outline" @click="source = beautifyHTML(source)">{{ t('campaigns.formatHTML') }}</Button>
          <Button type="button" variant="outline" @click="sourceOpen = false">{{ t('globals.buttons.close') }}</Button>
          <Button type="button" data-cy="btn-source-save" @click="applySource">{{ t('globals.buttons.save') }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="insertOpen">
      <DialogContent class="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{{ t('web.campaigns.insertHTML') }}</DialogTitle>
          <DialogDescription class="sr-only">{{ t('web.campaigns.insertHTML') }}</DialogDescription>
        </DialogHeader>
        <CodeEditor v-model="snippet" lang="html" class="h-[40vh]" />
        <DialogFooter>
          <Button type="button" variant="outline" @click="snippet = beautifyHTML(snippet)">{{ t('campaigns.formatHTML') }}</Button>
          <Button type="button" variant="outline" @click="insertOpen = false">{{ t('globals.buttons.close') }}</Button>
          <Button type="button" @click="insertSnippet">{{ t('globals.buttons.insert') }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <MediaPickerDialog v-model:open="mediaOpen" @select="(m) => pickImage?.(m.url ?? '')" />
  </div>
</template>
