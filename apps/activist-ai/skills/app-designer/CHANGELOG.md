# app-designer

One line per change: the version, the date, what failed (the failure label, if a run showed it), what changed, which evals moved.

- 1, 2026-11-17: first version. iPhone and Mac screens as one clickable HTML prototype at device sizes: the map and the platform's navigation patterns (`references/structure.md`), what a normal app has (`references/normal-app.md`, Settings and About first), sizes and type (`references/anatomy.md`), a component kit (`assets/app.css`), the click-through engine (`assets/prototype.js`), a four-screen starter, and `screens.py` (every screen rendered at 393 x 852 at 2x or 1180 x 760, light and dark, side by side, with broken links, orphan screens and missing Settings found). Shares the designer skill's palette, fonts and slop list. Eval `u6-phone-screens`.
- 2, 2026-11-17: on Nemotron 3.5 Super VL the stages ran into the 500,000-token cap in u7 (2 of 3 at 12 of 13, `token_limit`). Quick mode is now the default: the starter kept as the structure, the real content in it, one `screens.py` pass. The stages are the thorough mode. u7 rerun in quick mode.
- 3, 2026-11-25 (OLA-455): Bart, after a toy took Ola 15 minutes that plain OpenCode made in 5: 'Ola needs to be give or take OpenCode'. The skill loads only when asked for by name.
