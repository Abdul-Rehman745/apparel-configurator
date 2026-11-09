# Icon & image asset spec (from the Threadline Studio mockup)

## Shared style for all UI icons (§1–§7)
- **Canvas:** square, transparent background. Keep the artwork inside the centre 20×20 area of a 24×24 grid (2px padding).
- **Stroke:** 1.75px at 24px (scale proportionally), round caps and joins, no fills unless noted.
- **Colour:** `#1B1B1F` on light UI, plus a white `#FFFFFF` variant for dark buttons and the dark tool rail.
- **Export:** PNG at @1x, @2x and @3x of the listed size, for example `icon-save-24.png`, `icon-save-24@2x.png` and `icon-save-24@3x.png`.
- **Filenames:** kebab-case, as in the File column.
- **Recommendation:** for line icons, SVG is the better master format (crisp at any size and recolourable by theme). Generate the SVG first, then export the PNGs from it.

Base prompt suffix for an image generator:
> "minimal line icon, 1.75px uniform stroke, rounded caps, monochrome #1B1B1F, transparent background, centered, flat, no shadow, no gradient, pixel-perfect, UI icon set style consistent with Lucide/Feather"

---

## 1. Header
| # | File | Size (px) | Where | Description |
|---|---|---|---|---|
| 1 | `logo-mark.png` | 48 (+96, 144) | Top-left brand | Heavy black geometric capital **T** with a slightly rounded top bar and a thick stem, solid fill `#111`, brand mark only (no text). Also export a 32px favicon variant. |
| 2 | `icon-save.png` | 20 | "Save" button | Floppy disk outline: rounded square body, small shutter rectangle at the top, label rectangle at the bottom. |
| 3 | `icon-share.png` | 20 | "Share" button | Three small circles (top-right, middle-left, bottom-right) joined by two lines, the classic share glyph. |
| 4 | `icon-help.png` | 20 | "Help" button | Circle outline with a question mark centred inside. |
| 5 | `icon-cart.png` | 22 (white + dark) | "Add to cart" buttons | Shopping cart side view: handle at top-left, trapezoid basket, two small wheel circles. The white variant goes on the dark button. |

## 2. Left tool rail (dark rail, white icons; active item on a slightly lighter tile)
| # | File | Size | Label | Description |
|---|---|---|---|---|
| 6 | `rail-product.png` | 28 | Product | T-shirt front outline: short sleeves angled out, round neckline dip, straight hem. |
| 7 | `rail-design.png` | 28 | Design | Painter's palette: rounded kidney shape with a thumb hole and 4 small paint-dot circles. |
| 8 | `rail-text.png` | 28 | Text | Serif-less capital **T** made from a top bar with small downward serifs and a vertical stem. |
| 9 | `rail-upload.png` | 28 | Upload | Upward arrow rising out of an open tray (U-shaped bracket at the bottom). |
| 10 | `rail-graphics.png` | 28 | Graphics | Picture frame: rounded rectangle with a mountain peak line and a small sun circle, top-right. |
| 11 | `rail-shapes.png` | 28 | Shapes | Single rounded square outline (large corner radius). |
| 12 | `rail-templates.png` | 28 | Templates | 2×2 grid of rounded squares with even gaps. |
| 13 | `rail-layers.png` | 28 | Layers | Three stacked diamond planes (a rhombus on top, two chevron edges below). |

## 3. Product panel
| # | File | Size | Where | Description |
|---|---|---|---|---|
| 14 | `icon-search.png` | 20 | Panel header | Magnifying glass: circle with a short handle to the bottom-right. |
| 15 | `icon-chevron-right.png` | 16 | Model selector | Thin right-pointing chevron. |
| 16 | `icon-chevron-down.png` | 16 | Fabric dropdown, "Collar" tab | Thin down-pointing chevron. |
| 17 | `icon-info.png` | 14 | Next to "Fabric" | Circle outline with a lowercase "i" (dot plus stem). Muted grey `#8A8A8E`. |
| 18 | `icon-minus.png` / `icon-plus.png` | 16 | Quantity stepper | Horizontal bar / cross, same stroke weight. |
| 19 | `swatch-custom.png` | 36 | Colour row, last swatch | Circle filled with a conic rainbow gradient (red → yellow → green → cyan → blue → magenta → red), thin white inner ring. *(Could also be pure CSS.)* |

### 3a. Garment-type thumbnails (light line illustrations, not photos)
| # | File | Size | Description |
|---|---|---|---|
| 20 | `garment-tshirt.png` | 64 (+128) | Front view crew-neck t-shirt, soft grey outline `#6B6B70` with a very light grey fill `#F2F2F2`, subtle fold line at the sleeve. |
| 21 | `garment-polo.png` | 64 | Polo shirt front: turn-down collar, 2-button placket, short sleeves. Same style. |
| 22 | `garment-hoodie.png` | 64 | Pullover hoodie front: raised hood, two drawstrings, kangaroo pocket, ribbed cuffs. |
| 23 | `garment-sweatshirt.png` | 64 | Crew sweatshirt front: long sleeves, ribbed neck, cuffs and hem. |

