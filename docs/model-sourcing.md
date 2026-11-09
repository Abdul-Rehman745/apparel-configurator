# Model and texture sourcing

Reviewed 2026-09-24. The latest verification and no-login sourcing pass is below. Earlier marketplace research is retained afterward; those search-index claims are not downloaded-file inspection.

## Current integration (supersedes the earlier rejection below)

The user requested preparation of the existing hanging-shirt asset despite its deliberately low-poly appearance. The CC0 3D Assets shirt is now **Real Tee** (`real-tee`). Nour's horizontal-arm model is not offered as a size variant: it is a different shape/pose, not a measured size of this garment.

- Removed all hanger/fitting meshes, retaining `tshirt-on-hanger_3`. The current `prepare_tshirt.py` works in Blender Z-up, then exports glTF Y-up once. It measures the lower torso for splitting and uses each sleeve's principal axis for UVs. Back U is mirrored for readable rear artwork. Sleeve seam-crossing faces are unwrapped across the seam; tube-interior faces spanning the whole wrap are kept out of printable UV space.
- Source license and hash: `models/raw/3dassets-hanging-shirt.source.json`. Rebuild with the installed Blender: `blender.exe --background --python-exit-code 1 --python models/prepare_tshirt.py -- models/raw/3dassets-hanging-shirt.glb models/hanging-prepared --mesh tshirt-on-hanger_3 --source-json models/raw/3dassets-hanging-shirt.source.json`.
- Prepared asset: `models/hanging-prepared/tshirt-panels.glb`; bundled copy: `public/models/tshirt-cc0-hanging.glb`. Dimensions in `models/hanging-prepared/panel_measurements.json` are preview estimates, not manufacturer-calibrated measurements.
- Uploaded through authenticated `/admin`, mapped using catalog import, recorded license/author/source/redistribution, and published to the **local** default tenant. Its source there is a content-addressed storage asset. The seed uses the bundled file. The earlier duplicate `hanging-tee` entry was removed. Existing procedural alternatives remain.
- Fixed GLB CanvasTexture orientation (`flipY=false`) and its corresponding raycast-to-print coordinates. `src/3d/printSurface.test.ts` covers both GLB and procedural conventions.
- Sleeve print areas are restricted to a continuous 3 × 2 inch patch, 3 inches below the panel's UV top. The larger shoulder-spanning area showed gaps in the app and was rejected.
- In-app QA used fresh anonymous browser contexts at `/?product=tshirt&model=real-tee&checker=full_front`, `full_back`, `left_sleeve`, and `right_sleeve`. Captures are `artifacts/glb-qa/checker-<area>.png`; `scripts/verify-glb-checkers.mjs` waits for four actual scene meshes, not merely a mounted canvas. The temporary local publishing account and its admin membership were removed afterward.
- Exported published catalog: `artifacts/glb-qa/catalog.json`. Its uploaded asset reference belongs to the local storage instance; a hosted deployment must upload the GLB there too or use the bundled `/models/tshirt-cc0-hanging.glb` URL. Copying catalog JSON alone does not transfer storage objects.

### Final local verification — 2026-09-24

- Production build (including `build:server`): passed. Existing bundle-size warnings remain.
- Unit tests: 18/18 passed. Backend tests: 9/9 passed after restarting the local edge worker, which had reported CPU-limit timeouts.
- Full browser suite: 18/19 passed initially; checkout timed out while the worker was unhealthy. The failed checkout test passed on its isolated rerun after the restart, covering all 19 scenarios across the two runs.
- Front/back and both 3 × 2 inch sleeve checker patches were visually inspected in the running app: complete grids, readable labels, arrows pointing up. This validates preview mapping, not manufacturing measurements.
- Temporary local admin account removed by the publishing script; temporary service-key status file deleted.

### Hosted-project handoff

