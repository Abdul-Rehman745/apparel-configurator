# Apparel Configurator

White-label 3D garment personalisation platform: Three.js (React Three Fiber) product viewer, Fabric.js print-area editor, UV-mapped print zones, production validation, print-ready export and a data-driven admin.

```
npm install
npm run dev          # http://localhost:5173 (the workspace launch config uses 5190)
npm test             # vitest — pricing, DPI, validation, serialisation, migrations, remapping, sniffing, catalog checks
npm run build        # type-check + production bundle (strict CSP injected)
```

| Route | Purpose |
|---|---|
| `/catalog` | Storefront catalog: every published product, category filter, colour preview, links into the studio |
| `/` | Configurator (`?tenant=brand-b`, `?product=polo&model=polo`) |
| `/design/:ID` | Re-open a saved/shared design |
| `/admin` | Configurator builder (per tenant: `/admin?tenant=brand-b`) |
| `/?product=…&model=…&checker=<areaId>` | Admin QA: fills an area with a numbered checker grid |

## Architecture

### Threadline Studio interface

The reference-style studio includes the dark tool rail, garment/model selectors, product information and printing-area tabs, five camera thumbnails, 2D/3D editing, a Help dialog, and a persistent order summary. Tablet and phone layouts use the bottom sheet to keep the preview accessible. Use the existing launch entry on port 5190.

Transparent PNG icons and their export/verification commands are documented in [Studio assets](docs/studio-assets.md). Every catalog garment is a cloth-simulated GLB sewn from its own pattern (see *Sewn garments* below); a CC0 scanned tee remains as an extra T-shirt model. The generated catalog images are illustrations.

Browser checks: `npx playwright test e2e/studio.spec.ts e2e/configure.spec.ts e2e/mobile.spec.ts --workers=1`. Studio screenshots are saved under `artifacts/`.

```
src/
  core/          domain types (Catalog, Product, GarmentModel, Panel, PrintArea…) + design document schema
  products/      seed catalog, procedural model factory, catalog lookups
  3d/            garment geometry (procedural + GLB), print-surface textures, R3F viewer, camera rig
  design-engine/ single live Fabric editor, offscreen doc rendering, objects, fonts, templates, store⇄editor⇄3D sync
  print-areas/   DPI maths
  validation/    production validation engine (pure)
  pricing/       rule-based pricing engine (pure)
  state/         zustand store with command-style undo/redo, versioned serialisation + migrations
  assets/        content-addressed asset store, upload pipeline (signature sniffing, SVG sanitising), clipart
  export/        production package (PNG @ production DPI, SVG, design JSON, manifest, originals), ConfigurationResult
  api/           design/catalog persistence, commerce adapters, analytics bus
  tenants/       brand config, theming, feature flags
  admin/         admin builder + catalog validation
  ui/            React UI (desktop grid / mobile bottom-sheet)
```

**Sources of truth.** The `DesignState` in the store is authoritative. Each print area stores Fabric JSON plus derived `ObjectSummary` metadata (physical bounds, colours, DPI inputs), so validation, pricing and export never need a live canvas. Only one Fabric canvas exists (the active area). Every other area renders offscreen when its data changes. Three.js meshes hold no business state.

**Coordinates.** Every print area is a Fabric document in *design units*: 50 units per physical inch (`DESIGN_PPI`). Areas are placed on *panels* in inches, and a panel is a mesh whose UV 0–1 square spans a known physical width and height. As a result, screen pixels never define print size, production files render at `inches × DPI`, and the 3D texture is just a lower-resolution render of the same document.

**2D → 3D.** Each Fabric change renders the area bitmap into its panel's `CanvasTexture`. Textures are created once per model and only flagged `needsUpdate`. Updates are throttled at half resolution while dragging, and a full-quality update follows on release. Rendering is on demand (`frameloop="demand"`).

**3D → 2D.** In Design mode, a raycast gives a UV, which maps to panel inches, then to area design units. `editor.hitTest` then selects the object and drags it. OrbitControls are disabled for that gesture. A jump larger than 3" (a seam crossing) aborts the drag and switches to the 2D editor.

## Sewn garments (cloth simulation)

