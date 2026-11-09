// Seed catalog. Admin edits are stored as a full catalog override (see api/catalogApi.ts);
// this file is only the out-of-the-box starting point, not a place UI code reads constants from.
import type { Catalog, ColorOption, FontDef, GarmentModel, Product, SizeSpec } from '../core/types'
import { proceduralModel, type ModelOptions } from './modelFactory'

/** Garment sewn from its pattern with cloth simulation (models/sew_garment.py); same panels and print areas. */
const sewn = (o: ModelOptions) => proceduralModel({ ...o, glb: `/models/sewn/${o.id}.glb` })

const ADULT_SIZES: SizeSpec[] = [
  { id: 'XS', label: 'XS', chestIn: 17, lengthIn: 27, sleeveIn: 7.5, shoulderIn: 16, sku: 'XS', scale: 0.88 },
  { id: 'S', label: 'S', chestIn: 18.5, lengthIn: 28, sleeveIn: 8, shoulderIn: 17, sku: 'S', scale: 0.94 },
  { id: 'M', label: 'M', chestIn: 20, lengthIn: 29, sleeveIn: 8.25, shoulderIn: 18, sku: 'M', scale: 1 },
  { id: 'L', label: 'L', chestIn: 22, lengthIn: 30, sleeveIn: 8.5, shoulderIn: 19.5, sku: 'L', scale: 1.06 },
  { id: 'XL', label: 'XL', chestIn: 24, lengthIn: 31, sleeveIn: 8.75, shoulderIn: 21, sku: 'XL', scale: 1.12 },
  { id: '2XL', label: '2XL', chestIn: 26, lengthIn: 32, sleeveIn: 9, shoulderIn: 22.5, sku: '2XL', scale: 1.18 },
  { id: '3XL', label: '3XL', chestIn: 28, lengthIn: 33, sleeveIn: 9.25, shoulderIn: 24, sku: '3XL', scale: 1.24 },
]
const longSleeve = (sizes: SizeSpec[]) => sizes.map((s) => ({ ...s, sleeveIn: s.sleeveIn + 16.5 }))
const withSku = (prefix: string, sizes: SizeSpec[]) => sizes.map((s) => ({ ...s, sku: `${prefix}-${s.id}` }))

const KIDS_SIZES: SizeSpec[] = [
  { id: '3-4Y', label: '3–4 yrs', chestIn: 13, lengthIn: 17, sleeveIn: 4.5, sku: 'K-34', scale: 0.8 },
  { id: '5-6Y', label: '5–6 yrs', chestIn: 14, lengthIn: 19, sleeveIn: 5, sku: 'K-56', scale: 0.9 },
  { id: '7-8Y', label: '7–8 yrs', chestIn: 15, lengthIn: 20.5, sleeveIn: 5.5, sku: 'K-78', scale: 1 },
  { id: '9-11Y', label: '9–11 yrs', chestIn: 16.5, lengthIn: 22.5, sleeveIn: 6, sku: 'K-911', scale: 1.08 },
  { id: '12-13Y', label: '12–13 yrs', chestIn: 17.5, lengthIn: 24, sleeveIn: 6.5, sku: 'K-1213', scale: 1.16 },
]

const CORE_COLORS: ColorOption[] = [
  { id: 'white', name: 'White', hex: '#f4f4f1', mfrId: '00' },
  { id: 'black', name: 'Black', hex: '#1c1c1e', mfrId: '36' },
  { id: 'navy', name: 'Navy', hex: '#1f2a44', mfrId: '32' },
  { id: 'royal', name: 'Royal Blue', hex: '#2250a8', mfrId: '51' },
  { id: 'red', name: 'Red', hex: '#b3202c', mfrId: '40' },
  { id: 'forest', name: 'Forest Green', hex: '#26452f', mfrId: '33' },
  { id: 'heather', name: 'Heather Grey', hex: '#a7a8aa', mfrId: 'RS' },
  { id: 'sand', name: 'Sand', hex: '#d8c7a6', mfrId: '6E' },
  { id: 'maroon', name: 'Maroon', hex: '#5a1f2b', mfrId: '38' },
  { id: 'gold', name: 'Gold', hex: '#e2a927', mfrId: '24' },
]

