# Studio UI assets

Assets live in `public/assets`. Standard interface symbols use Lucide React (ISC licence, included with the installed package). The PNG export is available in `public/assets/icons` at 1×, 2× and 3×. White variants serve the dark tool rail and buttons. All icon canvases have real transparent alpha; no background rectangles are baked in. Stroke width scales with output resolution.

`node scripts/export-icons.mjs` rebuilds the icon pack and four original garment illustrations. `node scripts/verify-icons.mjs` checks every PNG for transparency and visible artwork.

`node scripts/capture-view-thumbnails.mjs` renders the five navigation thumbnails from the internally authored procedural garment. Run the development server on port 5190 first. These neutral thumbnails illustrate camera directions; the live 3D viewer displays the selected model, color and artwork.

## Generated imagery

The following images were generated with the built-in image generator. They are UI illustrations rather than photographs of a manufactured product or replacements for interactive 3D models. No marketplace model was downloaded.

| File | Final prompt |
|---|---|
| `fabric-cotton.png` | Single square macro photograph of soft folded white cotton jersey. Gentle diagonal folds, fine knit, soft daylight, shallow depth of field, neutral light grey tones. Edge-to-edge textile, no logos, text or border. |
| `model-classic.png` | White classic-fit crew-neck cotton tee, front view, ghost mannequin, realistic soft folds and stitched hems. Entire garment centered, filling 85% of a square. Pale grey studio background and soft top-left light. No person, logos, text or props. |
| `model-premium.png` | White premium heavyweight cotton crew-neck tee, straight-on ghost-mannequin view, regular fit, slightly longer body, smooth thick fabric and sewn hem. Full garment with 10% margins. Pale cool grey studio background, upper-left lighting. No logos, text or person. |
| `model-oversize.png` | White oversized cotton crew-neck tee, straight-on ghost-mannequin view, wide boxy body, dropped shoulders and longer wide sleeves. Full garment with 10% margins. Pale cool grey studio background, upper-left lighting. No logos, text or person. |

The textile photo and product renders intentionally retain their neutral studio backgrounds. The UI icons, garment illustrations and camera thumbnails are transparent PNGs.
