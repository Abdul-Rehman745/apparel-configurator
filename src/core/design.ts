// Customer design document — the serialisable, camera-independent source of truth.
// Fabric JSON per area is authoritative for artwork; ObjectSummary is derived metadata
// (bounds in physical units, colours, DPI inputs) so validation/pricing never need a canvas.
import type { Id } from './types'

/** Design units per physical inch inside every print-area document. */
export const DESIGN_PPI = 50
export const SCHEMA_VERSION = 2

export type ObjectKind = 'text' | 'image' | 'svg' | 'clipart' | 'shape' | 'pattern' | 'qr' | 'group'
export type LockLevel = 'editable' | 'locked' | 'hidden'

export interface BBox { x: number; y: number; w: number; h: number }

export interface ObjectSummary {
  id: string
  name: string
  kind: ObjectKind
  visible: boolean
  locked: boolean
  lockLevel: LockLevel
  required?: boolean
  bulkField?: 'name' | 'number'
  /** Axis-aligned bounds in design units, area-local. */
  bbox: BBox
  /** Raster sources: pixel dimensions actually available vs. displayed size. */
  image?: { naturalW: number; naturalH: number; displayW: number; displayH: number }
  assetId?: string
  colors: string[]
  fontFamily?: string
  textHeightIn?: number
  minStrokeIn?: number
  hasShadow?: boolean
  hasGradient?: boolean
  text?: string
  premium?: boolean
}

export interface AreaDesign {
  /** Fabric canvas JSON (asset sources replaced by asset references). null = untouched. */
  json: Record<string, unknown> | null
  objects: ObjectSummary[]
}

export interface BulkRow { id: string; name: string; number: string; sizeId: Id; qty: number }

export interface DesignState {
  schemaVersion: number
  productId: Id
  modelId: Id
  sizeId: Id
  quantity: number
  materialId: Id
  colors: Record<Id, Id>
  methodId: Id
  areas: Record<Id, AreaDesign>
  bulk: { enabled: boolean; rows: BulkRow[] }
  templateId?: Id
  restrictFonts?: string[]
  restrictColors?: string[]
}

export const hasArtwork = (a: AreaDesign | undefined) => !!a && a.objects.some((o) => o.visible)

/** Units ordered: bulk rows when enabled, otherwise the single size × quantity. */
export function orderUnits(d: DesignState): { sizeId: Id; qty: number; personalized: boolean; row?: BulkRow }[] {
  if (d.bulk.enabled && d.bulk.rows.length) {
    return d.bulk.rows.map((r) => ({ sizeId: r.sizeId, qty: r.qty, personalized: !!(r.name || r.number), row: r }))
  }
  return [{ sizeId: d.sizeId, qty: d.quantity, personalized: false }]
}

export const totalQty = (d: DesignState) => orderUnits(d).reduce((s, u) => s + u.qty, 0)
