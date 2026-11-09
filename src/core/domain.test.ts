import { describe, expect, it } from 'vitest'
import { defaultCatalog as catalog } from '../products/defaultCatalog'
import { computePrice } from '../pricing/pricing'
import { effectiveDpi, imageDpi, rateDpi } from '../print-areas/dpi'
import { validateDesign } from '../validation/validate'
import { deserializeDesign, DesignLoadError, serializeDesign } from '../state/serialize'
import { remapAreas } from '../design-engine/remap'
import { DESIGN_PPI, SCHEMA_VERSION, type DesignState, type ObjectSummary } from './design'
import { sniff } from '../assets/sniff'

const baseDesign = (over: Partial<DesignState> = {}): DesignState => ({
  schemaVersion: SCHEMA_VERSION, productId: 'tshirt', modelId: 'basic-tee', sizeId: 'M', quantity: 1, materialId: 'cotton',
  colors: { body: 'white' }, methodId: 'dtg', areas: {}, bulk: { enabled: false, rows: [] }, ...over,
})
const obj = (o: Partial<ObjectSummary> = {}): ObjectSummary => ({
  id: 'o1', name: 'Logo', kind: 'text', visible: true, locked: false, lockLevel: 'editable', bbox: { x: 100, y: 100, w: 100, h: 50 }, colors: ['#000000'], ...o,
})

describe('DPI', () => {
  it('computes pixels per printed inch', () => {
    expect(effectiveDpi(3000, 10 * DESIGN_PPI)).toBe(300)
    expect(imageDpi({ naturalW: 1200, naturalH: 600, displayW: 8 * DESIGN_PPI, displayH: 2 * DESIGN_PPI })).toBe(150)
  })
  it('accounts for size-scaled printing', () => expect(effectiveDpi(3000, 10 * DESIGN_PPI, 1.25)).toBe(240))
  it('rates against method thresholds', () => {
    const m = { minDpi: 150, goodDpi: 300 }
    expect(rateDpi(320, m)).toBe('good'); expect(rateDpi(200, m)).toBe('acceptable'); expect(rateDpi(118, m)).toBe('low')
    expect(rateDpi(10, { minDpi: 0, goodDpi: 0 })).toBe('n/a')
  })
})

describe('pricing', () => {
  const input = { productId: 'tshirt', modelId: 'basic-tee', materialId: 'cotton', methodId: 'dtg', premiumAssets: 0 }
  it('base + areas', () => {
    const r = computePrice(catalog.pricing, { ...input, units: [{ sizeId: 'M', qty: 1, personalized: false }], areas: [{ id: 'full_front', group: 'large', colorCount: 2 }, { id: 'full_back', group: 'large', colorCount: 1 }, { id: 'left_sleeve', group: 'sleeve', colorCount: 1 }] })
    expect(r.total).toBe(18 + 5 + 5 + 3)
  })
  it('size surcharges only apply to matching units and tiers discount', () => {
    const r = computePrice(catalog.pricing, { ...input, units: [{ sizeId: 'M', qty: 8, personalized: true }, { sizeId: '2XL', qty: 2, personalized: true }], areas: [{ id: 'full_front', group: 'large', colorCount: 1 }] })
    // 10 × (18 + 5 + 3 personalised) + 2 × 2 (2XL) = 264, 5% off
    expect(r.subtotal).toBe(264)
    expect(r.tier.pctOff).toBe(5)
    expect(r.total).toBe(250.8)
  })
  it('order-level setup fees are not discounted and colour rules multiply', () => {
    const r = computePrice(catalog.pricing, { ...input, methodId: 'screen', units: [{ sizeId: 'M', qty: 100, personalized: false }], areas: [{ id: 'full_front', group: 'large', colorCount: 3 }] })
    const unit = 18 + 2 + 3
    expect(r.subtotal).toBe(unit * 100 + 25)
    expect(r.total).toBe(unit * 100 * 0.8 + 25)
  })
})

