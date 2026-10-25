# Takt — App Icon Spec (Direction C: "Repeat")

Hand this file and the `svg/` folder to the Claude Code agent working in `apps/takt/`. It contains the idea, exact geometry, colors, and implementation steps for iOS and Mac Catalyst.

---

## 1. The idea

The icon is a **start-repeat sign** from sheet music (𝄆): a thick bar line, a thin bar line, and two dots, sitting on a five-line staff.

- In notation it means **"play this again."** That's how you practice (loop the hard bar until it's clean), and it's how techno works (the loop is the song). The classical half and the club half of Takt meet in one symbol.
- The **two orange dots** are the brand's signal color. They double as a tiny standalone mark across the app (loading states, the "now" indicator, the favicon).
- No letters, no piano keys, no note heads. Anyone who reads music recognizes it instantly; everyone else sees a clean, slightly mysterious mark.

**Tone:** hardware-flat, exact, quiet. No gradients, glows, bevels, or drop shadows in the artwork. The system adds its own material/lighting where the OS does that.

---

## 2. Files

```
svg/
  takt-icon-dark.svg     1024×1024 full-bleed master, dark (default)
  takt-icon-paper.svg    1024×1024 full-bleed master, light ("paper")
  takt-mark.svg          repeat sign only, tight crop; bars = currentColor, dots = orange
  layers/
    1-staff.svg          staff lines only, transparent
    2-bars.svg           thick + thin bars only, transparent
    3-dots.svg           two dots only, transparent
```

All masters are **full-bleed squares with no corner rounding**. The OS applies the icon mask. Don't bake a squircle into the artwork.

---

## 3. Geometry (1024 grid)

Everything derives from the staff spacing `sp = 0.13 × 1024 = 133.12`.

| Element | Value |
|---|---|
| Staff: 5 lines, full width (bleed edge to edge) | centers at y = 245.76, 378.88, 512.00, 645.12, 778.24 |
| Staff line thickness | 8.19 (0.008 × size, never < 1 px when rasterized) |
| Thick bar | x 355.33, w 81.92, spans top line to bottom line (y 241.66 → 782.33) |
| Gap thick → thin | 46.08 |
| Thin bar | x 483.33, w 26.62, same vertical span |
| Gap thin → dots | 61.44 |
| Dots | r 48.64, cx 620.03; cy 445.44 and 578.56 (centered in the 2nd and 3rd staff spaces, like real notation) |
| Group (bars + dots) | horizontally centered; total width 313.34 |

The group sits optically centered. The staff runs to the edges so the mask crops it. This is intentional: it reads as a fragment of a score.

---

## 4. Color

| Role | Dark (default) | Paper (light) | Tinted / mono |
|---|---|---|---|
| Background | `#0D0D0D` | `#F2F0EB` | system |
| Staff lines | `#333333` | `#C9C4BA` | 35% opacity of foreground |
| Bars | `#F2F0EB` | `#0D0D0D` | 100% foreground |
| Dots (signal) | `#FF5A1F` | `#D8430C` | 100% foreground |

These match the app's design tokens (`ground`, `line`, `text`, `signal`) in `TAKT_BRIEF.md`. Keep orange on the dots only.

---

## 5. Implementation (Xcode)

### Preferred: Icon Composer (layered icon)
If the installed Xcode includes **Icon Composer** (Xcode 26+), build a layered `.icon`:

1. Background fill `#0D0D0D` (light appearance: `#F2F0EB`).
2. Layers, back to front: `1-staff.svg`, `2-bars.svg`, `3-dots.svg`.
3. Keep material/specular effects subtle or off. The mark should stay flat and crisp. Turn shadows off on the staff layer.
4. Set the dark, light and tinted appearances per the color table above.
5. Add the `.icon` to the `Takt` target and set it as the app icon in `project.yml` (XcodeGen). Verify Icon Composer's generated fallbacks for the deployment targets (iOS 17, macOS 14) are present in the built product.

### Fallback: asset catalog
If Icon Composer isn't available or the fallbacks misbehave:

1. Rasterize `takt-icon-dark.svg` to `AppIcon-1024.png` (e.g. `rsvg-convert -w 1024 -h 1024`), sRGB, **no alpha channel**.
2. iOS: `Assets.xcassets/AppIcon.appiconset` with a single 1024 universal entry. Add `takt-icon-paper.svg`-derived art only if adding appearance variants (dark/tinted).
3. Mac Catalyst: the macOS idiom needs the **rounded-rect icon with margin** baked in (macOS doesn't mask older-style icons). Generate macOS sizes (16, 32, 64, 128, 256, 512, 1024 @1x/@2x) from the master placed inside Apple's macOS icon template grid (824×824 body centered in 1024, corner radius ≈ 185). Same artwork, scaled into the body.
4. Wire `ASSETCATALOG_COMPILER_APPICON_NAME: AppIcon` in `project.yml`, regenerate with `xcodegen`.

### Small sizes
- At ≤ 32 px the staff lines drop to 1 px and soften. That's fine; don't remove them.
- If the 16 px Mac size looks muddy, use a variant without staff lines for 16 and 32 only.

---

## 6. In-app use of the mark

- `takt-mark.svg` → add to the asset catalog as a vector symbol image (`TaktMark`, "Preserve Vector Data" on, render as original). Bars use `currentColor`, so they follow the text color in both themes.
- Uses:
  - **Launch / empty states:** the mark, centered, small.
  - **Loop indicator:** while a chorus repeats, the two dots blink on beat 1 (quantized to the transport, per the brief's motion rules).
  - **About screen:** mark + wordmark lockup.
- **Wordmark:** lowercase `takt`, SF Pro **Compressed**, Black/Heavy weight, tracking −1%. Lockup: mark height = wordmark cap height × 1.6, gap = one dot diameter. Don't stretch, outline, or recolor the dots.

---

## 7. Acceptance

- [ ] Icon shows correctly on iPhone home screen (light, dark, tinted) and in the Mac Dock and Finder.
- [ ] No baked-in rounded corners on iOS; correct rounded body with margin on Mac.
- [ ] Dots are the only orange element; bars are crisp and vertical at every size.
- [ ] Screenshot of the Dock at default size and the iOS home screen attached to the PR.
