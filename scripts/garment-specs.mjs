// Writes models/specs/<model>.json (garment spec + each panel's physical size) for models/sew_garment.py.
//   npm run build:server && node scripts/garment-specs.mjs
import { mkdir, writeFile } from 'node:fs/promises'
import { defaultCatalog } from '../supabase/functions/_shared/domain.js'

await mkdir('models/specs', { recursive: true })
for (const p of defaultCatalog.products) for (const m of p.models) {
  const garment = m.source.garment
  if (!garment) continue // scanned/uploaded GLBs have no pattern spec
  const panels = Object.fromEntries(m.panels.map((x) => [x.id, { w: +x.widthIn.toFixed(3), h: +x.heightIn.toFixed(3), mesh: x.mesh ?? `shirt_${x.id}` }]))
  await writeFile(`models/specs/${m.id}.json`, JSON.stringify({ product: p.id, model: m.id, garment, panels }, null, 1))
  console.log(m.id)
}