const tee = { kind: 'tee', chestIn: 20, lengthIn: 28, sleeveLengthIn: 8, collar: 'crew' } as const

// Real (non-procedural) garment: CC0 "T shirt on a hanger" by 3D Assets, hanger removed and split into
// print panels with models/prepare_tshirt.py (see models/hanging-prepared/panel_measurements.json).
// Panel sizes are the measured inches of each UV square; print areas are placed from the panel's top-left.
const box = (cx: number, top: number, w: number, h: number) => ({ xIn: cx - w / 2, yIn: top, wIn: w, hIn: h })
const REAL_TEE: GarmentModel = {
  id: 'real-tee', label: 'Scanned Tee (CC0)',
  source: { type: 'glb', url: '/models/tshirt-cc0-hanging.glb' },
  panels: [
    { id: 'front', label: 'Front', mesh: 'shirt_front', widthIn: 19.32, heightIn: 25.35, colorZone: 'body' },
    { id: 'back', label: 'Back', mesh: 'shirt_back', widthIn: 19.08, heightIn: 25.35, colorZone: 'body' },
    { id: 'left_sleeve', label: 'Left sleeve', mesh: 'shirt_left_sleeve', widthIn: 8.62, heightIn: 7.1, colorZone: 'body' },
    { id: 'right_sleeve', label: 'Right sleeve', mesh: 'shirt_right_sleeve', widthIn: 8.7, heightIn: 7.05, colorZone: 'body' },
  ],
  colorZones: [{ id: 'body', label: 'Body' }],
  printAreas: [
    { id: 'full_front', label: 'Full front', panel: 'front', rect: box(9.66, 4.5, 12, 14), safeInsetIn: 0.25, bleedIn: 0, exclusions: [], methods: ['dtg', 'dtf', 'screen', 'vinyl'], camera: 'front', group: 'large', conflictsWith: ['left_chest', 'right_chest'] },
    { id: 'left_chest', label: 'Left chest', panel: 'front', rect: box(14.16, 5, 4, 4), safeInsetIn: 0.25, bleedIn: 0, exclusions: [], methods: ['dtg', 'dtf', 'screen', 'vinyl', 'embroidery'], camera: 'front', group: 'small', conflictsWith: ['full_front'] },
    { id: 'right_chest', label: 'Right chest', panel: 'front', rect: box(5.16, 5, 4, 4), safeInsetIn: 0.25, bleedIn: 0, exclusions: [], methods: ['dtg', 'dtf', 'screen', 'vinyl', 'embroidery'], camera: 'front', group: 'small', conflictsWith: ['full_front'] },
    { id: 'full_back', label: 'Full back', panel: 'back', rect: box(9.54, 5, 12, 14), safeInsetIn: 0.25, bleedIn: 0, exclusions: [], methods: ['dtg', 'dtf', 'screen', 'vinyl'], camera: 'back', group: 'large', conflictsWith: ['upper_back'] },
    { id: 'upper_back', label: 'Upper back', panel: 'back', rect: box(9.54, 3.5, 11, 3), safeInsetIn: 0.25, bleedIn: 0, exclusions: [], methods: ['dtg', 'dtf', 'screen', 'vinyl', 'embroidery'], camera: 'back', group: 'small', conflictsWith: ['full_back'] },
    // The upper sleeve has discontinuous shoulder faces; only the continuous lower patch is printable.
    { id: 'left_sleeve', label: 'Left sleeve', panel: 'left_sleeve', rect: box(4.31, 3, 3, 2), safeInsetIn: 0.25, bleedIn: 0, exclusions: [], methods: ['dtg', 'dtf', 'screen', 'vinyl', 'embroidery'], camera: 'left_sleeve', group: 'sleeve' },
    { id: 'right_sleeve', label: 'Right sleeve', panel: 'right_sleeve', rect: box(4.35, 3, 3, 2), safeInsetIn: 0.25, bleedIn: 0, exclusions: [], methods: ['dtg', 'dtf', 'screen', 'vinyl', 'embroidery'], camera: 'right_sleeve', group: 'sleeve' },
  ],
  license: {
    source: 'cc0', author: '3D Assets (3dassets.dev)', license: 'CC0-1.0',
    url: 'https://3dassets.dev/assets/clothing-rail-and-wardrobe-tshirt-on-hanger-c0e0e17d', downloadedAt: '2026-09-24',
    attributionRequired: false, redistribution: 'allowed',
    modifications: 'Hanger meshes removed; split into front/back/sleeve panels; print UVs generated (models/prepare_tshirt.py). SHA256 of original: A2FA84A62DC7A856835DA14741F94A148DB3AA1E1C76B99A57000F1A9436B4A8.',
  },
}

