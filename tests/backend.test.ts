// Integration tests against the local Supabase stack (`npx supabase start` + `npx supabase functions serve`).
// Run: npm run test:backend
import { beforeAll, describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { SCHEMA_VERSION, type DesignState } from '../src/core/design'

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:55421'
const ANON = process.env.SUPABASE_ANON_KEY ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const FN = process.env.FUNCTIONS_URL ?? `${URL}/functions/v1`
const anon = createClient(URL, ANON, { auth: { persistSession: false } })

const design = (over: Partial<DesignState> = {}): DesignState => ({
  schemaVersion: SCHEMA_VERSION, productId: 'tshirt', modelId: 'basic-tee', sizeId: 'M', quantity: 2, materialId: 'cotton',
  colors: { body: 'navy' }, methodId: 'dtg', bulk: { enabled: false, rows: [] },
  areas: { full_front: { json: { objects: [] }, objects: [{ id: 'o1', name: 'Logo', kind: 'text', visible: true, locked: false, lockLevel: 'editable', bbox: { x: 100, y: 100, w: 200, h: 80 }, colors: ['#ffffff'], text: 'HELLO', textHeightIn: 1 }] } },
  ...over,
})

const session = 'test' + Math.random().toString(36).slice(2).padEnd(20, 'x')

async function addToCart(configurationId: string, clientTotal?: number) {
  const r = await fetch(`${FN}/add-to-cart`, {
    method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${ANON}`, apikey: ANON },
    body: JSON.stringify({ tenantId: 'default', configurationId, sessionId: session, clientTotal }),
  })
  return { status: r.status, body: await r.json() }
}

beforeAll(async () => {
  const r = await fetch(`${URL}/rest/v1/`, { headers: { apikey: ANON } }).catch(() => null)
  if (!r) throw new Error(`Supabase is not running at ${URL}. Start it with: npx supabase start`)
})

describe('designs', () => {
  it('saves and loads via RPC with a server-generated id', async () => {
    const { data: id, error } = await anon.rpc('save_design', { p_tenant: 'default', p_prefix: 't-shirt', p_design: design() })
    expect(error).toBeNull()
    expect(id).toMatch(/^TSHIRT-[A-Z2-9]{6}$/)
    const { data } = await anon.rpc('get_design', { p_id: id })
    expect(data.colors).toEqual({ body: 'navy' })
  })
  it('rejects malformed designs', async () => {
    const { error } = await anon.rpc('save_design', { p_tenant: 'default', p_prefix: 'x', p_design: { hello: 'world' } })
    expect(error?.message).toMatch(/malformed/)
  })
  it('denies direct table access to anonymous clients', async () => {
    const { data } = await anon.from('designs').select('*').limit(5)
    expect(data ?? []).toEqual([]) // RLS: no policies → nothing visible
    const { error } = await anon.from('designs').insert({ id: 'HACK-AAAAAA', tenant_id: 'default', schema_version: 2, design: {} })
    expect(error).not.toBeNull()
  })
})

describe('catalogs', () => {
  it('are readable but not writable anonymously', async () => {
    const { error } = await anon.from('catalogs').upsert({ tenant_id: 'default', catalog: { products: [], pricing: {} } })
    expect(error).not.toBeNull()
  })
})

describe('add-to-cart edge function', () => {
  it('re-prices server-side and ignores a tampered client total', async () => {
    const { data: id } = await anon.rpc('save_design', { p_tenant: 'default', p_prefix: 'tshirt', p_design: design() })
    const res = await addToCart(id, 0.01)
    expect(res.status).toBe(200)
    expect(res.body.total).toBe((18 + 5) * 2) // base + large front print, qty 2
    expect(res.body.priceMismatch).toBe(true)
    const { data: cart } = await anon.rpc('get_cart', { p_session: session })
    expect(cart.some((c: any) => c.configurationId === id && Number(c.serverTotal) === 46)).toBe(true)
  })
  it('refuses designs that fail production validation', async () => {
    const bad = design({ areas: { full_front: { json: {}, objects: [{ id: 'o1', name: 'Off', kind: 'text', visible: true, locked: false, lockLevel: 'editable', bbox: { x: -900, y: 0, w: 100, h: 100 }, colors: ['#000000'] }] } } })
    const { data: id } = await anon.rpc('save_design', { p_tenant: 'default', p_prefix: 'tshirt', p_design: bad })
    const res = await addToCart(id)
    expect(res.status).toBe(422)
    expect(res.body.issues[0].message).toMatch(/outside the Full front print area/)
  })
  it('refuses references to uploads that do not exist', async () => {
    const withImage = design({ areas: { full_front: { json: {}, objects: [{ id: 'o1', name: 'Pic', kind: 'image', visible: true, locked: false, lockLevel: 'editable', bbox: { x: 100, y: 100, w: 100, h: 100 }, colors: [], assetId: 'a_000000000000000000000000', image: { naturalW: 2000, naturalH: 2000, displayW: 100, displayH: 100 } }] } } })
    const { data: id } = await anon.rpc('save_design', { p_tenant: 'default', p_prefix: 'tshirt', p_design: withImage })
    const res = await addToCart(id)
    expect(res.status).toBe(422)
    expect(JSON.stringify(res.body)).toMatch(/missing/)
  })
  it('validates request shape', async () => {
    const res = await addToCart('not-an-id')
    expect(res.status).toBe(400)
  })
})

describe('storage', () => {
  it('only accepts content-addressed paths and allowed types', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
    const bad = await anon.storage.from('uploads').upload('default/evil.html', new Blob(['<script>'], { type: 'text/html' }), { contentType: 'text/html' })
    expect(bad.error).not.toBeNull()
    const id = 'a_' + [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, '0')).join('')
    const ok = await anon.storage.from('uploads').upload(`default/${id}.png`, new Blob([png], { type: 'image/png' }), { contentType: 'image/png' })
    expect(ok.error).toBeNull()
    const reg = await anon.rpc('register_asset', { p: { id, tenantId: 'default', kind: 'raster', mime: 'image/png', name: 't.png', width: 1, height: 1, hasAlpha: false, bytes: png.length, path: `default/${id}.png` } })
    expect(reg.error).toBeNull()
    const ghost = await anon.rpc('register_asset', { p: { id: 'a_111111111111111111111111', tenantId: 'default', kind: 'raster', mime: 'image/png', name: 'x', bytes: 10, path: 'default/a_111111111111111111111111.png' } })
    expect(ghost.error?.message).toMatch(/not found/)
  })
})
