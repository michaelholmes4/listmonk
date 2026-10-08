declare module 'textversionjs' {
  /** Converts an HTML string to a plain-text version, keeping links and list structure readable. */
  export default function htmlToPlainText(html: string, styleConfig?: Record<string, unknown>): string
}
