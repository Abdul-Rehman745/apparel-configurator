# Handoff prompt: keep procedural garments as production default + source a real GLB

Paste everything below into a fresh session.

---

## Context

Project: `D:\Skills Agent Test\apparel-configurator` — a white-label 3D apparel configurator (React Three Fiber + Fabric.js + Supabase). Read `README.md` in that folder first for full architecture.

The 3D garment viewer currently supports two model sources per product:
1. **Procedural** (`src/products/modelFactory.ts` + `src/3d/proceduralGarment.ts`) — garment shapes generated in code from parametric dimensions (chest, length, sleeve, collar type, etc.). No licensing risk, always correctly posed (Y-up, hem at floor, arms hanging), and every seed catalog product (`src/products/defaultCatalog.ts`) currently uses this.
2. **GLB** — an uploaded/authored 3D model, mapped mesh-by-mesh to print panels via the admin (`/admin` → Products → 3D models → "Upload GLB", logic in `src/admin/AdminApp.tsx`).

**A prior session tried sourcing a free GLB and hit a real problem, documented so you don't repeat it:**

- Searched Sketchfab, CGTrader, Meshy (all require an account to download — skip these unless you're prepared to sign in yourself; Claude sessions cannot log into accounts or enter passwords).
- Found **Poly Pizza** (`poly.pizza`) serves direct, no-login `.glb` downloads with clear CC0/CC-BY licensing. Its real search API is `https://poly.pizza/api/search/<query>` (the rendered page is a client-side SPA, so `curl`ing the page itself returns nothing useful — hit the API).
- Downloaded three CC-BY t-shirt candidates to `models/raw/`:
  - `poly-google-tshirt.glb` — **rejected**: mesh named `Shirt_adid_1`, i.e. an Adidas-branded texture baked into the original Google Poly upload. Trademark risk regardless of the open geometry license.
  - `sirkitree-tshirt-folded.glb` — **rejected**: it's a folded flat-lay pose, wrong shape entirely.
  - `nour-tshirt.glb` ("T Shirt" by Nour, CC-BY 3.0, https://poly.pizza/m/oZOt671DyI) — **rejected after deeper inspection**: looked promising (single clean mesh, has UVs, no baked texture) but diagnostic analysis in Blender revealed it's modeled in a **flat T-pose with arms spread straight out**, not a standing/hanging worn silhouette. Its face-normal direction (`avg normal ≈ (0.13, 0.56, 0.82)`, i.e. pointing mostly *upward*, not sideways) is the tell. A worn/hanging garment's front-surface normal should point almost purely sideways (toward camera). This pose mismatch means panel width/height measurements came out physically nonsensical (a 30"-wide, 6.6"-tall "front panel") and the automatic front/back/sleeve split (which assumes hanging-pose geometry) can't correctly separate regions either. **This is not a rotation-fixable bug — T-pose-flat and hanging-pose are different topologies.**

**Blender is now installed** (portable, no system install) at:
```
D:\Skills Agent Test\tools\blender\blender-5.2.2-windows-x64\blender.exe
```
Run headless: `blender.exe --background --python <script.py> -- <args>`

The panel-splitting script used above is at `apparel-configurator/models/prepare_tshirt.py`. It:
- Imports a GLB, normalizes it (hem at Y=0, centered on X/Z).
- Splits one mesh into `shirt_front` / `shirt_back` / `shirt_left_sleeve` / `shirt_right_sleeve` by face-normal direction (front vs back) and local X-position threshold (torso vs sleeve).
- Does an automatic orthographic/cylindrical UV unwrap per panel.
- Outputs `panel_measurements.json` with each panel's estimated real-world width/height in inches.

**This script assumes a standing/hanging silhouette.** Before running it on any new source model, verify the pose the same way: import, apply transforms, check per-axis bounding-box extents and average face normal direction of the front-torso faces. A correctly-posed model's normal should point mostly along one *horizontal* axis with a small vertical component — not mostly vertical.

## Task

### Part A — confirm procedural stays the production default (should require no changes, verify only)

1. Confirm every product in `src/products/defaultCatalog.ts` still uses a `proceduralModel(...)` entry as its model (none should point at a GLB).
2. Run the full test suite and confirm green:
   ```
   cd apparel-configurator
   npm test              # 17 unit tests (pricing, DPI, validation, serialization, catalog checks)
   npm run test:backend  # 9 tests — needs `npx supabase start` running first
   npm run build         # type-check + production build
   ```
3. Spin up the dev server (`.claude/launch.json` → "apparel-configurator", port 5190) and visually confirm the garment renders correctly for at least: a t-shirt, the hoodie, and the polo (collar/placket/buttons should be visible). Check the browser console for errors.

If A finds nothing broken, no code changes are needed — just report it confirmed.

### Part B — keep sourcing a real GLB (background/opportunistic, not blocking)

1. Search Poly Pizza (`https://poly.pizza/api/search/<query>`, no login needed) and any other **no-login, direct-download** source for a t-shirt/polo/hoodie GLB. Good search terms: "shirt mannequin", "hanging shirt", "worn t-shirt", "apparel garment".
2. **Before downloading**, check the model's preview thumbnail/page — reject anything that looks flat, spread out, or T-posed. Look for a model shown on an invisible mannequin or hanging, with sleeves down.
3. **Before running the full split script**, diagnose the pose exactly like the prior session did (see the diagnostic snippet embedded as a comment at the top of `prepare_tshirt.py`, or re-derive: import, apply transforms, print per-axis bbox extents and average normal of the first ~200 faces). Only proceed to full panel-splitting if the pose checks out.
4. Also check for baked-in textures/materials that might carry third-party branding (a repeat of the `Shirt_adid_1` problem) — dump `json.images` and `json.materials` from the GLB's JSON chunk before trusting it.
5. If you find and validate a usable model: run `prepare_tshirt.py` (or an adapted version) on it, review `panel_measurements.json`, wire it in via `/admin` → Products → 3D models → Upload GLB, map meshes to panels using the measured inches, and verify visually using the admin's built-in QA tool: `/?product=<id>&model=<id>&checker=<areaId>` (paints a numbered checker grid on the print area so you can see if the UV mapping stretches or misaligns).
6. Record the license in the admin's model license fields (source, author, URL, license, attribution text) — the admin blocks publishing without it (`src/admin/validateCatalog.ts`).
7. If nothing suitable turns up, that's a fine outcome to report — procedural remains the shipped default either way.

## Success criteria

- [ ] Confirmed (or restored) all seed products use procedural models.
- [ ] `npm test`, `npm run test:backend`, `npm run build` all green.
- [ ] Garments visually verified in the browser (t-shirt, hoodie, polo minimum).
- [ ] Either: a properly-posed, correctly-licensed GLB is sourced, split, mapped, and checker-verified — or a clear note that no suitable free asset was found, with what was tried.
