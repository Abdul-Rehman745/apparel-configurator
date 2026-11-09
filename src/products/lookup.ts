import type { Catalog, GarmentModel, PrintArea, Product } from '../core/types'
import type { DesignState } from '../core/design'

export function resolve(catalog: Catalog, d: Pick<DesignState, 'productId' | 'modelId' | 'methodId' | 'materialId' | 'sizeId'>) {
  const product = catalog.products.find((p) => p.id === d.productId) ?? catalog.products[0]
  const model = product.models.find((m) => m.id === d.modelId) ?? product.models[0]
  const method = catalog.printMethods.find((m) => m.id === d.methodId) ?? catalog.printMethods.find((m) => m.id === product.defaultMethod)!
  const material = catalog.materials.find((m) => m.id === d.materialId) ?? catalog.materials.find((m) => m.id === product.materials[0])!
  const size = product.sizes.find((s) => s.id === d.sizeId) ?? product.sizes.find((s) => s.id === product.referenceSize) ?? product.sizes[0]
  return { product, model, method, material, size }
}

export const areaById = (model: GarmentModel, id: string): PrintArea | undefined => model.printAreas.find((a) => a.id === id)

/** Print size multiplier for the chosen garment size (1 unless product scales print with size). */
export function sizeScale(product: Product, sizeId: string): number {
  if (product.printSizing !== 'scale') return 1
  return product.sizes.find((s) => s.id === sizeId)?.scale ?? 1
}