[apparel-configurator dashboard](https://supabase.com/dashboard/project/acszgfdgkfpslaxletbl)

- Organization: Abdul-Rehman's Org (`khnellrffjlsgotoekhv`). Project reference: `acszgfdgkfpslaxletbl`.
- Region: Mumbai (`ap-south-1`), selected as a nearby option for Pakistan; latency was not benchmarked.
- Creation quote: $0/month; project returned `ACTIVE_HEALTHY` on creation.
- **Created only.** Hosted migrations, edge-function deployment, production RLS/storage verification, and frontend environment changes have not been performed. The user requested to handle the deployment step. Local development remains connected to local Supabase.

## Earlier verification and no-login sourcing pass

- All 11 seed products / 13 model variants in `src/products/defaultCatalog.ts` still use `proceduralModel(...)`. No product, model default, admin catalog or rendering implementation was changed.
- `npm test`: 17/17 passed. `npm run build`: passed, with the existing large-chunk warning.
- Local Supabase startup completed using the already-installed cached CLI after `npx` encountered sandbox network restrictions. `npm run test:backend`: 9/9 passed, including a repeat after startup.
- `node scripts/verify-garment-renders.mjs`: t-shirt, hoodie and polo loaded at port 5190, selected the expected models, reported only procedural catalog sources, and produced no page errors. Screenshots in `artifacts/garment-verification/{tshirt,hoodie,polo}.png` were visually inspected: upright garments with the expected features, still visibly simplified approximations.
- Poly Pizza API queries: `hanging shirt`, `shirt mannequin`, `worn t-shirt`. Metadata saved in `artifacts/garment-verification/poly-search.json`; inspected thumbnail sheet at `source-previews.png` in the same directory. Previously rejected branded/folded/Nour shirts were not downloaded again. Remaining previews showed full characters, a T-posed jacket, a flat white object, or furniture rather than a suitable standalone shirt.
- Sketchfab, CGTrader and Meshy downloads skipped as requested. No accounts created or sign-ins attempted.

### New inspected candidate: not adopted

[T shirt on a hanger — 3D Assets](https://3dassets.dev/assets/clothing-rail-and-wardrobe-tshirt-on-hanger-c0e0e17d)

- Source/author: 3DAssets.dev / **3D Assets**, author profile https://3dassets.dev/u/3dassets.
- License: **CC0 1.0 Universal**, https://creativecommons.org/publicdomain/zero/1.0/. Listing explicitly permits commercial use, modification and redistribution; attribution not required. Page evidence retained as `artifacts/garment-verification/hanging-shirt-page.html`.
- Download date: 2026-09-24. Direct file: https://cdn.3dassets.dev/assets/35447/v1/model.glb.
- Local original: `models/raw/3dassets-hanging-shirt.glb`, 44,892 bytes. SHA256: `A2FA84A62DC7A856835DA14741F94A148DB3AA1E1C76B99A57000F1A9436B4A8`.
- Thumbnail inspected **before** download: upright hanging silhouette, visibly faceted; saved browser screenshot `artifacts/garment-verification/hanging-preview.png`.
- GLB JSON: no `images`; material names `metal`, `navy`, `dark`, `rust`; no baked texture branding found. This is not a guarantee against every possible trademark issue.
- Blender import/apply-transforms diagnostic: garment mesh `tshirt-on-hanger_3` has XYZ extents **0.57118 × 0.13997 × 0.64379**, in Blender Z-up space. Central torso area-weighted absolute normals XYZ: **0.0000, 0.99979, 0.01847**. This supports an upright torso facing sideways, not upward. Diagnostic measures central torso faces on both sides; absolute components avoid front/back cancellation.
- Garment has **648 faces**, and all four imported meshes have **zero UV layers**. Hanger and fittings are separate meshes. It would need UV authoring, panel preparation and visual refinement; its coarse silhouette is not the realistic quality upgrade sought here. Rejected for this adoption pass, not because its pose is wrong.
- No splitting, admin upload, checker-grid acceptance or publication performed. Procedural defaults remain intact. No production-ready GLB accepted.

Reproduce pose inspection with the installed Blender executable: `blender.exe --background --python models/diagnose_pose.py -- models/raw/3dassets-hanging-shirt.glb`.

**Existing splitter warning:** `models/prepare_tshirt.py` takes only the first imported mesh and treats Blender Y as height. glTF imports are converted to Blender Z-up. Do not reuse it unchanged: select the actual garment, reconcile coordinate axes, and verify the silhouette before interpreting measurements or splitting. The prior rejected files remain excluded; an upward normal alone without a verified coordinate convention is insufficient to establish their pose.

## Model shortlist

| Candidate | Evidence | Decision |
| --- | --- | --- |
| [Short Sleeve T-Shirt — chokybali](https://sketchfab.com/3d-models/short-sleeve-t-shirt-0b1df31312444436b390a687875bdbfe) | Indexed author page lists CC Attribution, 796.3k triangles, CLO3D original and OBJ/GLB/FBX export. Direct page returned 403. Exact license version and archive contents not independently verified. | First candidate to inspect. Requires reduction and print-panel UV inspection. CLO3D origin alone does not establish suitable UVs. |
| [Long Sleeve T-Shirt — chokybali](https://sketchfab.com/3d-models/long-sleeve-t-shirt-ef22cf345c174b569fdfa6a653a6bf6f) | Indexed title confirms model and author. Direct page returned 403; supplied CC BY 4.0 claim remains unverified in this review. | Secondary candidate; same author does not guarantee matching construction. |
| [Male tshirt — fashion3designn](https://sketchfab.com/3d-models/male-tshirt-2c3e2511d0d14abf952d4cacd55db96a) | Indexed author page lists CC Attribution, 1.2M triangles, OBJ, UV maps, textures and CLO3D project. Direct page returned 403. | Backup with explicitly advertised source assets; more geometry to reduce. |
| [Meshy gallery](https://www.meshy.ai/tags/t-shirt) | Gallery FAQ says pre-made assets are CC0; downloading requires a free account. It distinguishes these from models generated on the free plan, which require attribution under CC BY 4.0. | No individual model selected. Inspect its topology and UVs rather than assuming automatic UVs are suitable or unsuitable. |
| [Clothing and Character Kit](https://sketchfab.com/3d-models/clothing-and-character-kit-10-cc0-7c733dceb2e04c4fb7e7dbd85316c1e7) | User reports conflicting title/license and rough quality; direct page unavailable. | Keep excluded pending clear evidence. |
| [CGTrader catalog](https://www.cgtrader.com/3d-models/t-shirt) | A catalog is not a license grant. Individual listings have their own terms. | No purchase or download selected. Check browser-delivered asset redistribution rights for a specific listing. |

Before adopting a model, retain its downloaded license, creator/source URL, acquisition date, original archive and checksum. Confirm the exact attribution wording and license version; record optimization and UV changes. Do not transfer license assumptions between marketplaces.

## Texture shortlist

- [ambientCG Fabric 070](https://ambientcg.com/view?id=Fabric070): photometric-stereo PBR material tagged sportswear; 1K JPG package is listed at 9 MB. Candidate for a sport fabric, not a verified match for the default cotton jersey. [ambientCG license](https://docs.ambientcg.com/license/) explicitly permits commercial use and distribution of raw files under CC0 1.0.
- [Poly Haven](https://polyhaven.com/license): CC0 assets permit commercial use and redistribution. No particular cotton-jersey material selected; a generic woven fabric should not be presented as a verified jersey scan.
- Keep the existing procedural material until a visually suitable texture is inspected. The generated cotton UI photo is promotional imagery, not a calibrated seamless PBR texture.

## Preparation required by this app

`src/3d/Viewer.tsx` resolves printable meshes by each catalog panel's `mesh` name. A single whole-garment mesh with a packed UV atlas cannot be substituted without preparation. Its imported materials are replaced by the app's fabric and print materials, so bundled PBR textures are not automatically retained.

1. Inspect the archive in a 3D editor: garment only, topology, dimensions, UVs and included license.
2. Reduce toward the existing project target of roughly 50k triangles, preserving silhouette and seams; bake details if needed.
3. Prepare named front/back/sleeve panels matching the catalog, measured panel dimensions and print-compatible UV coordinates. Keep trims separate.
4. Export a Y-up GLB facing +Z. Check scale against the viewer's height normalization.
5. Verify front/back/sleeve placement with a measured grid and asymmetric test artwork; check seam continuity, colors, mobile performance and exported production dimensions.

Earlier marketplace acquisition was pending because pages were inaccessible to the research client and no authenticated download was available. The later no-login acquisition above also did not yield an approved production model.
