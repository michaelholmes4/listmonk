import { html as beautify } from 'js-beautify'
import TurndownService from 'turndown'
import htmlToPlainText from 'textversionjs'
import type { ContentType } from './schema'

// Converting between campaign content formats. Most conversions are lossy; the UI asks first.

const turndown = new TurndownService()

/** Trims every line and collapses runs of blank lines (optionally removing them entirely). */
export function trimLines(str: string, removeEmptyLines = false): string {
  const out = str.split('\n').map((l) => (removeEmptyLines || l.trim() === '' ? l.trim() : l))
  return out.join('\n').replace(/\n\s*\n\s*\n/g, '\n\n')
}

/** Reformats HTML into an indented, one-tag-per-line shape that is pleasant in a code editor. */
export function beautifyHTML(str: string): string {
  // Pad all tags (but not inline <a>/<span>) with line breaks, then drop the extras.
  let s = trimLines(str.replace(/(<(?!(\/)?a|span)([^>]+)>)/gi, '\n$1\n'), true)
  s = s.replace(/\n+/g, '\n')
  try {
    return beautify(s, {
      indent_size: 4,
      indent_char: ' ',
      max_preserve_newlines: 2,
      inline: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'b', 'strong', 'span', 'em', 'i', 'code', 'a'],
    }).trim()
  } catch {
    return s
  }
}

/** Plain text alternative of an HTML body (used for the "alternative body"). */
export const htmlToPlain = (body: string) => htmlToPlainText(body)

const htmlToMarkdown = (body: string) => turndown.turndown(body).replace(/\n\n+/g, '\n\n')

/**
 * Markdown to the visual editor's block document: headings become Heading blocks, everything
 * else is grouped into markdown Text blocks.
 */
export function markdownToVisualBlock(markdown: string): Record<string, unknown> {
  const idBase = Date.now()
  const blocks: { id: string; type: string; data: unknown }[] = []
  let textBuf: string[] = []

  const createBlock = (type: string, props: Record<string, unknown>) => ({
    id: `block-${idBase + blocks.length}`,
    type,
    data: { props, style: { padding: { top: 16, bottom: 16, right: 24, left: 24 } } },
  })
  const flushText = () => {
    if (textBuf.length) {
      blocks.push(createBlock('Text', { markdown: true, text: textBuf.join('\n') }))
      textBuf = []
    }
  }

  for (const line of markdown.split('\n')) {
    const heading = line.match(/^(#+)\s+(.*)/)
    if (heading) {
      flushText()
      blocks.push(createBlock('Heading', { text: heading[2], level: `h${Math.min(heading[1].length, 6)}` }))
      continue
    }
    // Setext headings: a line of === or --- under a text line.
    const trimmed = line.trim()
    if (/^(=+|-+)$/.test(trimmed) && textBuf.length) {
      const last = textBuf.pop()!
      if (last.trim()) {
        flushText()
        blocks.push(createBlock('Heading', { text: last, level: trimmed[0] === '=' ? 'h1' : 'h2' }))
        continue
      }
      textBuf.push(last, line)
    } else {
      textBuf.push(line)
    }
  }
  flushText()

  return {
    root: { type: 'EmailLayout', data: { childrenIds: blocks.map((b) => b.id) } },
    ...Object.fromEntries(blocks.map((b) => [b.id, { type: b.type, data: b.data }])),
  }
}

export interface Converted {
  body: string
  bodySource: string | null
  /** Visual and regular templates are different kinds, so the chosen template no longer applies. */
  resetTemplate: boolean
}

const isHTMLType = (t: ContentType) => t === 'richtext' || t === 'html' || t === 'visual'

/** Strips <body>/<head> wrappers and beautifies, as the classic editor did before converting. */
function normalizeHTML(body: string): string {
  const d = document.createElement('div')
  d.innerHTML = body
  return beautifyHTML(d.innerHTML.trim())
}

/**
 * Converts `body` from one content type to another. Markdown to HTML needs the server, so the
 * caller passes `markdownToHTML` (the campaign content endpoint).
 */
export async function convertContent(
  body: string,
  from: ContentType,
  to: ContentType,
  markdownToHTML: (md: string) => Promise<string>,
): Promise<Converted> {
  const resetTemplate = to === 'visual' || from === 'visual'
  let out = body ?? ''
  let bodySource: string | null = null

  if (isHTMLType(from)) {
    out = normalizeHTML(out)
    switch (to) {
      case 'plain':
        out = trimLines(htmlToPlain(out).trim(), true)
        break
      case 'markdown':
        out = htmlToMarkdown(out)
        break
      case 'visual':
        bodySource = JSON.stringify(markdownToVisualBlock(htmlToMarkdown(out)))
        break
      default:
        // html <-> richtext: already normalised. (richtext/html -> visual loses the content.)
        break
    }
  } else if (from === 'markdown' && (to === 'richtext' || to === 'html')) {
    out = beautifyHTML((await markdownToHTML(out)).trim())
  } else if (from === 'plain' && (to === 'richtext' || to === 'html')) {
    out = out.replace(/\n/g, '<br>\n')
  } else if (to === 'visual') {
    bodySource = JSON.stringify(markdownToVisualBlock(out))
  }

  return { body: out, bodySource, resetTemplate }
}
