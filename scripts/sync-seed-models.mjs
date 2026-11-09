// Local dev only: copy the seed catalog's garment models (e.g. new cloth-simulated GLBs) into the tenant's
// stored catalog, replacing models with the same id and keeping admin-added models and other edits.
//   npm run build:server && node scripts/sync-seed-models.mjs [tenant]
import { execSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import { defaultCatalog } from '../supabase/functions/_shared/domain.js'

const env = Object.fromEntries(execSync('npx supabase status -o env', { encoding: 'utf8' }).split(/\r?\n/)
  .map((l) => l.match(/^(\w+)="?(.*?)"?$/)).filter(Boolean).map((m) => [m[1], m[2]]))
assert(['localhost', '127.0.0.1'].includes(new URL(env.API_URL).hostname), 'Local development only')
const db = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const tenant = process.argv[2] ?? 'default'

const { data: row, error: readErr } = await db.from('catalogs').select('catalog').eq('tenant_id', tenant).maybeSingle()
if (readErr) throw readErr
if (!row) { console.log(`No stored catalog for ${tenant}: the app already uses the seed.`); process.exit(0) }
const catalog = row.catalog
for (const seed of defaultCatalog.products) {
  const stored = catalog.products.find((p) => p.id === seed.id)
  if (!stored) continue
  // Seed models first in seed order (the first is the default), then models only the admin added.
  stored.models = [...seed.models, ...stored.models.filter((m) => !seed.models.some((s) => s.id === m.id))]
  console.log(`${seed.id}: ${stored.models.map((m) => `${m.id}:${m.source.type}`).join(', ')}`)
}
const { error } = await db.from('catalogs').upsert({ tenant_id: tenant, catalog })
if (error) throw error
