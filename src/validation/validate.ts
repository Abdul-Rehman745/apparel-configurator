// Production validation. Pure: consumes the design document + catalog, returns actionable issues.
import { DESIGN_PPI, hasArtwork, orderUnits, totalQty, type BBox, type DesignState } from '../core/design'
import type { Catalog, RectIn, ValidationPolicy } from '../core/types'
import { imageDpi, maxPrintInches } from '../print-areas/dpi'
import { resolve, sizeScale } from '../products/lookup'

export type Severity = 'error' | 'warning' | 'approval'

export interface Issue {
  id: string
  severity: Severity
  message: string
  areaId?: string
  objectId?: string
}

const policySeverity = (p: ValidationPolicy): Severity => (p === 'block' ? 'error' : p === 'approval' ? 'approval' : 'warning')

const inch = (units: number) => units / DESIGN_PPI
const fmt = (n: number) => (Math.round(n * 10) / 10).toString()

function overlaps(b: BBox, r: RectIn): boolean {
  const x = r.xIn * DESIGN_PPI, y = r.yIn * DESIGN_PPI, w = r.wIn * DESIGN_PPI, h = r.hIn * DESIGN_PPI
  return b.x < x + w && b.x + b.w > x && b.y < y + h && b.y + b.h > y
}

/** Normalise hex colours so #FFF, #ffffff and rgb() strings compare equal. */
export function normColor(c: string): string {
  const s = c.trim().toLowerCase()
  const m3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(s)
  if (m3) return `#${m3[1]}${m3[1]}${m3[2]}${m3[2]}${m3[3]}${m3[3]}`
  const rgb = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(s)
  if (rgb) return '#' + rgb.slice(1, 4).map((v) => (+v).toString(16).padStart(2, '0')).join('')
  return s
}

