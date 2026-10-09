# Admin UI: UX audit and page standards

This document records the UX/UI audit of the admin UI (October 2026). It also sets the page
patterns every screen follows. If you add a page, build it from the components listed in
"Building blocks" and don't hand-roll a header, toolbar or bulk bar.

## 1. Audit findings

Found by going through every screen in the app at 1440×900 and reading each view's source.

### Navigation and layout
| # | Problem | Why it hurts |
|---|---------|--------------|
| N1 | The sidebar has 7 collapsible groups. Only one group opens at a time on page load, so most destinations are hidden behind a click. | Users can't see what the app can do. "Templates" and "Media" are hidden under Campaigns, and "Bounces" under Subscribers. |
| N2 | Groups follow listmonk's internal menu, not user tasks. Automations is top-level, but Templates/Analytics/Media sit under Campaigns, even though automations use templates too. | People have to remember where each item lives. |
| N3 | The nav has a "Create new" entry, which is an action, not a destination. | It mixes verbs into a list of places and duplicates the "New" button. |
| N4 | The active state only matches exact route names. On `/campaigns/5` or `/subscribers/lists/3`, nothing in the sidebar is highlighted. | Users lose track of where they are. |
| N5 | A page's primary action sits in the top bar (teleported to `#page-actions`), far from the page title and at the opposite edge of a 1200px-wide screen. | The eye has to travel too far, and the action doesn't read as belonging to the page. |
| N6 | Help text takes a fixed 25% rail on every form page. That squeezes tabbed editors such as campaigns and leaves a column of mostly empty space. | Wasted space and narrow forms. |

### List pages (Subscribers, Campaigns, Lists, Automations, Bounces, Templates, Users, Roles)
| # | Problem |
|---|---------|
| L1 | Each list page builds its own page header, search box, filter selects, bulk bar and URL/pagination/selection state. About 80 lines are copy-pasted per page, and the copies have drifted apart. |
| L2 | Search behaves differently on different pages. Subscribers searches as you type; Campaigns, Lists and Automations need Enter. None of them has a clear button. |
| L3 | Bulk actions appear in a different place on each page: a second toolbar row on Subscribers, inline after the filters on Campaigns/Lists, and their own row on Bounces. The "N selected · select all · clear" text uses three different layouts. |
| L4 | The Lists page switches between active and archived through a small "View archived →" text link under the heading. Other pages filter with a select. |
| L5 | Every empty state is the same "Nothing to show." It has no next step and doesn't say whether filters caused it. |
| L6 | Campaigns rows are about 90px tall. Stats are a 4-line mini table, timestamps are a 4-line mini table, and every row has a large "Start campaign" button, so 7 campaigns fill the screen. |
| L7 | Subscribers shows each e-mail twice (a CopyText slot bug), shows list badges inside the e-mail cell *and* a list-count column, and has no status column. |
| L8 | The Bounces page has no toolbar at all. Its filters only show up as chips after you click a cell. |

### Detail and edit pages
| # | Problem |
|---|---------|
| F1 | Save is in a different place on each page: in the top bar for Campaign and Settings, at the bottom of the form for Subscriber, List, Template, User and Role, and in a custom in-page header for Automation. |
| F2 | The subscriber page puts a tab strip in the *middle* of the form: profile fields, then tabs (Lists / Subscriptions / Bounces / Activity / Automations), then more profile fields (Attributes), then Save. You can't tell what Save applies to. |
| F3 | Long forms (Campaign) are one undivided column of 10+ fields. Related fields (sender, audience, scheduling) aren't grouped. |
| F4 | Settings has 9 tabs in a horizontal strip that wraps onto a second line ("Appearance" sits alone), and the help rail repeats for each tab. |
| F5 | Nothing shows unsaved changes except the Save button turning enabled. |

### Dashboard
| # | Problem |
|---|---------|
| D1 | The page heading is today's date, not the page name. |
| D2 | The count tiles aren't links, and the page has no shortcuts to the most common jobs (new campaign, import). |

## 2. Standards applied

These are conventions shared by mature admin design systems (Shopify Polaris, IBM Carbon,
Atlassian, GitHub Primer) and by Nielsen's heuristics (consistency, recognition over recall,
visibility of system status).

1. **Navigation shows destinations, grouped by job, all visible.** Use a flat sidebar with section
   labels (*Audience*, *Messaging*) instead of collapsible groups, so every destination is one
   click away and the sections explain the app. Keep it to the pages used day to day (5–9
   entries), ordered by how often they're used. Group by the job a page serves, not by where its
   data lives (Bounces is a report, not a subscriber page). Actions ("new campaign") go in page
   headers and the command palette (⌘K), not in the nav. A nav item is active on its own route and
   on every route below it.
   - **Secondary pages are tabs** on their entry (`pages` in `nav.ts`): Lists · Forms,
     Templates · Media, Reports: Analytics · Sent messages · Bounces. The tabs sit under a header
     that belongs to the entry and is the same on every tab, so they never move.
   - **Settings and administration are a space of their own** (`space` in `nav.ts`), as in Linear
     and Stripe: one *Settings* entry at the foot of the sidebar. On its pages the sidebar lists
     the settings sections, team (users, roles), system (maintenance, logs) and account pages,
     with *Back to app* returning to where you were.
   - Every page, tab or not, is in the ⌘K palette; a space's pages under its own heading.
2. **One page header everywhere.** Title (with count or status badges) and an optional short
   description on the left; the page's actions on the right, with at most one primary button.
   The header sticks to the top while scrolling, so Save and Publish stay in reach on long forms.
