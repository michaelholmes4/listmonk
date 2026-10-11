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
6. **Detail pages = header → tabs → content.** A record's tabs (`RecordTabs`) are line tabs
   along the bottom of the sticky header, drawn like an entry's tabs, so they stay in reach while
   you scroll. Form fields never sit outside the tab they belong to.
   - Keep tab labels to one or two words. A count goes in a small counter after the label
     ("Bounces 0"), never in brackets.
   - Never grey out a tab. If it can't apply yet, hide it (a new campaign has only its settings;
     an automation's Activity and Versions appear after the first publish). If it's just empty,
     keep it and say so in the panel.
   - The segmented "pill" tabs (`TabsList` default variant) are only for switching views inside
     one panel, such as Appearance's admin / public CSS. They are not page navigation.
   - The header has one primary button. Occasional actions (pause, archive) go in a "⋯" menu
     next to it.
7. **Save lives in the page header, with Cancel.** The header also shows an "Unsaved changes"
   marker when the form is dirty. ⌘S still works, and leaving with unsaved edits still asks.
8. **Forms are grouped into titled sections, at a readable width.** Every editor's fields sit
   in `FormSection`s. Where there's room, the section title and description form a 14rem column
   left of the fields, as in GitHub's, Vercel's and Polaris' settings. On narrower screens they
   stack above the fields. The fields column is capped at 36rem (about 60 characters), so an
   input is never wider than what goes in it. Inside that column, stack fields vertically and
   pair them only when they're short and belong together (Name · Status).
   - Split a form by meaning (Details · Access · Archive), not one catch-all "Details" section.
     A lone section leaves the left column empty. Give a section a description whenever its
     fields need explaining, so the left column explains rather than just labels.
   - Don't put fields with long help text side by side: the uneven help makes ragged columns.
     Stack them.
   - Size selects and short inputs to their content (`w-56` for a status or type select).
   - **Editor pages are the exception.** When the page's real content is a full-width editor
     (a template, a campaign's Content tab), don't use `FormSection`. Put a toolbar row of
     compact fields above the editor (Name, Type… on the left, Preview on the right), then the
     editor at full width. A section above an editor creates two left edges that don't line up.
9. **Settings sections are links in the Settings space's sidebar** instead of a wrapping tab
   strip. Each section is its own page header: its name, with its help text as the description.
10. **Loading stays per component** (skeletons and button spinners), as before.

## 3. Building blocks

| Component | Use |
|-----------|-----|
| `components/layout/Page.vue` | Every page. Props: `title`, `count`, `description`, `width` (`full` for tables and builders, `form` for a readable column). Slots: `badges`, `meta`, `actions`, `help`, default. It renders a `#page-actions` target, so a form component can teleport its Save button into the header. |
| `components/layout/FormActions.vue` | Save/Cancel (plus "Unsaved changes") teleported into the page header. |
| `components/layout/FormSection.vue` | A titled group of fields inside a form. Lays out by the width of `Page`'s content (a size container): title column on the left where there's room, stacked otherwise. The fields column is capped at 36rem. |
| `components/layout/PageTabs.vue` | Tabs linking a sidebar entry's pages. `Page` renders it from `nav.ts`; views don't use it directly. |
| `components/layout/RecordTabs.vue`, `RecordTab.vue` | A record page's tabs. Put them inside the view's `<Tabs>`; they render into the page header (`#page-tabs`). `RecordTab` takes an optional `count`. They share their look with `PageTabs` (`layout/tabs.ts`). |
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

Not reviewed in depth yet: the template editor and the media browser. They now sit in the standard page frame, but their own layouts are unchanged. (The automation flow
builder was reviewed later; see "Flow builder" below.)

### Detail pages and forms (October 2026, second pass)

Two complaints about record pages: the tabs felt cluttered, and on desktop the inputs ran up to
768px wide, which made them hard to read across. What the research said:

- **Tabs.** NN/g ("Tabs, Used Right"): use few tabs with short labels, put them directly above
  their panel, mark the selected tab in at least two ways, and don't fade the unselected ones.
  Design systems keep underline tabs for separate views and segmented controls for switching one
  view's presentation. Our record tabs used the segmented style and greyed out tabs that didn't
  apply.
- **Field width.** Baymard, Primer and Carbon all say to size a field to its expected content.
  Primer adds: stack fields vertically, and don't flow them into columns just to save space.
- **Layout.** Polaris' annotated layout, GitHub's settings, GitLab's settings proposal and
  Vercel's dashboard all put each section's title and explanation in a narrow left column and
  the fields in a capped right column. Polaris says the same about page actions: one primary and
  a few secondary.

| Before | Now |
|--------|-----|
| Record tabs were a grey pill strip under the header, with counts in brackets and greyed-out empty tabs. | `RecordTabs`: line tabs in the sticky header, matching entry tabs, with counter badges. Empty tabs stay enabled and say so in the panel, and tabs that can't apply yet are hidden. |
| Inputs spanned the whole form width (48rem), and sections were a heading over a full-width column. | `FormSection` puts the title and description on the left and the fields in a column capped at 36rem. Subscriber, campaign, automation settings, list (Details · Access · Archive), user, role and profile editors all use it. The template editor uses the toolbar-and-editor layout of a campaign's Content tab. |
| Users, roles, lists, templates and profile each grouped fields their own way: bordered boxes, `h2`s or none. | The same sections everywhere. Profile saves from the header like every other editor. |
| The automation header had Pause, Archive, Save draft and Publish side by side. | Pause / Resume / Archive moved to a "⋯" menu, leaving Save draft and the one primary Publish. |
| Settings text fields were 48rem wide. | Lone text and tag fields are capped at 36rem (later: all settings use `FormSection`). |

Settings at first kept one column with sub-headings. It now uses the same sections (see "Settings
and maintenance" below).

### Settings and maintenance (October 2026)

The settings pages and Maintenance were the last screens still laid out the old way: fields in one
wide column split by rules, bordered cards for SMTP servers, messengers and maintenance jobs, and
grids of three fields with long help text side by side.

| Before | Now |
|--------|-----|
| One column of fields split by `Separator`s, with an occasional `h2`. | Every settings page except Appearance is a set of `FormSection`s (General: Site · Email · Subscriptions · Archive · Language and updates, and so on). Each section's description explains it, so the page header's help no longer has to cover everything. |
| An SMTP server or messenger was a bordered card with 2–3 column grids inside. | Each one is a collapsible card (`ServerCard`). Its header always shows the name (or "Server 1"), the host, an *Enabled* switch and a "⋯" menu with *Delete*, so the page reads as a list of servers. Its sections open inside the card: Connection · Authentication · Connections and retries · Routing · Test connection for SMTP, Postback · Connections and retries for messengers. A lone server starts open, several start closed, a new one opens, and one with a problem is flagged *Has errors* and opened. A closed card keeps its fields mounted (`unmount-on-hide=false`, so they are hidden until found), which keeps validation and the sidebar's error dot working. *Test connection* shows its recipient field at once, not behind a button. No messengers shows an empty state with *Add messenger*. |
| Switches sat left of their label, and the settings field components stretched to the column. | `ToggleRow` is the bordered row the other editors use (label and help on the left, switch on the right). Number inputs are `w-40`, selects `w-56`, and durations and cron lines use `SettingInput short`. |
| Bounce actions repeated "Bounce count" and its help on every row, and provider webhook fields showed greyed out. | The actions are a small table with column headings. A webhook provider's fields show once it is switched on. |
| Maintenance was a stack of bordered cards. | One section per job, with its explanation on the left. The vacuum schedule saves on its own, inside its section. |
| The settings form's hidden `Tabs` were `orientation="vertical"`. That made its root `flex-row`, which shrank the content, and nested segmented tabs (Privacy's domain lists, Appearance) stacked vertically. | The hidden `Tabs` use the default orientation. |

Appearance keeps its full-width code editors, under the editor-page exception in rule 8.

### Flow builder (October 2026, third pass)

Users found editing an automation step hard. Reading the code and using it showed four causes:

| # | Finding | Why it hurt |
|---|---------|-------------|
| B1 | The email editor was squished. The step sheet asked for `sm:max-w-3xl`, but the generated sheet's `data-[side=right]:sm:max-w-sm` is more specific and won, so every sheet was 384px. | The rich-text toolbar wrapped onto six rows, and a 600px email never fit, even at 768px. |
| B2 | One screen saved three ways. Step settings applied instantly to an unsaved in-memory draft (the sheet only had *Close*), the email had its own *Save email* button, and the flow had *Save draft* and *Publish*. | Users couldn't tell which save applied. The header also lacked the "Unsaved changes" marker rule 7 asks for. |
| B3 | Saving an email changes what live sends contain, in every version, and nothing said so. The live banner said changes "only apply… once you publish". | A typo fix is meant to reach people already enrolled, but the user was told the opposite. |
| B4 | The sheet was modal and blurred the flow. | You couldn't see where the step sat, and moving between steps meant click, edit, Close each time. |

What the research said:

- Use a drawer for quick edits that support the page, and a full, focused page for long or complex
  editing (GitLab Pajamas, Fluent 2, Carbon, Smashing Magazine's 2026 modal-or-page decision tree).
- Marketing tools split an email step into a light settings panel and the full email editor (Loops,
  Klaviyo, HubSpot, ActiveCampaign, Dynamics 365).
- One save model per screen. Show "Unsaved changes" with Save and Discard, and warn before work is lost
  (GitLab saving and feedback, Polaris' contextual save bar, Fluent).

| Before | Now |
|--------|-----|
| A modal sheet, 384px wide whatever the step. | The step panel docks beside the flow from `lg` up (`StepInspector`, 28rem, sticky under the page header; `Page` exposes `--page-header-h` and `--page-viewport-h` for it). It blocks nothing. Below `lg` the same `StepPanel` is a sheet (`StepSheet`). The open step is marked on the flow and in the URL (`?step=`, `?trigger=`). |
| Settings applied as you typed; *Close* only. | The panel edits a copy. **Save** (⌘S) writes it into the flow, **Cancel** throws it away. Leaving with edits (another step, ✕, Esc, another tab) asks: Save, Discard or keep editing. |
| *Save draft* in the header. | The flow is always saved: adding, removing, moving a step and adding or removing a trigger save the draft at once (`useDraftSaver`: one request at a time, later changes coalesced). The header shows *Saving…*, *Draft saved 14:02*, the server's problems, or an error with *Retry*. Only the open panel can hold unsaved edits. |
| Deleting a step was one click. | Deleting a step or trigger that has settings asks first, because the delete saves at once. |
| The email form (subject, from, body, *Save email*) inside the sheet. | The panel keeps the step's own settings (type, topic, content source) and shows the email as a card (subject, from, format, preview, *Edit email*). The content is written on `/automations/:id/emails/:step`, laid out like a campaign's Content tab. |
| A live email saved silently. | The page says it is live, the button reads *Save to live email*, and saving asks first, with how many people are in the automation now. |
| *Write email* created a campaign even if the panel was then cancelled. | It saves the panel, creates the campaign, stores its id in the step, saves the draft, and only then opens the page. |

Rules for builders and step editors:

1. **Docked panel, not a modal**, wherever the thing being edited should stay visible.
2. **Buffered panel, Save and Cancel.** The panel's copy is the only thing that can be unsaved.
3. **Structural edits save immediately**; the screen shows a save status, never a *Save draft* button.
4. **A long editor gets a page.** The panel holds a summary card and a link.
5. **Saving something that changes live behaviour says so** and asks before doing it.

Sources: GitLab Pajamas [Drawer](https://design.gitlab.com/components/drawer) and
[Saving and feedback](https://design.gitlab.com/patterns/saving-and-feedback);
[Fluent 2 Drawer](https://fluent2.microsoft.design/components/web/react/core/drawer/usage);
[Carbon dialog pattern](https://carbondesignsystem.com/patterns/dialog-pattern/);
[Polaris contextual save bar](https://polaris.shopify.com/components/contextual-save-bar);
[Smashing Magazine, modal vs. separate page (2026)](https://www.smashingmagazine.com/2026/03/modal-separate-page-ux-decision-tree/);
[Loops workflows](https://loops.so/docs/workflows);
[Klaviyo: edit a flow](https://help.klaviyo.com/hc/en-us/articles/115002779151);
[HubSpot: automated emails in workflows](https://knowledge.hubspot.com/marketing-email/create-automated-emails-to-use-in-workflows);
[ActiveCampaign: Send an email action](https://help.activecampaign.com/hc/en-us/articles/16196494893084);
[Dynamics 365: edit email in a live journey](https://learn.microsoft.com/en-gb/dynamics365/customer-insights/journeys/edit-email-in-live-journey);
[Zapier: step setup](https://help.zapier.com/hc/en-us/articles/29508922694797-Setting-up-triggers-and-actions-just-got-better).