describe('validation', () => {
  it('blocks out-of-bounds artwork and flags low DPI with an actionable message', () => {
    const d = baseDesign({ areas: { full_front: { json: {}, objects: [
      obj({ id: 'a', bbox: { x: -200, y: 10, w: 100, h: 100 } }),
      obj({ id: 'b', kind: 'image', bbox: { x: 100, y: 100, w: 400, h: 400 }, image: { naturalW: 944, naturalH: 944, displayW: 400, displayH: 400 } }),
    ] } } })
    const issues = validateDesign(catalog, d)
    expect(issues.find((i) => i.id === 'bounds-a')?.severity).toBe('error')
    const dpi = issues.find((i) => i.id === 'dpi-b')!
    expect(dpi.message).toMatch(/118 DPI at 8" wide/)
    expect(dpi.message).toMatch(/Reduce it to 6.3"/)
  })
  it('enforces method limits (embroidery palette, raster, min text) and material compatibility', () => {
    const d = baseDesign({ productId: 'polo', modelId: 'polo', materialId: 'pique', methodId: 'embroidery', areas: { left_chest: { json: {}, objects: [
      obj({ id: 't', colors: ['#123456'], textHeightIn: 0.1 }),
      obj({ id: 'p', kind: 'image', image: { naturalW: 4000, naturalH: 4000, displayW: 100, displayH: 100 } }),
    ] } } })
    const ids = validateDesign(catalog, d).map((i) => i.id)
    expect(ids).toEqual(expect.arrayContaining(['palette-t', 'text-t', 'raster-p']))
    const sub = validateDesign(catalog, baseDesign({ methodId: 'sublimation' })).map((i) => i.id)
    expect(sub).toEqual(expect.arrayContaining(['method-product', 'method-material']))
  })
  it('detects seam/placket exclusion overlap and conflicting areas', () => {
    const polo = catalog.products.find((p) => p.id === 'polo')!.models[0]
    const ff = polo.printAreas.find((a) => a.id === 'full_front')!
    expect(ff.exclusions.some((e) => e.kind === 'button')).toBe(true)
    const ex = ff.exclusions[0]
    const d = baseDesign({ productId: 'polo', modelId: 'polo', materialId: 'pique', methodId: 'dtf', areas: {
      full_front: { json: {}, objects: [obj({ id: 'x', bbox: { x: ex.xIn * DESIGN_PPI, y: ex.yIn * DESIGN_PPI, w: 20, h: 20 } })] },
      left_chest: { json: {}, objects: [obj({ id: 'y' })] },
    } })
    const ids = validateDesign(catalog, d).map((i) => i.id)
    expect(ids).toContain(`excl-x-${ex.id}`)
    expect(ids).toContain('conflict-full_front-left_chest')
  })
})

describe('serialisation', () => {
  it('round-trips deterministically', () => {
    const d = baseDesign({ areas: { full_front: { json: { objects: [{ left: 1 }] }, objects: [obj()] } } })
    const s = serializeDesign(d)
    expect(serializeDesign(deserializeDesign(s))).toBe(s)
    expect(serializeDesign({ ...d, quantity: 1 })).toBe(s)
  })
  it('migrates v1 documents', () => {
    const v1 = { schemaVersion: 1, productId: 'tshirt', modelId: 'basic-tee', sizeId: 'M', quantity: 2, materialId: 'cotton', color: 'navy', printMethod: 'dtf', areas: {} }
    const d = deserializeDesign(JSON.stringify(v1))
    expect(d.schemaVersion).toBe(2); expect(d.colors).toEqual({ body: 'navy' }); expect(d.methodId).toBe('dtf')
  })
  it('rejects corrupted and future documents', () => {
    expect(() => deserializeDesign('{oops')).toThrow(DesignLoadError)
    expect(() => deserializeDesign(JSON.stringify({ ...baseDesign(), schemaVersion: 99 }))).toThrow(/newer version/)
    expect(() => deserializeDesign(JSON.stringify({ ...baseDesign(), areas: { a: { objects: 3 } } }))).toThrow(DesignLoadError)
  })
})

describe('print areas & model switching', () => {
  it('every area fits its panel on every model', () => {
    for (const p of catalog.products) for (const m of p.models) for (const a of m.printAreas) {
      const panel = m.panels.find((x) => x.id === a.panel)!
      expect(panel, `${m.id}/${a.id}`).toBeTruthy()
      expect(a.rect.xIn).toBeGreaterThanOrEqual(0)
      expect(a.rect.yIn).toBeGreaterThanOrEqual(0)
      expect(a.rect.xIn + a.rect.wIn).toBeLessThanOrEqual(panel.widthIn + 1e-6)
      expect(a.rect.yIn + a.rect.hIn).toBeLessThanOrEqual(panel.heightIn + 1e-6)
      expect(a.rect.wIn).toBeGreaterThan(0)
    }
  })
  it('keeps artwork centred and shrinks it into a smaller area', () => {
    const over = catalog.products[0].models.find((m) => m.id === 'oversized-tee')!
    const kids = catalog.products.find((p) => p.id === 'kids-tee')!.models[0]
    const from = over.printAreas.find((a) => a.id === 'full_front')!, to = kids.printAreas.find((a) => a.id === 'full_front')!
    const W = from.rect.wIn * DESIGN_PPI, H = from.rect.hIn * DESIGN_PPI
    const out = remapAreas({ full_front: { json: { objects: [{ left: W / 2, top: H / 2, scaleX: 1, scaleY: 1 }] }, objects: [obj({ bbox: { x: 0, y: 0, w: W, h: H } })] } }, over.printAreas, kids.printAreas).full_front
    const o = (out.json!.objects as any[])[0]
    expect(o.left).toBeCloseTo((to.rect.wIn * DESIGN_PPI) / 2)
    expect(o.scaleX).toBeLessThan(1)
    const b = out.objects[0].bbox
    expect(b.x + b.w).toBeLessThanOrEqual(to.rect.wIn * DESIGN_PPI + 1e-6)
    expect(b.y + b.h).toBeLessThanOrEqual(to.rect.hIn * DESIGN_PPI + 1e-6)
  })
})

describe('upload sniffing', () => {
  const bytes = (...v: number[]) => new Uint8Array(v)
  it('identifies by signature, not extension', () => {
    expect(sniff(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe('image/png')
    expect(sniff(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg')
    expect(sniff(new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp')
    expect(sniff(new TextEncoder().encode('﻿<?xml version="1.0"?>\n<!-- x --><svg xmlns="http://www.w3.org/2000/svg">'))).toBe('image/svg+xml')
    expect(sniff(new TextEncoder().encode('<html><svg>'))).toBeNull()
    expect(sniff(bytes(0x4d, 0x5a, 0x90))).toBeNull()
  })
})

import { validateCatalog } from '../admin/validateCatalog'
describe('catalog validation', () => {
  it('accepts the seed catalog', () => expect(validateCatalog(catalog)).toEqual([]))
  it('catches broken references', () => {
    const c = structuredClone(catalog)
    c.products[0].defaultMethod = 'nope'
    c.products[0].models[0].printAreas[0].rect.wIn = 999
    c.pricing.tiers = [{ minQty: 10, pctOff: 5, label: '' }, { minQty: 5, pctOff: 1, label: '' }]
    const errs = validateCatalog(c).join('\n')
    expect(errs).toMatch(/default method/)
    expect(errs).toMatch(/extends beyond its panel/)
    expect(errs).toMatch(/ascending/)
  })
})