3. **List pages = header → toolbar → table → pager.** The toolbar holds search (as-you-type,
   debounced, clearable), filter selects that say what they filter ("Status: All"), and secondary
   actions on the right such as Export. When rows are selected, a **bulk action bar** shows
   *N selected*, *Select all N*, *Clear* and the bulk actions in one fixed format and position.
4. **Tables are scannable.** One line per row where possible, numbers right-aligned in their own
   columns, the name links to the record, and the less common row actions go in the "⋯" menu.
   Destructive actions are never the most prominent control on a row.
5. **Empty states say why and what next.** "No campaigns yet" plus a *New campaign* button when
   there's nothing at all. "No results" plus *Clear filters* when filters caused it.
6. **Detail pages = header → tabs → content.** Tabs sit directly under the header and split the
   record into views. Form fields never sit outside the tab they belong to.
7. **Save lives in the page header, with Cancel.** The header also shows an "Unsaved changes"
   marker when the form is dirty. ⌘S still works, and leaving with unsaved edits still asks.
8. **Forms are grouped into titled sections** (heading plus a one-line explanation) and kept to a
   readable width.
9. **Settings sections are links in the Settings space's sidebar** instead of a wrapping tab
   strip. Each section is its own page header: its name, with its help text as the description.
10. **Loading stays per component** (skeletons and button spinners), as before.

## 3. Building blocks

| Component | Use |
|-----------|-----|
| `components/layout/Page.vue` | Every page. Props: `title`, `count`, `description`, `width` (`full` for tables and builders, `form` for a readable column). Slots: `badges`, `meta`, `actions`, `help`, default. It renders a `#page-actions` target, so a form component can teleport its Save button into the header. |
| `components/layout/FormActions.vue` | Save/Cancel (plus "Unsaved changes") teleported into the page header. |
| `components/layout/FormSection.vue` | A titled group of fields inside a form. |
| `components/layout/PageTabs.vue` | Tabs linking a sidebar entry's pages. `Page` renders it from `nav.ts`; views don't use it directly. |
| `components/datatable/DataTableToolbar.vue` | Search, filters and right-side actions. Turns into the bulk bar when rows are selected. |
| `components/datatable/SearchInput.vue` | Debounced, clearable search box. |
| `components/datatable/FilterSelect.vue` | "Label: value" select with an *All* option. |
| `components/EmptyState.vue` | Icon, title, description and an optional action. Use it in DataTable's `empty` slot. |
| `composables/useTableState.ts` | `useUrlTable`: URL-backed pagination and sorting. `useRowSelection`: the selection model with "select all N matching", reset when the filter changes. |

## 4. What changed (October 2026)

| Finding | Resolution |
|---------|------------|
| N1–N3 | `nav.ts` is now flat sections (Audience / Messaging / Administration) with every entry visible. "Create new" is gone from the nav; the ⌘K palette has a *Create* group instead. |
| N4 | Nav entries list their sub-routes in `match`, so they stay highlighted on detail and create pages (covered by `e2e/shell.spec.ts`). |
| N5 | Every page uses `Page`. Its actions sit next to the title in a sticky header, and the top bar keeps only the breadcrumbs and refresh. |
| N6 | Help is a rail from `xl` up and a "?" popover below that. |
| L1–L3, L8 | All paginated lists use `DataTableToolbar`, `SearchInput`, `FilterSelect`, `useUrlTable` and `useRowSelection`. Search everywhere is as-you-type and clearable. |
| L4 | Lists has an Active / Archived toggle in the toolbar. |
| L5 | `EmptyState` gives a "no results, clear filters" variant and a first-run variant with a create button. |
| L6 | Campaign rows fit on one line. Sent, Views, Clicks and Bounces are right-aligned columns, the timeline is in the date's tooltip, and start / pause / resume / schedule moved to the top of the row menu. |
| L7 | The e-mail shows once, as a link (the copy button appears on hover). There is a Status column, and lists show as up to 3 badges plus "+N". |
| F1, F5 | `FormActions` puts Save / Cancel in the page header on every editor. "Unsaved changes" shows while dirty, and leaving asks first (vee-validate `meta.dirty` + `useUnsavedGuard`). |
| F2 | The subscriber page opens on its tabs. *Profile* holds the whole form (details, lists, attributes); the other tabs are read-only. |
| F3 | The campaign form is split into Details / Audience / Delivery / Send test sections, at a readable width. |
| F4 | Settings uses a vertical section nav, with each section's help under its heading. After a failed save it jumps to the section with the problem and re-validates, so that field's message shows. |
| D1–D2 | The dashboard title is "Dashboard" (the date is the description), the count tiles link to their pages, and the header has *Import* and *New campaign*. |

Later (October 2026), the sidebar went from 18 entries to 8:

| Before | Now |
|--------|-----|
| Import, Bounces under *Audience* | Import is the Subscribers header button (and ⌘K). Bounces is a Reports tab. |
| Forms under *Audience* | A tab on Lists. |
| Media, Analytics, Sent messages under *Messaging* | Media is a tab on Templates. Analytics and Sent messages are Reports tabs. |
| *Administration*: Users, User roles, List roles, Settings, Maintenance, Logs | All in the Settings space, with the settings sections and Profile. The in-page section nav (`SectionNav`) is gone. |

On a tabbed page the `h1` is the entry's name (*Reports*); the page's own name is the active tab,
the breadcrumb and the document title. Its description and meta open the content, and its count is
left to the pager, so nothing in the header changes from tab to tab.

Also changed: Maintenance's delete buttons use the destructive style, and the template clone name is
translated (it was hard-coded "Copy of").

Not reviewed in depth yet: the inside of the automation flow builder, the template editor and the
media browser. They now sit in the standard page frame, but their own layouts are unchanged.
