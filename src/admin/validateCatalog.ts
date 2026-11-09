// Structural validation for admin-edited catalogs — catches broken references before publishing.
import type { Catalog } from '../core/types'

export function validateCatalog(c: Catalog): string[] {
  const errs: string[] = []
  const dup = (ids: string[], what: string) => {
    const seen = new Set<string>()
    for (const id of ids) { if (seen.has(id)) errs.push(`Duplicate ${what} id “${id}”.`); seen.add(id) }
  }
  if (!Array.isArray(c.products) || !c.products.length) return ['Catalog has no products.']
  dup(c.products.map((p) => p.id), 'product')
  dup(c.materials.map((m) => m.id), 'material')
  dup(c.printMethods.map((m) => m.id), 'print method')
  const methods = new Set(c.printMethods.map((m) => m.id)), mats = new Set(c.materials.map((m) => m.id)), cams = new Set(c.cameras.map((x) => x.id))
  for (const p of c.products) {
    const P = `Product “${p.title || p.id}”`
    if (!p.models?.length) errs.push(`${P} has no 3D model.`)
    if (!p.sizes?.length) errs.push(`${P} has no sizes.`)
    if (!p.colors?.length) errs.push(`${P} has no colours.`)
    if (p.sizes && !p.sizes.some((s) => s.id === p.referenceSize)) errs.push(`${P}: reference size “${p.referenceSize}” isn’t one of its sizes.`)
    if (!p.printMethods.includes(p.defaultMethod)) errs.push(`${P}: default method isn’t in its method list.`)
    p.printMethods.filter((m) => !methods.has(m)).forEach((m) => errs.push(`${P}: unknown print method “${m}”.`))
    p.materials.filter((m) => !mats.has(m)).forEach((m) => errs.push(`${P}: unknown material “${m}”.`))
    p.colors.filter((x) => !/^#[0-9a-f]{6}$/i.test(x.hex)).forEach((x) => errs.push(`${P}: colour “${x.name}” has invalid hex ${x.hex}.`))
    dup(p.sizes.map((s) => s.id), `${P} size`)
    for (const m of p.models ?? []) {
      const M = `${P} / model “${m.label}”`
      if (!m.license?.license) errs.push(`${M} has no licence recorded.`)
      if (m.source.type === 'glb') m.panels.filter((x) => !x.mesh).forEach((x) => errs.push(`${M}: panel “${x.id}” isn’t mapped to a mesh.`))
      dup(m.printAreas.map((a) => a.id), `${M} print area`)
      for (const a of m.printAreas) {
        const panel = m.panels.find((x) => x.id === a.panel)
        const A = `${M} / area “${a.label}”`
        if (!panel) { errs.push(`${A}: unknown panel “${a.panel}”.`); continue }
        const r = a.rect
        if (!(r.wIn > 0 && r.hIn > 0)) errs.push(`${A}: width and height must be positive.`)
        if (r.xIn < -1e-6 || r.yIn < -1e-6 || r.xIn + r.wIn > panel.widthIn + 1e-6 || r.yIn + r.hIn > panel.heightIn + 1e-6) errs.push(`${A} extends beyond its panel (${panel.widthIn.toFixed(1)}×${panel.heightIn.toFixed(1)}").`)
        if (a.safeInsetIn * 2 >= Math.min(r.wIn, r.hIn)) errs.push(`${A}: safe margin leaves no printable space.`)
        a.methods.filter((x) => !methods.has(x)).forEach((x) => errs.push(`${A}: unknown method “${x}”.`))
        if (!cams.has(a.camera)) errs.push(`${A}: unknown camera preset “${a.camera}”.`)
      }
    }
  }
  const tiers = c.pricing.tiers.map((t) => t.minQty)
  if (tiers.some((q, i) => i > 0 && q <= tiers[i - 1])) errs.push('Quantity tiers must be in ascending order.')
  if (c.pricing.tiers.some((t) => t.pctOff < 0 || t.pctOff > 90)) errs.push('Tier discounts must be between 0 and 90%.')
  for (const f of c.fonts) if (!f.license) errs.push(`Font “${f.family}” has no licence recorded.`)
  for (const t of c.templates) if (!c.products.some((p) => p.id === t.productId)) errs.push(`Template “${t.title}” references a missing product.`)
  return errs
}
