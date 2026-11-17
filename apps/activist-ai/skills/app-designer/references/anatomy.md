# Sizes, type and spacing (copy these numbers)

`assets/app.css` already has all of this; use its classes and change only `--tint` (the accent).

## iPhone (iPhone 16 and 17 size: 393 x 852 points; CSS px = points)

| Part | Size |
|---|---|
| Status bar | 54 tall: time at left (17 semibold), signal and battery at right |
| Navigation bar | 44 tall; large title below it on top-level screens: 34 bold, 52 tall area |
| Tab bar | 49 tall + 34 home indicator area = 83; icons 25, labels 10 medium |
| Rows | at least 44 tall; 16 side insets; separators inset 16 from the left (more with an icon) |
| Grouped list | gray background, white groups with 10 radius, 16 from the screen edges, 35 between groups |
| Buttons | text buttons 17 in the tint; a filled button 50 tall, 12 radius, 17 semibold, 16 from the edges |
| Sheet | from the top 10 below the status bar, 10 radius on top, a 36 x 5 grabber |
| Touch targets | 44 x 44 at least |

Type (Large, the default text size): Large Title 34 bold; Title 1 28; Title 2 22; Title 3 20;
Headline 17 semibold; Body 17; Callout 16; Subheadline 15; Footnote 13; Caption 12; tab labels 10.
Font: the system font (`-apple-system`), with Instrument Sans bundled as the stand-in where there is
none, which `app.css` asks for.

Colors (light / dark): background #ffffff / #000000; grouped background #f2f2f7 / #000000; group
#ffffff / #1c1c1e; label #000000 / #ffffff; secondary label #3c3c4399 / #ebebf599 (use #6c6c70 /
#a1a1a6 as solid colors); separator #c6c6c8 / #38383a; one tint for actions (`palette.py`, contrast
4.5 on both backgrounds); red #d70015 / #ff6961 for destructive actions only.

## Mac (a window of 1180 x 760 in the prototype)

| Part | Size |
|---|---|
| Title bar and toolbar | 52 tall; traffic lights 12 across, 20 from the left, 8 apart |
| Sidebar | 220 to 260 wide, translucent gray; section headers 11 semibold gray; rows 28 tall, 13 text, 16 icons |
| Content | 13 body text, 15 to 22 for titles; rows 28 to 32 tall; 20 margins |
| Controls | buttons 22 to 28 tall, 6 radius; text fields 22 to 28 tall |
| Settings window | 640 wide; tabs with 20 icons and 11 labels at the top; labels right-aligned in a column |

Type: Large Title 26; Title 1 22; Title 2 17; Title 3 15; Headline 13 bold; Body 13; Callout 12;
Subheadline 11; Footnote 10. The Mac reads smaller than the phone: do not use iPhone sizes on a Mac.

## Spacing

The 4 pt grid: 4, 8, 12, 16, 20, 24, 32. Groups and sections separated by 24 to 35; inside a row,
8 to 12 between an icon and its text.