const products: Product[] = [
  {
    id: 'tshirt', slug: 't-shirt', title: 'Classic T-Shirt', category: 'T-Shirts', published: true,
    description: 'Everyday crew-neck tee in three fits, sewn from real patterns.',
    models: [
      sewn({ id: 'basic-tee', label: 'Basic Tee', garment: { ...tee } }),
      sewn({ id: 'premium-tee', label: 'Premium Tee', garment: { ...tee, lengthIn: 29, chestIn: 20.5 } }),
      sewn({ id: 'oversized-tee', label: 'Oversized Tee', garment: { ...tee, lengthIn: 30, sleeveLengthIn: 10, drop: 1.14 } }),
      REAL_TEE,
    ],
    sizes: withSku('TEE', ADULT_SIZES), referenceSize: 'M', colors: CORE_COLORS, multiZoneColors: false,
    materials: ['cotton', 'blend', 'polyester'], printMethods: ['dtg', 'dtf', 'screen', 'vinyl', 'embroidery'], defaultMethod: 'dtg', printSizing: 'constant',
  },
  {
    id: 'longsleeve', slug: 'long-sleeve', title: 'Long Sleeve Tee', category: 'T-Shirts', published: true,
    description: 'Crew neck with rib cuffs; sleeve and cuff print zones.',
    models: [sewn({ id: 'longsleeve', label: 'Long Sleeve', garment: { kind: 'longsleeve', chestIn: 20, lengthIn: 28.5, sleeveLengthIn: 23, collar: 'crew', cuffs: true }, multiZone: true })],
    sizes: withSku('LS', longSleeve(ADULT_SIZES)), referenceSize: 'M', colors: CORE_COLORS, multiZoneColors: true,
    materials: ['cotton', 'blend'], printMethods: ['dtg', 'dtf', 'screen', 'vinyl', 'embroidery'], defaultMethod: 'dtg', printSizing: 'constant',
  },
  {
    id: 'polo', slug: 'polo', title: 'Piqué Polo', category: 'Polos', published: true,
    description: 'Three-button placket polo, ideal for embroidered logos.',
    models: [sewn({ id: 'polo', label: 'Polo', garment: { kind: 'polo', chestIn: 20.5, lengthIn: 28.5, sleeveLengthIn: 8.5, collar: 'polo', placket: true }, multiZone: true })],
    sizes: withSku('POLO', ADULT_SIZES), referenceSize: 'M', colors: CORE_COLORS, multiZoneColors: true,
    materials: ['pique', 'performance'], printMethods: ['embroidery', 'dtf', 'vinyl', 'screen'], defaultMethod: 'embroidery', printSizing: 'constant',
  },
  {
    id: 'hoodie', slug: 'hoodie', title: 'Pullover Hoodie', category: 'Sweats', published: true,
    description: 'Heavyweight fleece hoodie with kangaroo pocket.',
    models: [sewn({ id: 'hoodie', label: 'Hoodie', garment: { kind: 'hoodie', chestIn: 22, lengthIn: 27.5, sleeveLengthIn: 24, collar: 'hood', pocket: true, cuffs: true }, multiZone: true })],
    sizes: withSku('HD', longSleeve(ADULT_SIZES)), referenceSize: 'M', colors: CORE_COLORS, multiZoneColors: true,
    materials: ['fleece'], printMethods: ['dtg', 'dtf', 'screen', 'embroidery', 'vinyl'], defaultMethod: 'dtf', printSizing: 'constant',
  },
  {
    id: 'sweatshirt', slug: 'sweatshirt', title: 'Crew Sweatshirt', category: 'Sweats', published: true,
    description: 'Classic crew sweatshirt with rib cuffs.',
    models: [sewn({ id: 'sweatshirt', label: 'Sweatshirt', garment: { kind: 'longsleeve', chestIn: 22, lengthIn: 27, sleeveLengthIn: 24, collar: 'crew', cuffs: true }, multiZone: true })],
    sizes: withSku('SW', longSleeve(ADULT_SIZES)), referenceSize: 'M', colors: CORE_COLORS, multiZoneColors: true,
    materials: ['fleece'], printMethods: ['dtg', 'dtf', 'screen', 'embroidery'], defaultMethod: 'dtf', printSizing: 'constant',
  },
  {
    id: 'tank', slug: 'tank-top', title: 'Tank Top', category: 'T-Shirts', published: true,
    description: 'Sleeveless training tank.',
    models: [sewn({ id: 'tank', label: 'Tank', garment: { kind: 'tank', chestIn: 19.5, lengthIn: 28.5, sleeveLengthIn: 0, collar: 'crew' } })],
    sizes: withSku('TK', ADULT_SIZES), referenceSize: 'M', colors: CORE_COLORS, multiZoneColors: false,
    materials: ['cotton', 'performance'], printMethods: ['dtg', 'dtf', 'screen', 'vinyl'], defaultMethod: 'dtg', printSizing: 'constant',
  },
  {
    id: 'dress-shirt', slug: 'dress-shirt', title: 'Oxford Dress Shirt', category: 'Shirts', published: true,
    description: 'Button-front shirt with collar and cuffs; chest and cuff embroidery.',
    models: [sewn({ id: 'dress-shirt', label: 'Dress Shirt', garment: { kind: 'dress', chestIn: 21, lengthIn: 30, sleeveLengthIn: 24, collar: 'dress', placket: true, cuffs: true }, multiZone: true })],
    sizes: withSku('DS', longSleeve(ADULT_SIZES)), referenceSize: 'M', colors: CORE_COLORS.filter((c) => ['white', 'navy', 'royal', 'black', 'heather'].includes(c.id)), multiZoneColors: true,
    materials: ['poplin'], printMethods: ['embroidery', 'dtf'], defaultMethod: 'embroidery', printSizing: 'constant',
  },
  {
    id: 'workwear', slug: 'workwear-shirt', title: 'Workwear Shirt', category: 'Workwear', published: true,
    description: 'Durable twill work shirt for uniforms.',
    models: [sewn({ id: 'workwear', label: 'Work Shirt', garment: { kind: 'dress', chestIn: 22.5, lengthIn: 30, sleeveLengthIn: 9, collar: 'dress', placket: true, drop: 1.05 } })],
    sizes: withSku('WW', ADULT_SIZES), referenceSize: 'M', colors: CORE_COLORS.filter((c) => ['navy', 'black', 'heather', 'sand', 'forest'].includes(c.id)), multiZoneColors: false,
    materials: ['twill'], printMethods: ['embroidery', 'dtf', 'screen'], defaultMethod: 'embroidery', printSizing: 'constant',
  },
  {
    id: 'jersey', slug: 'sports-jersey', title: 'Sublimated Sports Jersey', category: 'Sportswear', published: true,
    description: 'Edge-to-edge sublimated performance jersey for teams.',
    models: [sewn({ id: 'jersey', label: 'Sports Jersey', garment: { kind: 'tee', chestIn: 21, lengthIn: 29, sleeveLengthIn: 8.5, collar: 'v' }, allOver: true })],
    sizes: withSku('JS', ADULT_SIZES), referenceSize: 'M', colors: CORE_COLORS.filter((c) => c.id === 'white'), multiZoneColors: false,
    materials: ['performance'], printMethods: ['sublimation'], defaultMethod: 'sublimation', printSizing: 'scale', minQty: 1,
  },
  {
    id: 'sports-tee', slug: 'sports-shirt', title: 'Performance Sports Shirt', category: 'Sportswear', published: true,
    description: 'Moisture-wicking tee for names and numbers.',
    models: [sewn({ id: 'sports-tee', label: 'Sports Shirt', garment: { kind: 'tee', chestIn: 20.5, lengthIn: 28.5, sleeveLengthIn: 8, collar: 'v' } })],
    sizes: withSku('ST', ADULT_SIZES), referenceSize: 'M', colors: CORE_COLORS, multiZoneColors: false,
    materials: ['performance', 'polyester'], printMethods: ['dtf', 'vinyl', 'screen'], defaultMethod: 'vinyl', printSizing: 'constant',
  },
  {
    id: 'kids-tee', slug: 'kids-t-shirt', title: 'Kids T-Shirt', category: 'Kids', published: true,
    description: 'Soft cotton tee for kids.',
    models: [sewn({ id: 'kids-tee', label: 'Kids Tee', garment: { kind: 'tee', chestIn: 15, lengthIn: 20.5, sleeveLengthIn: 5.5, collar: 'crew' } })],
    sizes: KIDS_SIZES, referenceSize: '7-8Y', colors: CORE_COLORS, multiZoneColors: false,
    materials: ['cotton'], printMethods: ['dtg', 'dtf', 'vinyl'], defaultMethod: 'dtg', printSizing: 'scale',
  },
]

