// Domain schema. Everything the configurator knows about a garment comes from data
// shaped like this — no product, area, price or brand is hard-coded in UI/3D code.

export type Id = string

export interface LicenseInfo {
  source: 'internal' | 'commissioned' | 'sketchfab' | 'blenderkit' | 'marketplace' | 'cc0' | 'customer'
  author: string
  url?: string
  license: string
  downloadedAt?: string
  attributionRequired: boolean
  attribution?: string
  redistribution: 'allowed' | 'embedded-only' | 'forbidden'
  modifications?: string
}

/** Rectangle in inches, origin top-left of its parent (panel or print area). */
export interface RectIn { xIn: number; yIn: number; wIn: number; hIn: number }

export type ExclusionKind = 'seam' | 'collar' | 'zipper' | 'button' | 'pocket' | 'armpit' | 'stitching' | 'other'
export interface Exclusion extends RectIn { id: string; label: string; kind: ExclusionKind }

/** A UV-mapped surface of a garment model. UV 0..1 spans widthIn × heightIn physically. */
export interface Panel {
  id: Id
  label: string
  widthIn: number
  heightIn: number
  colorZone: Id
  /** GLB models: mesh name(s) carrying this panel's UVs. Procedural models ignore it. */
  mesh?: string
}

export type AreaGroup = 'large' | 'small' | 'sleeve' | 'label' | 'allover'

export interface PrintArea {
  id: Id
  label: string
  panel: Id
  /** Placement on the panel (inches from panel top-left). */
  rect: RectIn
  safeInsetIn: number
  bleedIn: number
  exclusions: Exclusion[]
  methods: Id[]
  camera: Id
  group: AreaGroup
  /** Mutually exclusive areas cannot both carry artwork (e.g. full_front vs left_chest overlap). */
  conflictsWith?: Id[]
  maxArtworkIn?: { w: number; h: number }
}

export interface ProceduralGarment {
  kind: 'tee' | 'polo' | 'hoodie' | 'tank' | 'longsleeve' | 'dress'
  chestIn: number
  lengthIn: number
  sleeveLengthIn: number
  collar: 'crew' | 'v' | 'polo' | 'hood' | 'dress'
  placket?: boolean
  pocket?: boolean
  cuffs?: boolean
  drop?: number // shoulder drop / oversize factor
}

export type ModelSource =
  | { type: 'procedural'; garment: ProceduralGarment }
  /** unit: the GLB's length unit ('m' → scaled to inches); omitted = fit by tallest panel. garment: the spec it was sewn from. */
  | { type: 'glb'; url: string; unit?: 'm' | 'in'; garment?: ProceduralGarment }

export interface GarmentModel {
  id: Id
  label: string
  source: ModelSource
  panels: Panel[]
  colorZones: { id: Id; label: string }[]
  printAreas: PrintArea[]
  license: LicenseInfo
}

export interface SizeSpec {
  id: Id
  label: string
  chestIn: number
  lengthIn: number
  sleeveIn: number
  shoulderIn?: number
  waistIn?: number
  sku: string
  /** Relative to the product's reference size; used when print size scales with garment. */
  scale?: number
  inStock?: boolean
}

export interface ColorOption { id: Id; name: string; hex: string; mfrId?: string }

export interface FabricMaterial {
  id: Id
  label: string
  description: string
  weave: 'jersey' | 'pique' | 'mesh' | 'fleece' | 'poplin' | 'twill'
  roughness: number
  sheen: number
  normalScale: number
}

export type ArtworkKind = 'text' | 'raster' | 'vector'
export type Finish = 'matte' | 'soft' | 'glossy' | 'embroidery' | 'dye'

export interface PrintMethod {
  id: Id
  label: string
  description: string
  finish: Finish
  artwork: ArtworkKind[]
  minDpi: number
  goodDpi: number
  /** Distinct fill colours allowed (screen print screens, embroidery threads). */
  maxColors?: number
  palette?: string[]
  minTextHeightIn?: number
  minLineIn?: number
  maxAreaIn?: { w: number; h: number }
  allOver?: boolean
  /** Restrict to fabrics (e.g. sublimation needs polyester). */
  materials?: Id[]
  allowsShadow: boolean
  allowsGradient: boolean
}

