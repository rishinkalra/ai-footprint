# AI Footprint brand

The identity is called **Moss & daylight**: a calm leaf green on soft daylight neutrals. Amber is used only when something needs attention. The mark is a leaf whose vein is a lightning bolt, for energy and nature together.

## Files
| File | Use |
|---|---|
| `mark.svg` | The mark on light backgrounds |
| `mark-on-dark.svg` | The mark on dark backgrounds |
| `icon.svg` | App icon (mark on a moss tile); the extension's PNG icons are rendered from it |
| `logo-light.png`, `logo-dark.png` | Mark and wordmark, for light and dark backgrounds |
| `social-preview.png` | 1280×640 image for link previews (GitHub → Settings → Social preview) |

`node brand/render.js` regenerates the PNGs.

## Colour
| Token | Light | Dark | Use |
|---|---|---|---|
| Paper | `#f3f5f0` | `#0d1310` | Page background |
| Surface | `#ffffff` | `#141c17` | Cards |
| Ink | `#14211a` | `#e8efe9` | Text |
| Muted | `#5d6b63` | `#93a198` | Labels, captions |
| Moss | `#2d7a4f` | `#6cc996` | Identity, primary actions |
| Data | `#3a8a5c` | `#45a872` | Chart marks |
| Sun | `#9a5a00` | `#f0b54a` | Attention only (over goal, tips) |

All text colours meet WCAG AA contrast on their backgrounds. Chart colours were checked for contrast and colour-blind safety.

## Type
- **Bricolage Grotesque** for headlines and big numbers.
- **Figtree** for everything else.

Both are open-source (SIL Open Font License) and bundled in `extension/fonts/`. Inside chat sites, the badge uses the system font.

## Voice
Calm and honest, never guilt. Say what a number means in everyday terms, show the likely range, and suggest one small, specific change at a time.

## Using the name and logo
The code is Apache-2.0, but the name and logo are not covered by that licence. See [TRADEMARKS.md](../TRADEMARKS.md).