// All families below are SIL Open Font License 1.1 (or Apache 2.0 where noted) — commercial embedding permitted.
const fonts: FontDef[] = ([
  ['Inter', 'Sans Serif'], ['Montserrat', 'Sans Serif'], ['Roboto', 'Sans Serif', 'Apache-2.0'], ['Poppins', 'Sans Serif'], ['Archivo', 'Sans Serif'],
  ['Playfair Display', 'Serif'], ['Merriweather', 'Serif'], ['Lora', 'Serif'], ['DM Serif Display', 'Serif'],
  ['Bebas Neue', 'Display'], ['Anton', 'Display'], ['Bungee', 'Display'], ['Righteous', 'Display'],
  ['Pacifico', 'Script'], ['Dancing Script', 'Script'], ['Lobster', 'Script'], ['Great Vibes', 'Script'],
  ['Oswald', 'Sports'], ['Teko', 'Sports'], ['Russo One', 'Sports'], ['Saira Condensed', 'Sports'],
  ['Graduate', 'College'], ['Alfa Slab One', 'College'], ['Staatliches', 'College'],
  ['Rye', 'Vintage'], ['Abril Fatface', 'Vintage'], ['Special Elite', 'Vintage', 'Apache-2.0'],
  ['Caveat', 'Handwritten'], ['Permanent Marker', 'Handwritten', 'Apache-2.0'], ['Kalam', 'Handwritten'],
  ['JetBrains Mono', 'Monospace'], ['Space Mono', 'Monospace'],
] as [string, FontDef['category'], string?][]).map(([family, category, license]) => ({ family, category, license: license ?? 'OFL-1.1', source: 'google' as const }))

