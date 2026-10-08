// Self-hosted TinyMCE 7 (GPL, no Tiny Cloud key). Loaded on demand: it is large and only the
// rich-text editor needs it. Importing these modules registers the editor, theme, icons and
// plugins on `window.tinymce`, which `@tinymce/tinymce-vue` then uses instead of fetching a script.

export const TINYMCE_PLUGINS = [
  'anchor',
  'autolink',
  'autoresize',
  'charmap',
  'emoticons',
  'fullscreen',
  'image',
  'link',
  'lists',
  'searchreplace',
  'table',
  'visualblocks',
  'visualchars',
  'wordcount',
]

let loading: Promise<void> | undefined

export function loadTinyMCE(): Promise<void> {
  loading ??= (async () => {
    await import('tinymce')
    await Promise.all([
      import('tinymce/models/dom'),
      import('tinymce/themes/silver'),
      import('tinymce/icons/default'),
      import('tinymce/plugins/anchor'),
      import('tinymce/plugins/autolink'),
      import('tinymce/plugins/autoresize'),
      import('tinymce/plugins/charmap'),
      import('tinymce/plugins/emoticons'),
      import('tinymce/plugins/emoticons/js/emojis'),
      import('tinymce/plugins/fullscreen'),
      import('tinymce/plugins/image'),
      import('tinymce/plugins/link'),
      import('tinymce/plugins/lists'),
      import('tinymce/plugins/searchreplace'),
      import('tinymce/plugins/table'),
      import('tinymce/plugins/visualblocks'),
      import('tinymce/plugins/visualchars'),
      import('tinymce/plugins/wordcount'),
    ])
  })()
  return loading
}

/** The editor UI skin and the in-iframe content styles for the current light/dark mode. */
export async function loadSkin(dark: boolean): Promise<{ ui: string; content: string }> {
  const [ui, uiContent, content] = await Promise.all(
    dark
      ? [
          import('tinymce/skins/ui/oxide-dark/skin.min.css?inline'),
          import('tinymce/skins/ui/oxide-dark/content.min.css?inline'),
          import('tinymce/skins/content/dark/content.min.css?inline'),
        ]
      : [
          import('tinymce/skins/ui/oxide/skin.min.css?inline'),
          import('tinymce/skins/ui/oxide/content.min.css?inline'),
          import('tinymce/skins/content/default/content.min.css?inline'),
        ],
  )
  return { ui: ui.default, content: `${uiContent.default}\n${content.default}` }
}
