// Link tracking and inline-image embedding, added as checkboxes to TinyMCE's link and image
// dialogs. Both are encoded in the HTML itself, which is what the sender reads:
//   - a tracked link ends in "@TrackLink"
//   - an embedded image carries data-embed="true"
// TinyMCE dialog specs are loosely typed objects, hence the `any`s in this file.
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Editor } from 'tinymce'

export const TRACK_LINK = 'trackLink'
export const TRACK_SUFFIX = '@TrackLink'
export const EMBED_IMAGE = 'embedImage'

/** Adds `checkbox` to the "general" tab of a tabbed dialog, or to a plain one. */
export function withDialogCheckbox(body: any, checkbox: any) {
  if (body.type === 'tabpanel') {
    return {
      ...body,
      tabs: body.tabs.map((tab: any) => (tab.name === 'general' || tab.title === 'General' ? { ...tab, items: [...tab.items, checkbox] } : tab)),
    }
  }
  return { ...body, items: [...body.items, checkbox] }
}

/** The image under the cursor (or inside the selected figure), if any. */
export function selectedImage(editor: Editor): HTMLImageElement | null {
  const node = editor.selection.getNode()
  if (!node) return null
  if (node.nodeName === 'IMG') return node as HTMLImageElement
  const figure = editor.dom.getParent(node, 'figure.image')
  return figure ? figure.querySelector('img') : null
}

interface Labels {
  trackLink: string
  embedImage: string
}

/**
 * Wraps `editor.windowManager.open` so link and image dialogs get their extra checkbox.
 * `onChange` is called with the new HTML after an image's embed flag changes (TinyMCE doesn't
 * report attribute edits made outside its own dialog flow).
 */
export function extendDialogs(editor: Editor, labels: Labels, onChange: (html: string) => void) {
  const wm = editor.windowManager as any
  const open = wm.open

  wm.open = (spec: any, params: any) => {
    const data = spec.initialData ?? {}
    const isLink = data.url && 'anchor' in data
    const isImage = data.src && !isLink
    if (!isLink && !isImage) return open.call(wm, spec, params)

    const { onSubmit } = spec
    const checkbox = isLink
      ? { type: 'checkbox', name: TRACK_LINK, label: labels.trackLink }
      : { type: 'checkbox', name: EMBED_IMAGE, label: labels.embedImage }
    const out = { ...spec, body: withDialogCheckbox(spec.body, checkbox) }

    if (isLink) {
      const cleanURL = (data.url.value || '').replace(/@TrackLink$/, '')
      // Remember the user's last choice for new links.
      let remembered = false
      try {
        remembered = JSON.parse(localStorage.getItem(TRACK_LINK) || 'false')
      } catch {
        /* unreadable storage: default to off */
      }
      const checked = data.url.value !== cleanURL || (!cleanURL && remembered)
      out.initialData = { ...data, [TRACK_LINK]: checked, url: { ...data.url, value: cleanURL } }
      out.onSubmit = (api: any) => {
        const d = api.getData()
        const shouldTrack = Boolean(d[TRACK_LINK])
        const url = (d.url.value || '').replace(/@TrackLink$/, '')
        try {
          localStorage.setItem(TRACK_LINK, JSON.stringify(shouldTrack))
        } catch {
          /* ignore */
        }
        // Only web links can be tracked.
        if (shouldTrack && /^https?:\/\//i.test(url)) api.setData({ url: { ...d.url, value: `${url}${TRACK_SUFFIX}` } })
        onSubmit(api)
      }
    } else {
      const img = selectedImage(editor)
      out.initialData = { ...data, [EMBED_IMAGE]: Boolean(img?.hasAttribute('data-embed')) }
      out.onSubmit = (api: any) => {
        const d = api.getData()
        const shouldEmbed = d[EMBED_IMAGE] === true || d[EMBED_IMAGE] === 'true'
        onSubmit(api)

        const node = img && editor.getBody().contains(img) ? img : selectedImage(editor)
        if (!node) return
        if (shouldEmbed) editor.dom.setAttrib(node, 'data-embed', 'true')
        else node.removeAttribute('data-embed')
        editor.save()
        onChange(editor.getContent())
      }
    }

    return open.call(wm, out, params)
  }
}
