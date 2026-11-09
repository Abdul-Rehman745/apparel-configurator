// Server-side checkout gate. Never trusts the browser's price or validation:
// loads the saved design + tenant catalog, re-validates, re-prices, verifies every
// referenced upload's file signature, then writes an immutable cart item.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { blocking, computePrice, defaultCatalog, deserializeDesign, needsApproval, priceInput, resolve, sniff, totalQty, validateDesign } from '../_shared/domain.js'

const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } })

interface Body { tenantId: string; configurationId: string; sessionId: string; clientTotal?: number; previews?: Record<string, string> }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

  let body: Body
  try { body = await req.json() } catch { return json(400, { error: 'Invalid JSON' }) }
  const { tenantId, configurationId, sessionId } = body
  if (!/^[a-z0-9-]{1,40}$/.test(tenantId ?? '') || !/^[A-Z]{1,12}-[A-Z2-9]{6}$/.test(configurationId ?? '') || !/^[A-Za-z0-9_-]{16,64}$/.test(sessionId ?? '')) {
    return json(400, { error: 'Invalid request' })
  }

  const ip = (req.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim()
  const { data: allowed } = await db.rpc('hit_rate_limit', { p_key: `cart:${ip}`, p_max: 30, p_window_seconds: 600 })
  if (allowed === false) return json(429, { error: 'Too many requests — please wait a moment.' })

  const [{ data: row }, { data: cat }] = await Promise.all([
    db.from('designs').select('design, tenant_id').eq('id', configurationId).maybeSingle(),
    db.from('catalogs').select('catalog').eq('tenant_id', tenantId).maybeSingle(),
  ])
  if (!row) return json(404, { error: 'Saved design not found' })
  if (row.tenant_id !== tenantId) return json(403, { error: 'Design belongs to another store' })

  let design
  try { design = deserializeDesign(JSON.stringify(row.design)) } catch (e) { return json(422, { error: (e as Error).message }) }
  const catalog = cat?.catalog ?? defaultCatalog

  // Every referenced upload must exist and be what it claims to be.
  const assetIds = [...new Set(Object.values(design.areas).flatMap((a: any) => a.objects.map((o: any) => o.assetId).filter(Boolean)))] as string[]
  const missing = new Set<string>()
  for (const id of assetIds) {
    const { data: meta } = await db.from('assets').select('path, mime, kind').eq('id', id).maybeSingle()
    if (!meta) { missing.add(id); continue }
    const { data: file } = await db.storage.from('uploads').download(meta.path)
    if (!file) { missing.add(id); continue }
    const kind = sniff(new Uint8Array(await file.slice(0, 1024).arrayBuffer()))
    const ok = meta.kind === 'svg' ? kind === 'image/svg+xml' : meta.kind === 'raster' ? kind === meta.mime : true
    if (!ok) return json(422, { error: `Upload ${id} failed verification.` })
  }

  const issues = validateDesign(catalog, design, { missingAssets: missing })
  const errors = blocking(issues)
  if (errors.length) return json(422, { error: 'Design is not print-ready', issues: errors })

  const price = computePrice(catalog.pricing, priceInput(catalog, design))
  const priceMismatch = typeof body.clientTotal === 'number' && Math.abs(body.clientTotal - price.total) > 0.01
  const { product, model, size } = resolve(catalog, design)
  const skuOf = (id: string) => product.sizes.find((s: any) => s.id === id)?.sku ?? id
  const approval = needsApproval(issues)
  const result = {
    resultVersion: 1, configurationId, createdAt: new Date().toISOString(), tenantId,
    product: { id: product.id, title: product.title, modelId: model.id },
    variant: { sizeId: size.id, sku: size.sku, colors: design.colors, materialId: design.materialId, methodId: design.methodId },
    quantity: totalQty(design),
    units: design.bulk.enabled && design.bulk.rows.length
      ? design.bulk.rows.map((r: any) => ({ sizeId: r.sizeId, sku: skuOf(r.sizeId), qty: r.qty, name: r.name, number: r.number }))
      : [{ sizeId: design.sizeId, sku: skuOf(design.sizeId), qty: design.quantity }],
    configurationSnapshot: JSON.stringify(row.design),
    pricingSnapshot: price,
    previews: Object.fromEntries(Object.entries(body.previews ?? {}).filter(([k, v]) => /^[a-z]{1,12}$/.test(k) && /^previews\/[A-Z]{1,12}-[A-Z2-9]{6}-[a-z]{1,12}\.webp$/.test(String(v)))),
    productionJob: { id: `JOB-${configurationId}`, status: approval ? 'requires_approval' : 'pending' },
  }
  const { data: item, error } = await db.from('cart_items').insert({
    tenant_id: tenantId, session_id: sessionId, configuration_id: configurationId, result,
    server_total: price.total, currency: price.currency, requires_approval: approval,
  }).select('id').single()
  if (error) return json(500, { error: 'Could not add to cart' })
  return json(200, { ok: true, cartItemId: item.id, total: price.total, currency: price.currency, priceMismatch, requiresApproval: approval })
})
