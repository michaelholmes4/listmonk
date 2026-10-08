<script setup lang="ts">
import { css } from '@codemirror/lang-css'
import { html } from '@codemirror/lang-html'
import { javascript } from '@codemirror/lang-javascript'
import { markdown } from '@codemirror/lang-markdown'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { bracketMatching, HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search'
import { Compartment, EditorState, type Extension } from '@codemirror/state'
import { EditorView, highlightActiveLine, keymap, lineNumbers } from '@codemirror/view'
import { tags } from '@lezer/highlight'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

/**
 * CodeMirror 6 wrapper (HTML, CSS, JS, Markdown). Colours come only from theme tokens, so it
 * follows light/dark with the rest of the UI. `v-model` is the document text.
 */
const props = withDefaults(defineProps<{ lang?: 'html' | 'css' | 'javascript' | 'markdown'; readonly?: boolean }>(), {
  lang: 'html',
  readonly: false,
})
const doc = defineModel<string>({ default: '' })

const host = ref<HTMLElement>()
let view: EditorView | undefined
const editable = new Compartment()

const languages: Record<NonNullable<typeof props.lang>, () => Extension> = { html, css, javascript, markdown }

const highlight = HighlightStyle.define([
  { tag: [tags.tagName, tags.keyword], color: 'var(--link)' },
  { tag: [tags.attributeName, tags.propertyName], color: 'var(--warning-600)' },
  { tag: [tags.string, tags.attributeValue], color: 'var(--success)' },
  { tag: [tags.comment, tags.meta], color: 'var(--muted-foreground)', fontStyle: 'italic' },
  { tag: [tags.number, tags.bool, tags.atom], color: 'var(--chart-4)' },
  { tag: tags.heading, color: 'var(--foreground)', fontWeight: '600' },
  { tag: tags.invalid, color: 'var(--destructive)' },
])

const theme = EditorView.theme({
  '&': { color: 'var(--foreground)', backgroundColor: 'transparent', fontSize: '0.8125rem', height: '100%' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', lineHeight: '1.5' },
  '.cm-gutters': { backgroundColor: 'transparent', color: 'var(--muted-foreground)', border: 'none' },
  '.cm-activeLine': { backgroundColor: 'color-mix(in oklab, var(--muted) 60%, transparent)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent' },
  '.cm-cursor': { borderLeftColor: 'var(--foreground)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
    backgroundColor: 'color-mix(in oklab, var(--primary) 25%, transparent)',
  },
})

onMounted(() => {
  view = new EditorView({
    parent: host.value,
    state: EditorState.create({
      doc: doc.value,
      extensions: [
        lineNumbers(),
        history(),
        highlightActiveLine(),
        bracketMatching(),
        highlightSelectionMatches(),
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
        languages[props.lang](),
        syntaxHighlighting(highlight),
        theme,
        EditorView.lineWrapping,
        editable.of([EditorView.editable.of(!props.readonly), EditorState.readOnly.of(props.readonly)]),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) doc.value = u.state.doc.toString()
        }),
      ],
    }),
  })
})

// Parent-driven changes (e.g. the generated form HTML) replace the document.
watch(doc, (v) => {
  if (view && v !== view.state.doc.toString()) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: v } })
})
watch(
  () => props.readonly,
  (ro) => view?.dispatch({ effects: editable.reconfigure([EditorView.editable.of(!ro), EditorState.readOnly.of(ro)]) }),
)

onBeforeUnmount(() => view?.destroy())
</script>

<template>
  <div ref="host" class="box min-h-24 overflow-hidden bg-card" />
</template>
