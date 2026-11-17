# What makes an app feel normal

The owner, on an early phone app: "the ui is missing some stuff, such as settings ... it's missing
some normal app ui". A prototype that has only the screens named in the request feels like a demo.
Check this list; design what applies, and say in the notes which you left out and why.

## Every app

- [ ] **Settings**, reachable in one or two taps: Account (name, email, Sign Out), Notifications,
      Appearance (Light, Dark, Automatic), the app's own options, Privacy or Your Data (export,
      delete), Help and Feedback, **About** (version and build, like "Version 1.0 (12)", terms).
- [ ] **First run:** what the app is in one sentence, then sign in or start. No three-page tour.
- [ ] **Empty states** for every list: what goes here, and the one action that fills it.
- [ ] **Loading** (a quiet spinner or placeholder rows) and **offline or error** ("Could not load.
      Try Again", with the button).
- [ ] **Create** as a sheet with Cancel and Save; **edit** the same way; **delete** with a
      confirmation, and Undo when it can be undone.
- [ ] **Search** on any list longer than a screen.
- [ ] **Pull to refresh** on lists that change (say so in the notes; draw the list in its normal state).
- [ ] **Share** where a person would send the thing to someone.
- [ ] **Dark mode** looks right (render with `--dark` when the person asks).

## iPhone details people notice

- The status bar (time, signal, battery) at the top of every screen, and the home indicator at the bottom.
- Large titles on top-level screens; small inline titles on pushed screens.
- The tab bar shows on top-level screens, with the current tab in the accent.
- Rows have chevrons when they push a screen, none when they toggle or act.
- Buttons are text in the accent in bars; one filled button at most per screen, at the bottom.
- Numbers and dates the way the phone writes them: "Today, 9:41 AM", "Mar 12".

## Mac details people notice

- Traffic lights at top left, the window title, a toolbar with the main actions, a sidebar.
- 13 px text, 28 px rows, a selection in the accent, hover states on rows.
- Right-click menus on items (mention them in the notes), keyboard shortcuts in menus.
- Settings in its own window with tabs, opened from the app menu.