`models/sew_garment.py` (Blender, headless) turns a garment spec into a realistic GLB:

1. **Pattern drafting** — front/back with armholes, shoulder slope and neckline (crew, V, scoop, collar, hood), sleeves with a cap matched to the armhole, cuffs, neck rib, collar, hem rib, two-piece hood, kangaroo pocket, placket. Front/back/sleeve pieces are cut to exactly the panel inches in the catalog, so every print area keeps working.
2. **Sewing** — pieces start wrapped around a mannequin on a shoulder-shaped surface; seams are Blender sewing springs, rib knit is ~10× stretchier than the body fabric, and the garment settles under gravity (cotton-like mass and stiffness).
3. **Finishing** — light smoothing, subdivision, seams welded across panels, ambient occlusion baked into vertex colours (the viewer multiplies fabric and print by it), Draco GLB with one mesh per panel (`shirt_front`, `shirt_back`, `shirt_back_inside`, `shirt_left_sleeve`…) and trims (`shirt_neck_rib`, `shirt_hood_left`, `shirt_pocket`, `shirt_button_01`…). UVs are the flat pattern pieces, so prints are distortion-free by construction.

```
npm run build:server && node scripts/garment-specs.mjs   # models/specs/<model>.json: garment + panel sizes from the seed catalog
bash models/sew_all.sh                 # all models, 3 Blender processes at a time (≈2–3 min each)
bash models/sew_all.sh hoodie polo     # selected models
cp models/sewn/<m>/<m>.glb public/models/sewn/
npm run build:server && node scripts/sync-seed-models.mjs   # local stored catalog picks up seed models
SEWN_MODELS="tshirt:basic-tee,hoodie:hoodie" npx playwright test e2e/sewn-models.spec.ts
```

Each run writes front/back/side/three-quarter renders and a `.report.json` (piece sizes, triangle count) next to the GLB, and prints seam gaps and fabric stretch. In the catalog, `sewn({ … })` in `src/products/defaultCatalog.ts` is a procedural model whose source is the sewn GLB.

## Adding a garment (no code changes)

**Procedural** (built-in, no asset licensing exposure): in `/admin → Products`, add a model and set kind, collar, chest, length, sleeve, placket, pocket and cuffs. Panels and the standard print areas (front, chest, back, upper/lower back, neck, sleeves, cuffs, collar) are generated, and you can then adjust them in **Print areas**.

**GLB** (production-quality assets): **Upload GLB**. The admin lists the meshes, flags any without UVs or with meaningless names, and lets you map meshes to panels and enter each panel's UV span in inches. Then add print areas, and use **Test with checker artwork** to confirm orientation and stretching before publishing.

GLB preparation standard (Blender):
- Units in inches or metres (scale is normalised on load); Y-up; front facing +Z; hem at origin.
- One mesh per printable panel (`shirt_front`, `shirt_back`, `shirt_left_sleeve`…) with non-overlapping, roughly *isometric* UVs. The UV square should cover a measured W×H inches; record it in the admin.
- Trims (collar rib, buttons, seams) as separate meshes. Materials are replaced at runtime.
- Export with Draco or Meshopt compression; keep each garment under about 50k triangles.

Publishing is blocked until `validateCatalog` passes: areas must fit their panels, methods and cameras must exist, and every model and font needs a licence entry.

## Licensing policy

- **3D models:** the procedural garments are authored in code (licence: internal). GLB models must record their source, author, URL, licence, download date, attribution requirement and redistribution terms (admin → model). Reject editorial-only licences.
- **Fonts:** Google Fonts families under OFL-1.1 or Apache-2.0. Uploaded fonts require a licence text plus a confirmation that it covers commercial embedding.
- **Clipart:** the built-in library is original artwork. Tenant clipart requires an author and licence.
- **Fabric normal maps:** generated procedurally.
- **Customer uploads:** customers must confirm they have the rights to print them.
- `/admin → Asset licences` shows every entry and exports them as CSV.

## Integration

