/**
 * The look shared by every page-level tab strip (PageTabs, RecordTabs): line tabs along the bottom of
 * the page header. Each component adds its own active-state selector (aria-current for links,
 * data-state for in-page tabs).
 */
export const tabStripClass = 'mt-4 flex gap-5 overflow-x-auto border-b'
export const tabClass =
  '-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 border-transparent pb-2 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50'