const THREADS = ['#ffffff', '#111111', '#1f2a44', '#2250a8', '#b3202c', '#26452f', '#a7a8aa', '#e2a927', '#5a1f2b', '#f08a24', '#6d3fa0', '#8fc1e3', '#f4b6c2', '#c9b27c', '#3aa655']

export const defaultCatalog: Catalog = {
  schemaVersion: 1,
  products,
  fonts,
  materials: [
    { id: 'cotton', label: '100% Ringspun Cotton', description: 'Soft, breathable jersey', weave: 'jersey', roughness: 0.93, sheen: 0.55, normalScale: 0.35 },
    { id: 'blend', label: 'Cotton / Poly Blend', description: 'Smoother, less shrinkage', weave: 'jersey', roughness: 0.88, sheen: 0.45, normalScale: 0.28 },
    { id: 'polyester', label: '100% Polyester', description: 'Bright colours, quick dry', weave: 'jersey', roughness: 0.78, sheen: 0.35, normalScale: 0.22 },
    { id: 'performance', label: 'Performance Mesh', description: 'Breathable technical mesh', weave: 'mesh', roughness: 0.72, sheen: 0.3, normalScale: 0.5 },
    { id: 'fleece', label: 'Brushed Fleece', description: 'Heavyweight, warm', weave: 'fleece', roughness: 1, sheen: 0.9, normalScale: 0.2 },
    { id: 'pique', label: 'Cotton Piqué', description: 'Textured polo knit', weave: 'pique', roughness: 0.92, sheen: 0.5, normalScale: 0.55 },
    { id: 'poplin', label: 'Oxford Poplin', description: 'Crisp woven shirting', weave: 'poplin', roughness: 0.82, sheen: 0.3, normalScale: 0.25 },
    { id: 'twill', label: 'Heavy Twill', description: 'Hard-wearing work fabric', weave: 'twill', roughness: 0.9, sheen: 0.25, normalScale: 0.45 },
  ],
  printMethods: [
    { id: 'dtg', label: 'DTG', description: 'Direct-to-garment full colour, soft hand feel', finish: 'soft', artwork: ['text', 'raster', 'vector'], minDpi: 150, goodDpi: 300, allowsShadow: true, allowsGradient: true, materials: ['cotton', 'blend', 'fleece', 'pique'] },
    { id: 'dtf', label: 'DTF Transfer', description: 'Full colour film transfer, works on most fabrics', finish: 'matte', artwork: ['text', 'raster', 'vector'], minDpi: 150, goodDpi: 300, allowsShadow: true, allowsGradient: true },
    { id: 'screen', label: 'Screen Print', description: 'Spot colours, most durable for bulk', finish: 'matte', artwork: ['text', 'vector', 'raster'], minDpi: 200, goodDpi: 300, maxColors: 6, minLineIn: 0.02, allowsShadow: false, allowsGradient: false },
    { id: 'vinyl', label: 'Heat Vinyl', description: 'Cut vinyl for names and numbers', finish: 'glossy', artwork: ['text', 'vector'], minDpi: 0, goodDpi: 0, maxColors: 3, minLineIn: 0.08, minTextHeightIn: 0.5, allowsShadow: false, allowsGradient: false },
    { id: 'embroidery', label: 'Embroidery', description: 'Stitched thread, premium finish', finish: 'embroidery', artwork: ['text', 'vector'], minDpi: 0, goodDpi: 0, maxColors: 12, palette: THREADS, minTextHeightIn: 0.25, minLineIn: 0.05, maxAreaIn: { w: 12, h: 12 }, allowsShadow: false, allowsGradient: false },
    { id: 'sublimation', label: 'Sublimation', description: 'Edge-to-edge dye print on polyester', finish: 'dye', artwork: ['text', 'raster', 'vector'], minDpi: 120, goodDpi: 200, allOver: true, allowsShadow: true, allowsGradient: true, materials: ['performance', 'polyester'] },
  ],
  cameras: [
    { id: 'full', label: 'Full product', azimuth: 0.55, polar: 1.38, distance: 2.5 },
    { id: 'front', label: 'Front', azimuth: 0, polar: 1.5, distance: 2.3 },
    { id: 'back', label: 'Back', azimuth: Math.PI, polar: 1.5, distance: 2.3 },
    { id: 'left', label: 'Left', azimuth: Math.PI / 2, polar: 1.5, distance: 2.3 },
    { id: 'right', label: 'Right', azimuth: -Math.PI / 2, polar: 1.5, distance: 2.3 },
    { id: 'left_sleeve', label: 'Left sleeve', azimuth: 1.15, polar: 1.4, distance: 1.45, focus: 'left_sleeve' },
    { id: 'right_sleeve', label: 'Right sleeve', azimuth: -1.15, polar: 1.4, distance: 1.45, focus: 'right_sleeve' },
    { id: 'neck', label: 'Neck', azimuth: 0, polar: 0.55, distance: 1.25, focus: 'back_inside' },
    { id: 'detail', label: 'Detail', azimuth: 0.35, polar: 1.4, distance: 1.1 },
  ],
  pricing: {
    currency: 'USD',
    rules: [
      { id: 'base-tee', label: 'Classic T-Shirt', amount: 18, per: 'unit', when: { productIds: ['tshirt'] } },
      { id: 'premium-tee', label: 'Premium fit', amount: 4, per: 'unit', when: { modelIds: ['premium-tee'] } },
      { id: 'oversized-tee', label: 'Oversized fit', amount: 3, per: 'unit', when: { modelIds: ['oversized-tee'] } },
      { id: 'base-ls', label: 'Long Sleeve Tee', amount: 22, per: 'unit', when: { productIds: ['longsleeve'] } },
      { id: 'base-polo', label: 'Piqué Polo', amount: 26, per: 'unit', when: { productIds: ['polo'] } },
      { id: 'base-hoodie', label: 'Pullover Hoodie', amount: 38, per: 'unit', when: { productIds: ['hoodie'] } },
      { id: 'base-sweat', label: 'Crew Sweatshirt', amount: 32, per: 'unit', when: { productIds: ['sweatshirt'] } },
      { id: 'base-tank', label: 'Tank Top', amount: 15, per: 'unit', when: { productIds: ['tank'] } },
      { id: 'base-dress', label: 'Oxford Dress Shirt', amount: 42, per: 'unit', when: { productIds: ['dress-shirt'] } },
      { id: 'base-work', label: 'Workwear Shirt', amount: 36, per: 'unit', when: { productIds: ['workwear'] } },
      { id: 'base-jersey', label: 'Sublimated Jersey', amount: 34, per: 'unit', when: { productIds: ['jersey'] } },
      { id: 'base-sports', label: 'Performance Sports Shirt', amount: 20, per: 'unit', when: { productIds: ['sports-tee'] } },
      { id: 'base-kids', label: 'Kids T-Shirt', amount: 14, per: 'unit', when: { productIds: ['kids-tee'] } },
      { id: 'size-2xl', label: '2XL size', amount: 2, per: 'unit', when: { sizeIds: ['2XL'] } },
      { id: 'size-3xl', label: '3XL size', amount: 3, per: 'unit', when: { sizeIds: ['3XL'] } },
      { id: 'mat-blend', label: 'Blend fabric', amount: 2, per: 'unit', when: { materialIds: ['blend'] } },
      { id: 'mat-poly', label: 'Polyester fabric', amount: 3, per: 'unit', when: { materialIds: ['polyester'] } },
      { id: 'mat-perf', label: 'Performance fabric', amount: 6, per: 'unit', when: { materialIds: ['performance'], productIds: ['tshirt', 'tank', 'polo', 'sports-tee'] } },
      { id: 'print-large', label: 'Large print', amount: 5, per: 'area', when: { areaGroups: ['large'], methodIds: ['dtg', 'dtf', 'vinyl'] } },
      { id: 'print-small', label: 'Small print', amount: 3, per: 'area', when: { areaGroups: ['small', 'label'], methodIds: ['dtg', 'dtf', 'vinyl'] } },
      { id: 'print-sleeve', label: 'Sleeve print', amount: 3, per: 'area', when: { areaGroups: ['sleeve'], methodIds: ['dtg', 'dtf', 'vinyl'] } },
      { id: 'screen-area', label: 'Screen print location', amount: 2, per: 'area', when: { methodIds: ['screen'] } },
      { id: 'screen-color', label: 'Screen colour', amount: 1, per: 'color', when: { methodIds: ['screen'] } },
      { id: 'screen-setup', label: 'Screen setup (per order)', amount: 25, per: 'order', when: { methodIds: ['screen'] } },
      { id: 'emb-large', label: 'Large embroidery', amount: 14, per: 'area', when: { areaGroups: ['large'], methodIds: ['embroidery'] } },
      { id: 'emb-small', label: 'Embroidery', amount: 8, per: 'area', when: { areaGroups: ['small', 'sleeve', 'label'], methodIds: ['embroidery'] } },
      { id: 'sublimation', label: 'All-over panel', amount: 6, per: 'area', when: { methodIds: ['sublimation'] } },
      { id: 'personal', label: 'Name / number personalisation', amount: 3, per: 'personalizedUnit' },
      { id: 'premium-art', label: 'Premium artwork', amount: 2, per: 'premiumAsset' },
    ],
    tiers: [
      { minQty: 1, pctOff: 0, label: '1–9' },
      { minQty: 10, pctOff: 5, label: '10–24' },
      { minQty: 25, pctOff: 10, label: '25–49' },
      { minQty: 50, pctOff: 15, label: '50–99' },
      { minQty: 100, pctOff: 20, label: '100+' },
    ],
  },
  validation: { outOfBounds: 'block', lowDpi: 'warn', exclusion: 'block', methodLimits: 'block' },
  templates: [
    {
      id: 'football-jersey', title: 'Football Jersey', description: 'Team crest, player name and number.', productId: 'jersey',
      areas: {
        back_allover: [
          { kind: 'text', name: 'Player name', text: 'SMITH', fontFamily: 'Graduate', fontSize: 1.6, fill: '#1f2a44', x: 0.5, y: 0.2, lock: 'editable', required: true, bulkField: 'name' },
          { kind: 'text', name: 'Player number', text: '24', fontFamily: 'Graduate', fontSize: 8, fill: '#1f2a44', x: 0.5, y: 0.45, lock: 'editable', required: true, bulkField: 'number' },
        ],
        front_allover: [
          { kind: 'clipart', name: 'Club crest', clipartId: 'shield', fill: '#1f2a44', x: 0.66, y: 0.24, widthFrac: 0.16, lock: 'locked' },
          { kind: 'text', name: 'Front number', text: '24', fontFamily: 'Graduate', fontSize: 3.2, fill: '#1f2a44', x: 0.34, y: 0.3, lock: 'editable', bulkField: 'number' },
        ],
      },
      restrictFonts: ['Graduate', 'Oswald', 'Teko', 'Bebas Neue'],
    },
    {
      id: 'company-uniform', title: 'Company Uniform', description: 'Locked logo on chest, editable staff name.', productId: 'polo', colors: { body: 'navy', collar: 'navy', sleeves: 'navy' }, methodId: 'embroidery',
      areas: {
        left_chest: [{ kind: 'clipart', name: 'Company logo', clipartId: 'hexagon-logo', fill: '#ffffff', x: 0.5, y: 0.5, widthFrac: 0.7, lock: 'locked' }],
        right_chest: [{ kind: 'text', name: 'Staff name', text: 'Alex', fontFamily: 'Montserrat', fontSize: 0.55, fill: '#ffffff', x: 0.5, y: 0.5, lock: 'editable', required: true, bulkField: 'name' }],
      },
      restrictColors: ['#ffffff', '#e2a927'],
    },
    {
      id: 'birthday', title: 'Birthday Shirt', description: 'Big playful birthday message.', productId: 'tshirt', colors: { body: 'white' },
      areas: {
        full_front: [
          { kind: 'clipart', name: 'Party star', clipartId: 'star', fill: '#e2a927', x: 0.5, y: 0.25, widthFrac: 0.3, lock: 'editable' },
          { kind: 'text', name: 'Headline', text: 'BIRTHDAY\nCREW', fontFamily: 'Bungee', fontSize: 1.8, fill: '#b3202c', x: 0.5, y: 0.62, lock: 'editable', required: true },
        ],
      },
    },
    {
      id: 'staff', title: 'Staff Shirt', description: 'STAFF on the back, name on chest.', productId: 'tshirt', colors: { body: 'black' },
      areas: {
        full_back: [{ kind: 'text', name: 'Staff label', text: 'STAFF', fontFamily: 'Anton', fontSize: 3.4, fill: '#ffffff', x: 0.5, y: 0.2, lock: 'locked' }],
        left_chest: [{ kind: 'text', name: 'Name', text: 'Your Name', fontFamily: 'Inter', fontSize: 0.6, fill: '#ffffff', x: 0.5, y: 0.5, lock: 'editable', required: true, bulkField: 'name' }],
      },
    },
    {
      id: 'school-event', title: 'School Event', description: 'Event name and year.', productId: 'tshirt', colors: { body: 'royal' },
      areas: {
        full_front: [
          { kind: 'clipart', name: 'Graduation cap', clipartId: 'grad-cap', fill: '#ffffff', x: 0.5, y: 0.22, widthFrac: 0.35, lock: 'editable' },
          { kind: 'text', name: 'Event', text: 'FIELD DAY', fontFamily: 'Staatliches', fontSize: 2, fill: '#ffffff', x: 0.5, y: 0.55, lock: 'editable', required: true },
          { kind: 'text', name: 'Year', text: '2026', fontFamily: 'Staatliches', fontSize: 1.2, fill: '#e2a927', x: 0.5, y: 0.72, lock: 'editable' },
        ],
      },
    },
    {
      id: 'restaurant', title: 'Restaurant Uniform', description: 'Kitchen crew workwear.', productId: 'workwear', colors: { body: 'black' }, methodId: 'embroidery',
      areas: {
        left_chest: [{ kind: 'clipart', name: 'Restaurant mark', clipartId: 'chef-hat', fill: '#ffffff', x: 0.5, y: 0.4, widthFrac: 0.55, lock: 'locked' }],
        right_chest: [{ kind: 'text', name: 'Crew name', text: 'Chef Sam', fontFamily: 'Lora', fontSize: 0.5, fill: '#ffffff', x: 0.5, y: 0.5, lock: 'editable', required: true, bulkField: 'name' }],
      },
    },
  ],
}