export function validateDesign(catalog: Catalog, d: DesignState, opts: { missingAssets?: Set<string>; knownFonts?: Set<string> } = {}): Issue[] {
  const issues: Issue[] = []
  const { product, model, method, material } = resolve(catalog, d)
  const pol = catalog.validation
  const scale = sizeScale(product, d.sizeId)
  const add = (i: Issue) => issues.push(i)

  if (!product.printMethods.includes(method.id)) add({ id: 'method-product', severity: 'error', message: `${method.label} is not offered on the ${product.title}.` })
  if (method.materials && !method.materials.includes(material.id)) {
    add({ id: 'method-material', severity: 'error', message: `${method.label} can't be printed on ${material.label}. Choose ${method.materials.map((m) => catalog.materials.find((x) => x.id === m)?.label ?? m).join(' or ')}, or another print method.` })
  }

  const customized = model.printAreas.filter((a) => hasArtwork(d.areas[a.id]))
  if (!customized.length) add({ id: 'blank', severity: 'warning', message: 'No artwork added yet — this will be ordered as a blank garment.' })

  for (const area of customized) {
    const doc = d.areas[area.id]!
    const W = area.rect.wIn * DESIGN_PPI, H = area.rect.hIn * DESIGN_PPI
    const inset = area.safeInsetIn * DESIGN_PPI, bleed = area.bleedIn * DESIGN_PPI
    const label = area.label

    if (!area.methods.includes(method.id)) {
      add({ id: `area-method-${area.id}`, severity: policySeverity(pol.methodLimits), areaId: area.id, message: `${label} can't be decorated with ${method.label}. Move the artwork or pick one of: ${area.methods.map((m) => catalog.printMethods.find((x) => x.id === m)?.label ?? m).join(', ')}.` })
    }
    for (const other of area.conflictsWith ?? []) {
      if (hasArtwork(d.areas[other]) && area.id < other) {
        const o = model.printAreas.find((a) => a.id === other)
        add({ id: `conflict-${area.id}-${other}`, severity: 'error', areaId: area.id, message: `${label} and ${o?.label ?? other} overlap on the garment — use only one of them.` })
      }
    }

    const colors = new Set<string>()
    let hasRaster = false
    for (const o of doc.objects) {
      if (!o.visible) continue
      const name = `“${o.name}”`
      const b = o.bbox
      o.colors.forEach((c) => colors.add(normColor(c)))
      if (o.kind === 'image' || o.kind === 'pattern') hasRaster = true

      const outside = b.x < -bleed - 0.5 || b.y < -bleed - 0.5 || b.x + b.w > W + bleed + 0.5 || b.y + b.h > H + bleed + 0.5
      if (outside) {
        add({ id: `bounds-${o.id}`, severity: policySeverity(pol.outOfBounds), areaId: area.id, objectId: o.id, message: `${name} extends outside the ${label} print area and would be cut off. Move it inside or make it smaller.` })
      } else if (b.x < inset || b.y < inset || b.x + b.w > W - inset || b.y + b.h > H - inset) {
        add({ id: `safe-${o.id}`, severity: 'warning', areaId: area.id, objectId: o.id, message: `${name} is within ${fmt(area.safeInsetIn)}" of the ${label} edge — small shifts in production may trim it.` })
      }
      for (const ex of area.exclusions) {
        if (overlaps(b, ex)) add({ id: `excl-${o.id}-${ex.id}`, severity: policySeverity(pol.exclusion), areaId: area.id, objectId: o.id, message: `${name} overlaps the ${ex.label.toLowerCase()} on ${label}, which can't be printed. Move it off the red zone.` })
      }

      if (o.image) {
        const dpi = imageDpi(o.image, scale)
        const printedW = inch(o.image.displayW) * scale
        if (method.goodDpi && dpi < method.minDpi) {
          add({ id: `dpi-${o.id}`, severity: policySeverity(pol.lowDpi), areaId: area.id, objectId: o.id, message: `${name} is ${Math.round(dpi)} DPI at ${fmt(printedW)}" wide. Reduce it to ${fmt(maxPrintInches(o.image.naturalW, method.minDpi))}" or upload a higher-resolution image.` })
        } else if (method.goodDpi && dpi < method.goodDpi) {
          add({ id: `dpi-${o.id}`, severity: 'warning', areaId: area.id, objectId: o.id, message: `${name} is ${Math.round(dpi)} DPI — acceptable, but ${method.goodDpi} DPI (≤ ${fmt(maxPrintInches(o.image.naturalW, method.goodDpi))}" wide) prints sharper.` })
        }
      }
      if ((o.kind === 'image' || o.kind === 'pattern') && !method.artwork.includes('raster')) {
        add({ id: `raster-${o.id}`, severity: policySeverity(pol.methodLimits), areaId: area.id, objectId: o.id, message: `${method.label} can't reproduce photos or raster images like ${name}. Use text/vector artwork or switch to DTF.` })
      }
      if (o.kind === 'text' && method.minTextHeightIn && o.textHeightIn !== undefined && o.textHeightIn * scale < method.minTextHeightIn) {
        add({ id: `text-${o.id}`, severity: policySeverity(pol.methodLimits), areaId: area.id, objectId: o.id, message: `Text ${name} is ${fmt(o.textHeightIn * scale)}" tall; ${method.label} needs at least ${method.minTextHeightIn}". Increase the font size.` })
      }
      if (method.minLineIn && o.minStrokeIn !== undefined && o.minStrokeIn > 0 && o.minStrokeIn * scale < method.minLineIn) {
        add({ id: `line-${o.id}`, severity: 'warning', areaId: area.id, objectId: o.id, message: `Outline on ${name} is thinner than ${method.minLineIn}" and may not reproduce with ${method.label}.` })
      }
      if (o.hasShadow && !method.allowsShadow) add({ id: `shadow-${o.id}`, severity: policySeverity(pol.methodLimits), areaId: area.id, objectId: o.id, message: `${method.label} can't print the shadow on ${name}. Remove the shadow.` })
      if (o.hasGradient && !method.allowsGradient) add({ id: `grad-${o.id}`, severity: policySeverity(pol.methodLimits), areaId: area.id, objectId: o.id, message: `${method.label} can't print gradients (${name}). Use a solid colour.` })
      if (method.maxAreaIn && (inch(b.w) * scale > method.maxAreaIn.w || inch(b.h) * scale > method.maxAreaIn.h)) {
        add({ id: `maxarea-${o.id}`, severity: policySeverity(pol.methodLimits), areaId: area.id, objectId: o.id, message: `${name} is ${fmt(inch(b.w))}×${fmt(inch(b.h))}"; ${method.label} is limited to ${method.maxAreaIn.w}×${method.maxAreaIn.h}".` })
      }
      if (area.maxArtworkIn && (inch(b.w) > area.maxArtworkIn.w || inch(b.h) > area.maxArtworkIn.h)) {
        add({ id: `areamax-${o.id}`, severity: 'error', areaId: area.id, objectId: o.id, message: `${name} exceeds the ${area.maxArtworkIn.w}×${area.maxArtworkIn.h}" maximum for ${label}.` })
      }
      if (method.palette) {
        const pal = new Set(method.palette.map(normColor))
        const off = o.colors.map(normColor).filter((c) => !pal.has(c))
        if (off.length) add({ id: `palette-${o.id}`, severity: policySeverity(pol.methodLimits), areaId: area.id, objectId: o.id, message: `${name} uses ${off.join(', ')}, which isn't an available thread colour. Pick a colour from the thread palette.` })
      }
      if (o.required && (o.kind === 'text' ? !o.text?.trim() : false)) add({ id: `req-${o.id}`, severity: 'error', areaId: area.id, objectId: o.id, message: `${name} is required — please fill it in.` })
      if (o.assetId && opts.missingAssets?.has(o.assetId)) add({ id: `asset-${o.id}`, severity: 'error', areaId: area.id, objectId: o.id, message: `The image for ${name} is missing. Re-upload it.` })
      if (o.fontFamily && opts.knownFonts && !opts.knownFonts.has(o.fontFamily)) add({ id: `font-${o.id}`, severity: 'error', areaId: area.id, objectId: o.id, message: `Font “${o.fontFamily}” used by ${name} isn't available. Choose another font.` })
    }

    if (method.maxColors) {
      if (hasRaster && method.id === 'screen') {
        add({ id: `sep-${area.id}`, severity: 'approval', areaId: area.id, message: `Screen printing a photo on ${label} needs manual colour separation; our team will review before production.` })
      } else if (colors.size > method.maxColors) {
        add({ id: `colors-${area.id}`, severity: policySeverity(pol.methodLimits), areaId: area.id, message: `${label} uses ${colors.size} colours; ${method.label} allows ${method.maxColors}. Reduce colours or choose DTF/DTG.` })
      }
    }
  }

  // Required template layers must exist even if the customer deleted them.
  for (const [areaId, doc] of Object.entries(d.areas)) {
    if (!model.printAreas.some((a) => a.id === areaId) && doc.objects.length) {
      add({ id: `orphan-${areaId}`, severity: 'warning', message: `Artwork on “${areaId}” isn't available on the ${model.label} and won't be printed.` })
    }
  }

  const qty = totalQty(d)
  if (qty < (product.minQty ?? 1)) add({ id: 'qty-min', severity: 'error', message: `Minimum order is ${product.minQty ?? 1}.` })
  if (product.maxQty && qty > product.maxQty) add({ id: 'qty-max', severity: 'error', message: `Maximum order is ${product.maxQty}; contact us for larger runs.` })
  for (const u of orderUnits(d)) {
    const s = product.sizes.find((x) => x.id === u.sizeId)
    if (!s) add({ id: `size-${u.sizeId}`, severity: 'error', message: `Please choose a size${u.row ? ` for ${u.row.name || 'each row'}` : ''}.` })
    else if (s.inStock === false) add({ id: `stock-${s.id}`, severity: 'error', message: `Size ${s.label} is out of stock.` })
  }
  if (d.bulk.enabled) {
    const fields = new Set(Object.values(d.areas).flatMap((a) => a.objects.map((o) => o.bulkField).filter(Boolean)))
    d.bulk.rows.forEach((r, i) => {
      if (fields.has('name') && !r.name.trim()) add({ id: `bulk-name-${r.id}`, severity: 'error', message: `Row ${i + 1}: enter a name.` })
      if (fields.has('number') && !r.number.trim()) add({ id: `bulk-num-${r.id}`, severity: 'error', message: `Row ${i + 1}: enter a number.` })
      if (r.qty < 1) add({ id: `bulk-qty-${r.id}`, severity: 'error', message: `Row ${i + 1}: quantity must be at least 1.` })
    })
    if (!fields.size) add({ id: 'bulk-nofields', severity: 'warning', message: 'Bulk rows are set, but no text layer is linked to Name or Number — every shirt will be identical.' })
  }
  return issues
}

export const blocking = (issues: Issue[]) => issues.filter((i) => i.severity === 'error')
export const needsApproval = (issues: Issue[]) => issues.some((i) => i.severity === 'approval')
