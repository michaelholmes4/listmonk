/**
 * The builder HTML-escapes quotes inside Go `{{ templating }}` actions, which would break them
 * (`{{ TrackLink &quot;x&quot; }}`); put them back.
 */
export const fixTemplateQuotes = (html: string) => html.replace(/\{\{[^}]*\}\}/g, (m) => m.replace(/&quot;/g, '"'))