The configurator emits an immutable `ConfigurationResult` containing the serialised design snapshot and hash, a pricing snapshot, per-unit SKUs, previews and a production-job reference. Adapters live in `src/api/commerce.ts`: local (demo), REST, Shopify Ajax cart, WooCommerce Store API, GraphQL, and `postMessage` for iframe embeds. The tenant's `commerce.adapter` selects one. Analytics goes through `track()` to pluggable sinks (dataLayer, postMessage and console are included).

**The backend must** re-validate and re-price the snapshot server-side, store assets in object storage behind signed URLs, and rate-limit uploads. The browser checks are for UX, not trust.

## Backend (Supabase)

```
npx supabase start            # local stack on ports 55421–55429 (another local project uses 5432x)
npx supabase functions serve --no-verify-jwt
npm run build:server          # re-bundle shared domain logic into supabase/functions/_shared
```
`.env.local` holds `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. If they are missing, the app runs offline on IndexedDB.

- **Designs:** stored via the `save_design` / `get_design` RPCs. The server generates the ID, and each call is size- and rate-limited. The tables have no direct anonymous access.
- **Uploads:** stored in the private `uploads` bucket at content-hash paths, with type and size limits. SVGs are stored as `text/plain`, and uploads are read through short-lived signed URLs, so designs reopen on any device.
- **Checkout:** the `add-to-cart` edge function reloads the saved design and the tenant catalog, re-validates the design, re-prices it (ignoring the client's total), and verifies each upload's file signature before writing `cart_items`.
- **Catalogs:** readable by anyone. Writes require a `tenant_admins` row (RLS), and the admin UI signs in with Supabase Auth. Create admin users in the Supabase dashboard, then add them to `tenant_admins`.

## Tests

| Command | Covers |
|---|---|
| `npm test` | Domain logic and print-texture orientation (18 tests) |
| `npm run test:backend` | Supabase RPCs, RLS, storage policy, server re-pricing and tamper checks (9 tests; needs the local stack) |

If the edge-runtime container is down, serve the function directly (`deno run -A supabase/functions/add-to-cart/index.ts` with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` set) and run the backend and E2E suites with `FUNCTIONS_URL=http://127.0.0.1:8000`.

| `npm run test:e2e` | Playwright: configure-to-cart flow, validation blocking, uploads, model switching, cross-device share links, autosave, production ZIP, mobile widths, admin, second tenant |

## Status: what is not done yet

- **Hosted Supabase (`acszgfdgkfpslaxletbl`, Mumbai) is live:** migration pushed, `add-to-cart` deployed, backend suite 9/9 against it (`SUPABASE_URL=https://acszgfdgkfpslaxletbl.supabase.co SUPABASE_ANON_KEY=… npm run test:backend`). `npm run build` reads `.env.production.local` and adds that origin to the CSP. The hosted `catalogs` table is empty, so the app uses the code catalog until an admin publishes. Create the first admin in Supabase Auth and add a `tenant_admins` row. Free-tier projects pause after a week idle.
- **3D garments:** all 13 catalog models are cloth-simulated GLBs with baked AO; fabric gets a yarn colour texture (heather/marl mottling), dye-tinted sheen and a weave normal map. Not yet: manufacturer-exact patterns per brand, fabric-specific drape presets beyond rib vs body, and a folded spread collar (dress-shirt collars stand). The older CC0 scanned tee is kept as “Scanned Tee (CC0)”.
- **Mesh names per garment:** [docs/mesh-spec.md](docs/mesh-spec.md) lists the meshes, UV sizes and print areas a GLB needs to replace each procedural model.
- **Export:** PNG and SVG only; no PDF. SVG text references font families rather than outlines, so production needs the fonts listed in the manifest.
- **Uploads:** PDF uploads are rejected (they need server conversion). Background removal is a white-key filter, not ML.
- **Not implemented:** barcodes; image-based print masks (no-print zones are rectangles); embroidery digitising (the preview is a visualisation only).
- **Performance:** no KTX2 or LOD, since no bitmap textures ship. Undo history is in memory only; the design itself autosaves.
- **E2E:** Playwright covers checkout, sharing, export, admin, mobile and real-model UV orientation. Fresh-browser checker captures use `node scripts/verify-glb-checkers.mjs` with the dev server on port 5190.