### 3b. Model thumbnails (photoreal product renders, ghost-mannequin style)
Neutral light-grey studio background `#F4F4F4`, soft top-left key light, garment centred and filling about 80%. Export as PNG or WebP with transparency.

| # | File | Size | Description |
|---|---|---|---|
| 24 | `model-classic.png` | 96×96 (+192) | White classic-fit crew-neck tee, regular length, front view. |
| 25 | `model-premium.png` | 96 | White premium tee, slightly longer, visibly thicker and smoother fabric. |
| 26 | `model-oversize.png` | 96 | White oversized tee: dropped shoulders, wide boxy body, longer sleeves. |
| 27 | `model-vneck.png` | 96 | White V-neck tee, front view. |
| 28 | `model-longsleeve.png` | 96 | White long-sleeve crew tee with rib cuffs. |
| 29 | `model-kids.png` | 96 | Small white kids' tee with shorter proportions. |

## 4. Viewer (centre)
| # | File | Size | Where | Description |
|---|---|---|---|---|
| 30 | `icon-zoom-in.png` | 20 | Top-right tool | Magnifying glass with a "+" inside the lens. |
| 31 | `icon-fullscreen.png` | 20 | Top-right tool | Four corner brackets pointing outward (expand). |
| 32 | `icon-arrow-left.png` / `-right.png` | 20 (in a 44 circle) | Carousel arrows | Thin chevrons; the circle is drawn in CSS (white, soft shadow). |
| 33 | `icon-3d-cube.png` | 18 (white + dark) | "3D View" toggle | Isometric cube outline showing the top face plus two side faces. |
| 34 | `icon-2d-design.png` | 18 | "2D Design" toggle | Rounded rectangle canvas with a small pencil crossing its bottom-right corner. |
| 35 | `icon-mockup.png` | 18 | "Mockup" toggle | Square frame with a smaller inner rectangle (photo) and a tiny corner fold. |

### 4a. View thumbnails (bottom strip, photoreal renders; same lighting as §3b)
| # | File | Size | Description |
|---|---|---|---|
| 36 | `view-front.png` | 72×72 (+144) | White tee, front view. |
| 37 | `view-back.png` | 72 | White tee, back view (no neck label visible). |
| 38 | `view-left.png` | 72 | White tee, left profile (90°), showing the sleeve and side seam. |
| 39 | `view-right.png` | 72 | White tee, right profile. |
| 40 | `view-collar.png` | 72 | Close-up looking down into the collar and inner neck label area. |

## 5. Right info panel
| # | File | Size | Where | Description |
|---|---|---|---|---|
| 41 | `info-material.png` | 24 (on a 44 rounded tile `#F2F2F4`) | Material row | Fabric swatch: a square patch with a zig-zag stitched edge and 3 diagonal weave lines inside. |
| 42 | `info-fit.png` | 24 | Fit row | T-shirt outline, same as #6 but at 24px and in the dark colour. |
| 43 | `info-sizes.png` | 24 | Sizes row | Diagonal double-headed arrow (bottom-left ↔ top-right) with open arrowheads. |
| 44 | `feature-breathable.png` | 32 | Feature row | Three short wavy airflow lines rising upward from a horizontal fabric line, with small dots between them. |
| 45 | `feature-durable.png` | 32 | Feature row | Shield outline with a check mark inside. |
| 46 | `feature-comfort.png` | 32 | Feature row | Stretch symbol: an inverted "U" fabric band with arrows pulling outward left and right at its base. |
| 47 | `photo-fabric-cotton.png` | 160×134 (+320×268) | "Premium Quality" card | Macro photo of soft folded white cotton jersey, gentle diagonal folds, soft daylight, shallow depth of field, light grey tones, no logos. |
| 48 | `texture-neck-label.png` | 128×128 | Neck label on the 3D model | Small woven label, white, printed black **T** mark and a tiny "Threadline" wordmark, subtle weave texture. |

## 6. Bottom status bar
| # | File | Size | Label | Description |
|---|---|---|---|---|
| 49 | `bar-rotate-360.png` | 20 | 360° Rotate | Circular arrow nearly closed, with the arrowhead at the top-left. |
| 50 | `bar-zoom.png` | 20 | Zoom | Magnifying glass with "+" (same as #30). |
| 51 | `bar-reset-view.png` | 20 | Reset View | Counter-clockwise circular arrow with the arrowhead at the top-left, open at the bottom-right. |
| 52 | `bar-studio-light.png` | 20 | Studio Light | Light bulb outline: round bulb, a two-line base, short rays on either side. |
| 53 | `bar-hd.png` | 20 | High Quality | Rounded rectangle badge outline containing the bold letters **HD**. |

## 7. Not images (build these in CSS/HTML)
Step badges "1 / 2 / 3", avatar "A" circle, colour swatches, size chips, segmented tabs (Front/Back/Left/Right/Collar, Product Info/Printing Areas), the carousel arrow circles, and all buttons.

---
**Totals:** 53 numbered entries.
- **Line icons:** export each at @1x, @2x and @3x.
- **Illustrations (§3a):** 4.
- **Product renders (§3b, §4a):** 11.
- **Photo/texture (§5, #47–48):** 2.
