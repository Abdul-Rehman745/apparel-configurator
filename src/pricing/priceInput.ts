import { hasArtwork, orderUnits, type DesignState } from '../core/design'
import type { Catalog } from '../core/types'
import { resolve } from '../products/lookup'
import { normColor } from '../validation/validate'
import type { PriceInput } from './pricing'

/** Derives the pricing engine's input from the design document (the only place that knows both). */
export function priceInput(catalog: Catalog, d: DesignState): PriceInput {
  const { product, model, method, material } = resolve(catalog, d)
  const areas = model.printAreas.filter((a) => hasArtwork(d.areas[a.id])).map((a) => {
    const colors = new Set(d.areas[a.id]!.objects.filter((o) => o.visible).flatMap((o) => o.colors.map(normColor)))
    return { id: a.id, group: a.group, colorCount: Math.max(1, colors.size) }
  })
  const premiumAssets = new Set(Object.values(d.areas).flatMap((a) => a.objects.filter((o) => o.premium && o.visible).map((o) => o.name))).size
  const personalized = Object.values(d.areas).some((a) => a.objects.some((o) => o.bulkField && o.visible))
  return {
    productId: product.id, modelId: model.id, materialId: material.id, methodId: method.id,
    units: orderUnits(d).map((u) => ({ sizeId: u.sizeId, qty: u.qty, personalized: u.personalized && personalized })),
    areas, premiumAssets,
  }
}