/** Angles in radians; distance is a multiple of garment height; focus frames a panel instead of the whole garment. */
export interface CameraPreset { id: Id; label: string; azimuth: number; polar: number; distance: number; focus?: Id }

export interface TemplateElement {
  kind: 'text' | 'clipart'
  name: string
  text?: string
  clipartId?: string
  fontFamily?: string
  fontSize?: number
  fill: string
  /** Normalised 0..1 position within the area. */
  x: number
  y: number
  widthFrac?: number
  lock: 'editable' | 'locked' | 'hidden'
  required?: boolean
  bulkField?: 'name' | 'number'
}

export interface Template {
  id: Id
  title: string
  description: string
  productId: Id
  modelId?: Id
  colors?: Record<string, Id>
  methodId?: Id
  areas: Record<Id, TemplateElement[]>
  restrictFonts?: string[]
  restrictColors?: string[]
}

export interface Product {
  id: Id
  slug: string
  title: string
  category: string
  description: string
  published: boolean
  models: GarmentModel[]
  sizes: SizeSpec[]
  referenceSize: Id
  colors: ColorOption[]
  /** Separate colours per zone (body/sleeves/collar…) when the model has several zones. */
  multiZoneColors: boolean
  materials: Id[]
  printMethods: Id[]
  defaultMethod: Id
  /** When size changes: keep physical print size, or scale with garment. */
  printSizing: 'constant' | 'scale'
  minQty?: number
  maxQty?: number
}

export type ValidationPolicy = 'warn' | 'block' | 'approval'

export interface PricingRule {
  id: Id
  label: string
  amount: number
  per: 'unit' | 'area' | 'order' | 'color' | 'personalizedUnit' | 'premiumAsset'
  when?: {
    productIds?: Id[]
    modelIds?: Id[]
    sizeIds?: Id[]
    materialIds?: Id[]
    methodIds?: Id[]
    areaGroups?: AreaGroup[]
  }
}

export interface PricingConfig {
  currency: string
  rules: PricingRule[]
  /** Ascending minQty; the highest tier reached applies. */
  tiers: { minQty: number; pctOff: number; label: string }[]
}

export interface Catalog {
  schemaVersion: number
  products: Product[]
  materials: FabricMaterial[]
  printMethods: PrintMethod[]
  cameras: CameraPreset[]
  pricing: PricingConfig
  templates: Template[]
  validation: { outOfBounds: ValidationPolicy; lowDpi: ValidationPolicy; exclusion: ValidationPolicy; methodLimits: ValidationPolicy }
  fonts: FontDef[]
  /** Tenant-uploaded clipart (built-in library lives in assets/clipart.ts). */
  customClipart?: { id: string; name: string; category: string; tags: string[]; svg: string; premium?: boolean; license: LicenseInfo }[]
}

export interface FontDef {
  family: string
  category: 'Sans Serif' | 'Serif' | 'Display' | 'Script' | 'Sports' | 'College' | 'Vintage' | 'Handwritten' | 'Monospace'
  license: string
  source: 'google' | 'upload'
  url?: string
  weights?: number[]
}

export type FeatureFlag =
  | 'viewer3d' | 'editor2d' | 'uploads' | 'text' | 'clipart' | 'shapes' | 'patterns' | 'embroidery'
  | 'sharing' | 'bulk' | 'templates' | 'premiumAssets' | 'downloadPreview' | 'export'

export interface Tenant {
  id: Id
  companyName: string
  logoSvg: string
  primary: string
  primaryText: string
  accent: string
  font: string
  radius: number
  currency: string
  locale: string
  features: Record<FeatureFlag, boolean>
  commerce: { adapter: 'local' | 'supabase' | 'rest' | 'shopify' | 'woocommerce' | 'graphql' | 'postMessage'; endpoint?: string }
}
