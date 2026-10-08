import { describe, expect, it } from 'vitest'
import { beautifyHTML, convertContent, markdownToVisualBlock, trimLines } from './convert'

const noServer = () => Promise.reject(new Error('markdown -> html needs the server'))

describe('trimLines', () => {
  it('trims lines and collapses blank runs', () => {
    expect(trimLines('  a  \n\n\n\n  b ')).toBe('  a  \n\n  b ')
    expect(trimLines('  a  \n\n  b ', true)).toBe('a\n\nb')
  })
})

describe('beautifyHTML', () => {
  it('puts block tags on their own lines but keeps inline links inline', () => {
    const out = beautifyHTML('<div><p>Hi <a href="https://x.test">there</a></p></div>')
    expect(out).toContain('<p>')
    expect(out).toContain('<a href="https://x.test">there</a>')
    expect(out.split('\n').length).toBeGreaterThan(1)
  })
})

describe('markdownToVisualBlock', () => {
  it('turns headings into Heading blocks and groups the rest as markdown Text', () => {
    const doc = markdownToVisualBlock('# Title\nhello\nworld\n## Sub\nmore') as Record<string, { type: string; data: { props: Record<string, unknown> } }>
    const ids = (doc.root as unknown as { data: { childrenIds: string[] } }).data.childrenIds
    expect(ids.map((i) => doc[i].type)).toEqual(['Heading', 'Text', 'Heading', 'Text'])
    expect(doc[ids[0]].data.props).toMatchObject({ text: 'Title', level: 'h1' })
    expect(doc[ids[1]].data.props).toMatchObject({ markdown: true, text: 'hello\nworld' })
    expect(doc[ids[2]].data.props).toMatchObject({ level: 'h2' })
  })
  it('understands setext headings', () => {
    const doc = markdownToVisualBlock('Big\n===\ntext') as Record<string, { data: { props: Record<string, unknown> } }>
    const ids = (doc.root as unknown as { data: { childrenIds: string[] } }).data.childrenIds
    expect(doc[ids[0]].data.props).toMatchObject({ text: 'Big', level: 'h1' })
  })
})

describe('convertContent', () => {
  it('html -> markdown', async () => {
    const r = await convertContent('<h1>Hi</h1><p>one <strong>two</strong></p>', 'html', 'markdown', noServer)
    expect(r.body).toContain('Hi')
    expect(r.body).toContain('**two**')
    expect(r.resetTemplate).toBe(false)
  })
  it('html -> plain strips tags', async () => {
    const r = await convertContent('<p>Hello <b>world</b></p>', 'html', 'plain', noServer)
    expect(r.body).toContain('Hello world')
    expect(r.body).not.toContain('<')
  })
  it('plain -> html keeps line breaks', async () => {
    expect((await convertContent('a\nb', 'plain', 'html', noServer)).body).toBe('a<br>\nb')
  })
  it('markdown -> html asks the server and beautifies the answer', async () => {
    const r = await convertContent('# x', 'markdown', 'richtext', async () => '<h1>x</h1>')
    expect(r.body).toMatch(/<h1>\s*x\s*<\/h1>/)
  })
  it('to visual produces a block source and resets the template', async () => {
    const r = await convertContent('# T', 'markdown', 'visual', noServer)
    expect(JSON.parse(r.bodySource!).root.type).toBe('EmailLayout')
    expect(r.resetTemplate).toBe(true)
  })
  it('from visual also resets the template', async () => {
    expect((await convertContent('<p>x</p>', 'visual', 'html', noServer)).resetTemplate).toBe(true)
  })
})
