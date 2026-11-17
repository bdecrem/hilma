# The map: screens and how they connect

Write the map in `design/notes.md` before drawing anything:

```
Tabs: Reports | Building | Settings
Reports (list, search) -> Report (detail) -> Edit report (sheet)
Reports -> New report (sheet, from + in the top bar)
Building -> Floor (detail)
Settings -> Notifications, Language, About
```

## iPhone patterns

| Pattern | When | How it looks |
|---|---|---|
| **Tab bar** | two to five top-level sections the person switches between | bottom bar, icon + one-word label each, the current one in the accent; stays visible on top-level screens, hidden on deep detail screens only if the app is immersive |
| **Navigation stack** | list to detail to detail | each pushed screen has a back button with the previous screen's title (or "Back") at top left, its own title in the middle |
| **Sheet** | create, edit, compose, filter: a task with an end | slides up over the screen, a grabber, Cancel at top left, Done or Save at top right |
| **Alert** | confirm something destructive, or a short choice | two buttons, the destructive one in red and named ("Delete report") |
| **Search** | a list longer than one screen | a search field under the large title |
| **Swipe actions** | delete or archive a row | swipe left on a row; the full action still exists in the detail |

## Mac patterns

| Pattern | When | How it looks |
|---|---|---|
| **Sidebar, list, detail** | browsing a collection | sidebar 220 to 260 px (sections), a list column, the detail on the right |
| **Toolbar** | the window's main actions | in the title bar: the window's title on the left, 3 to 6 actions on the right, a search field |
| **Settings window** | preferences | its own window, a row of tabs with icons at the top (General, Account, ...), labels right-aligned beside controls |
| **Menu bar** | every command | File (New, Open, Close), Edit, View, Window, Help; mention the shortcuts in the notes |

## Rules for the map

- Every screen is reachable from the first one, and every pushed screen has a way back.
- Top-level sections are nouns the person uses ("Reports", not "Dashboard").
- The first screen shows the thing the app is for, with real content, not a welcome banner.
- Destructive actions are never one tap.
