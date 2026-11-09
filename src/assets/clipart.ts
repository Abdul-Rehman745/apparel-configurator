// Original clipart authored for this platform (no third-party sources). Single-colour,
// colourisable: fills/strokes of "currentColor" are replaced with the chosen colour on insert.
import type { LicenseInfo } from '../core/types'

export interface Clipart {
  id: string
  name: string
  category: string
  tags: string[]
  svg: string
  premium?: boolean
  /** Inserts a styled text object instead of SVG (numbers/letters). */
  textPreset?: { text: string; font: string }
  license: LicenseInfo
}

export const CLIPART_LICENSE: LicenseInfo = {
  source: 'internal', author: 'Platform design team', license: 'Proprietary – original work, licensed to tenants for garment printing',
  attributionRequired: false, redistribution: 'embedded-only',
}

const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${body}</svg>`
const F = 'fill="currentColor"'
const S = (w = 6) => `fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`

type Def = [id: string, name: string, category: string, tags: string, body: string, premium?: boolean]

const defs: Def[] = [
  // Animals
  ['paw', 'Paw print', 'Animals', 'dog cat pet', `<g ${F}><ellipse cx="50" cy="68" rx="20" ry="17"/><ellipse cx="24" cy="44" rx="8" ry="11"/><ellipse cx="40" cy="28" rx="8" ry="11"/><ellipse cx="60" cy="28" rx="8" ry="11"/><ellipse cx="76" cy="44" rx="8" ry="11"/></g>`],
  ['fish', 'Fish', 'Animals', 'sea ocean', `<path ${F} fill-rule="evenodd" d="M10 50c14-20 42-26 62-10l18-14v48l-18-14C52 76 24 70 10 50zm22-4a4 4 0 1 0 0.1 0z"/>`],
  ['bird', 'Swallow', 'Animals', 'fly wings', `<path ${F} d="M6 38c18 2 30 10 40 22 6-16 22-30 48-32-14 8-22 18-26 30l14-2c-12 8-26 12-40 12-10 0-20-6-26-14l12 2C22 48 14 42 6 38z"/>`],
  ['cat', 'Cat head', 'Animals', 'kitten pet', `<path ${F} fill-rule="evenodd" d="M18 14l20 18a34 30 0 0 1 24 0l20-18 2 38a34 30 0 0 1-68 0zm18 42a5 5 0 1 0 .1 0zm28 0a5 5 0 1 0 .1 0zM50 68l-5-4h10z"/>`],
  // Sports
  ['soccer', 'Football', 'Sports', 'soccer ball team', `<path ${F} fill-rule="evenodd" d="M50 6a44 44 0 1 1 0 88 44 44 0 0 1 0-88zm0 7a37 37 0 1 0 0 74 37 37 0 0 0 0-74zm0 20l16 12-6 19H40l-6-19z"/><path ${S(4)} d="M50 33V14M66 45l17-6M60 64l10 15M40 64l-10 15M34 45l-17-6"/>`],
  ['basketball', 'Basketball', 'Sports', 'ball hoop', `<g ${S(5)}><circle cx="50" cy="50" r="42"/><path d="M8 50h84M50 8v84M20 20c16 14 16 46 0 60M80 20c-16 14-16 46 0 60"/></g>`],
  ['trophy', 'Trophy', 'Sports', 'winner cup champion', `<path ${F} d="M28 10h44v10h16c0 18-8 28-20 30-4 8-10 12-14 13v13h14v8H32v-8h14V63c-4-1-10-5-14-13C20 48 12 38 12 20h16zm-8 18c1 8 4 13 9 15-2-5-2-10-1-15zm60 0h-8c1 5 1 10-1 15 5-2 8-7 9-15z"/>`],
  ['dumbbell', 'Dumbbell', 'Sports', 'gym fitness', `<path ${F} d="M6 40h8v-8h10v36H14v-8H6zm88 0h-8v-8H76v36h10v-8h8zM28 26h10v48H28zm34 0h10v48H62zM38 45h24v10H38z"/>`],
  ['lightning', 'Lightning bolt', 'Sports', 'energy power fast', `<path ${F} d="M58 4L18 56h26l-8 40 46-56H56z"/>`],
  // Business
  ['hexagon-logo', 'Hex mark', 'Business', 'logo company corporate', `<path ${F} fill-rule="evenodd" d="M50 4l40 23v46L50 96 10 73V27zm0 16L24 35v30l26 15 26-15V35zm0 14l12 7v14l-12 7-12-7V41z"/>`],
  ['briefcase', 'Briefcase', 'Business', 'work office', `<path ${F} fill-rule="evenodd" d="M36 18h28a6 6 0 0 1 6 6v8h18a6 6 0 0 1 6 6v44a6 6 0 0 1-6 6H12a6 6 0 0 1-6-6V38a6 6 0 0 1 6-6h18v-8a6 6 0 0 1 6-6zm2 8v6h24v-6z"/>`],
  ['chart', 'Growth chart', 'Business', 'graph stats growth', `<path ${F} d="M10 88h80v6H10zM16 60h14v24H16zm22-16h14v40H38zm22-16h14v56H60z"/><path ${S(5)} d="M14 44l24-18 18 10 28-24m-12 0h12v12"/>`],
  ['target', 'Target', 'Business', 'goal bullseye aim', `<path ${F} fill-rule="evenodd" d="M50 6a44 44 0 1 1 0 88 44 44 0 0 1 0-88zm0 10a34 34 0 1 0 0 68 34 34 0 0 0 0-68zm0 8a26 26 0 1 1 0 52 26 26 0 0 1 0-52zm0 10a16 16 0 1 0 0 32 16 16 0 0 0 0-32zm0 8a8 8 0 1 1 0 16 8 8 0 0 1 0-16z"/>`],
  ['bulb', 'Idea bulb', 'Business', 'idea light innovation', `<path ${F} d="M50 6a30 30 0 0 1 18 54c-4 3-6 7-6 12H38c0-5-2-9-6-12A30 30 0 0 1 50 6zM38 78h24v6H38zm4 10h16v6H42z"/>`],
  // Nature
  ['leaf', 'Leaf', 'Nature', 'eco green plant', `<path ${F} d="M86 10C40 10 14 34 14 66c0 8 2 14 6 20l-8 8 4 4 8-8c6 4 12 6 20 6 32 0 50-30 42-86zM30 78c10-18 24-32 42-44-14 14-26 28-36 48z"/>`],
  ['tree', 'Pine tree', 'Nature', 'forest outdoors camping', `<path ${F} d="M50 4l22 30H60l20 26H64l22 22H56v14H44V82H14l22-22H20l20-26H28z"/>`],
  ['sun', 'Sun', 'Nature', 'summer sunny', `<circle ${F} cx="50" cy="50" r="20"/><path ${S(6)} d="M50 6v14M50 80v14M6 50h14M80 50h14M19 19l10 10M71 71l10 10M19 81l10-10M71 29l10-10"/>`],
  ['mountain', 'Mountains', 'Nature', 'hiking outdoors adventure', `<path ${F} d="M4 86l30-50 14 22 14-30 34 58zm30-38l-6 10 6-3 6 3z"/>`],
  ['wave', 'Wave', 'Nature', 'surf ocean beach', `<path ${F} d="M4 70c10-30 36-56 64-48-16 4-24 16-22 30 4-10 14-14 22-10-10 6-12 18-2 24 10 6 22 2 30-6v30H4z"/>`],
  ['flower', 'Flower', 'Nature', 'floral spring bloom', `<g ${F}><circle cx="50" cy="26" r="16"/><circle cx="74" cy="44" r="16"/><circle cx="64" cy="72" r="16"/><circle cx="36" cy="72" r="16"/><circle cx="26" cy="44" r="16"/></g><circle cx="50" cy="50" r="10" fill="#fff" fill-opacity=".85"/>`],
  // Food
  ['coffee', 'Coffee cup', 'Food', 'cafe drink', `<path ${F} d="M14 36h56v26a24 24 0 0 1-24 24h-8a24 24 0 0 1-24-24zm56 6h6a12 12 0 0 1 0 24h-7l2-7h5a5 5 0 0 0 0-10h-6zM10 90h66v6H10z"/><path ${S(4)} d="M32 8c-4 6 4 10 0 18M46 8c-4 6 4 10 0 18"/>`],
  ['pizza', 'Pizza slice', 'Food', 'restaurant food', `<path ${F} fill-rule="evenodd" d="M10 14c30-10 60-10 80 0L50 94zm24 18a6 6 0 1 0 .1 0zm28 6a6 6 0 1 0 .1 0zM48 58a6 6 0 1 0 .1 0z"/>`],
  ['apple', 'Apple', 'Food', 'fruit healthy school', `<path ${F} d="M50 30c10-8 36-8 36 22 0 22-16 42-26 42-4 0-6-2-10-2s-6 2-10 2C30 94 14 74 14 52c0-30 26-30 36-22zm2-6c0-10 6-18 16-20 0 10-6 18-16 20z"/>`],
  ['chef-hat', 'Chef hat', 'Food', 'kitchen cook restaurant', `<path ${F} d="M28 64C14 62 8 50 12 40s16-14 24-10c2-12 12-18 22-16s16 8 16 16c8-4 20 0 22 12 2 12-6 20-18 22v10H28zm0 16h44v12H28z"/>`],
  ['cupcake', 'Cupcake', 'Food', 'birthday party bakery', `<path ${F} d="M22 52h56l-8 42H30zm28-44c4 0 6 4 6 6 16 2 28 12 28 26 0 4-2 8-6 8H22c-4 0-6-4-6-8 0-14 12-24 28-26 0-2 2-6 6-6z"/>`],
  // Travel
  ['plane', 'Airplane', 'Travel', 'flight trip vacation', `<path ${F} d="M46 6c4 0 6 4 6 10v22l38 22v10l-38-12v20l12 10v8l-16-6-16 6v-8l12-10V58L6 70V60l38-22V16c0-6 2-10 2-10z"/>`],
  ['compass', 'Compass', 'Travel', 'adventure explore navigation', `<path ${F} fill-rule="evenodd" d="M50 4a46 46 0 1 1 0 92 46 46 0 0 1 0-92zm0 8a38 38 0 1 0 0 76 38 38 0 0 0 0-76zm18 20L56 56 32 68l12-24zM50 46a4 4 0 1 0 .1 0z"/>`],
  ['pin', 'Map pin', 'Travel', 'location place', `<path ${F} fill-rule="evenodd" d="M50 4c18 0 32 14 32 32 0 24-32 60-32 60S18 60 18 36C18 18 32 4 50 4zm0 18a14 14 0 1 0 0 28 14 14 0 0 0 0-28z"/>`],
  ['anchor', 'Anchor', 'Travel', 'nautical sailing marine', `<path ${F} fill-rule="evenodd" d="M50 4a10 10 0 0 1 4 19v7h14v8H54v46c14-2 24-10 28-22l-8 2 14-18 6 22-6-4c-6 20-22 30-42 30S14 84 8 64l-6 4 6-22 14 18-8-2c4 12 14 20 28 22V38H28v-8h14v-7a10 10 0 0 1 8-19zm0 7a4 4 0 1 0 .1 0z"/>`],
  // Education
  ['grad-cap', 'Graduation cap', 'Education', 'school graduate college', `<path ${F} d="M50 14l46 20-46 20L4 34zM24 48l26 11 26-11v18c0 8-12 14-26 14s-26-6-26-14zm62-10h4v28l3 10h-10l3-10z"/>`],
  ['book', 'Open book', 'Education', 'reading library study', `<path ${F} d="M6 20c16-4 30-2 40 6v62c-10-8-24-10-40-6zm88 0c-16-4-30-2-40 6v62c10-8 24-10 40-6z"/>`],
  ['pencil', 'Pencil', 'Education', 'write draw art', `<path ${F} d="M72 8l20 20-56 56H16V64zM12 88l4-20 16 16z"/>`],
  ['atom', 'Atom', 'Education', 'science physics chemistry', `<g ${S(5)}><ellipse cx="50" cy="50" rx="44" ry="16"/><ellipse cx="50" cy="50" rx="44" ry="16" transform="rotate(60 50 50)"/><ellipse cx="50" cy="50" rx="44" ry="16" transform="rotate(-60 50 50)"/></g><circle ${F} cx="50" cy="50" r="7"/>`],
  // Gaming
  ['controller', 'Game controller', 'Gaming', 'gamer console play', `<path ${F} fill-rule="evenodd" d="M28 26h44c14 0 22 12 24 30 2 16-4 22-10 22-8 0-12-10-20-10H34c-8 0-12 10-20 10-6 0-12-6-10-22 2-18 10-30 24-30zm-2 12v8h-8v6h8v8h6v-8h8v-6h-8v-8zm42 2a4 4 0 1 0 .1 0zm8 8a4 4 0 1 0 .1 0zm-16 0a4 4 0 1 0 .1 0zm8 8a4 4 0 1 0 .1 0z"/>`],
  ['dice', 'Dice', 'Gaming', 'board game luck', `<path ${F} fill-rule="evenodd" d="M18 8h64a10 10 0 0 1 10 10v64a10 10 0 0 1-10 10H18A10 10 0 0 1 8 82V18A10 10 0 0 1 18 8zm12 14a7 7 0 1 0 .1 0zm40 0a7 7 0 1 0 .1 0zM50 43a7 7 0 1 0 .1 0zM30 64a7 7 0 1 0 .1 0zm40 0a7 7 0 1 0 .1 0z"/>`],
  ['pixel-heart', 'Pixel heart', 'Gaming', 'retro 8bit life', `<path ${F} d="M18 18h20v8h8v8h8v-8h8v-8h20v8h8v28h-8v8h-8v8h-8v8h-8v8h-8v-8h-8v-8h-8v-8h-8v-8H10V26h8z"/>`],
  ['sword', 'Sword', 'Gaming', 'rpg fantasy knight', `<path ${F} d="M86 6l8 8-44 50-6-6zM28 56l16 16-6 6-4-4-12 12a4 4 0 0 1-8-8l12-12-4-4z"/>`],
  // Holidays
  ['gift', 'Gift', 'Holidays', 'present christmas birthday', `<path ${F} d="M10 34h80v16H10zm6 20h30v38H16zm38 0h30v38H54zM50 32c-8-14-24-22-28-12-4 8 12 12 28 12zm0 0c8-14 24-22 28-12 4 8-12 12-28 12z"/>`],
  ['snowflake', 'Snowflake', 'Holidays', 'winter christmas snow', `<g ${S(5)}><path d="M50 6v88M12 28l76 44M12 72l76-44"/><path d="M40 12l10 10 10-10M40 88l10-10 10 10M10 40l14 4-4 14M90 60l-14-4 4-14M10 60l14-4-4-14M90 40l-14 4 4 14"/></g>`],
  ['balloon', 'Balloon', 'Holidays', 'party birthday celebration', `<path ${F} d="M50 4c18 0 30 14 30 32 0 20-16 36-30 38-14-2-30-18-30-38C20 18 32 4 50 4zm-5 72h10l-3 5h-4z"/><path ${S(3)} d="M50 81c-6 6 6 8 0 16"/>`],
  ['pumpkin', 'Pumpkin', 'Holidays', 'halloween autumn fall', `<path ${F} d="M50 26c6-4 16-6 24 0 18 4 22 22 18 40-4 20-18 28-32 26-4 2-16 2-20 0-14 2-28-6-32-26-4-18 0-36 18-40 8-6 18-4 24 0zm-2-2c0-10 4-16 12-18l2 4c-6 2-8 8-8 14z"/>`],
  // Shapes (decorative)
  ['heart', 'Heart', 'Shapes', 'love valentine', `<path ${F} d="M50 90S8 62 8 34C8 18 20 8 32 8c8 0 14 4 18 12 4-8 10-12 18-12 12 0 24 10 24 26 0 28-42 56-42 56z"/>`],
  ['star', 'Star', 'Shapes', 'rating favourite', `<path ${F} d="M50 4l13 30 33 3-25 22 8 33-29-17-29 17 8-33L4 37l33-3z"/>`],
  ['crown', 'Crown', 'Shapes', 'king queen royal', `<path ${F} d="M8 30l20 18 22-32 22 32 20-18-8 50H16zm8 56h68v8H16z"/>`, true],
  // Icons
  ['check', 'Check mark', 'Icons', 'tick done ok', `<path ${S(12)} d="M14 52l24 24 48-52"/>`],
  ['music', 'Music note', 'Icons', 'song band concert', `<path ${F} d="M36 16l52-10v62a14 12 0 1 1-8-11V26L44 32v44a14 12 0 1 1-8-11z"/>`],
  ['camera', 'Camera', 'Icons', 'photo photography', `<path ${F} fill-rule="evenodd" d="M36 16h28l6 10h16a8 8 0 0 1 8 8v46a8 8 0 0 1-8 8H14a8 8 0 0 1-8-8V34a8 8 0 0 1 8-8h16zm14 20a20 20 0 1 0 0 40 20 20 0 0 0 0-40zm0 8a12 12 0 1 1 0 24 12 12 0 0 1 0-24z"/>`],
  ['arrow', 'Arrow', 'Icons', 'direction next', `<path ${F} d="M6 42h58V20l30 30-30 30V58H6z"/>`],
  // Abstract
  ['rings', 'Rings', 'Abstract', 'circles geometric', `<g ${S(6)}><circle cx="36" cy="40" r="26"/><circle cx="64" cy="40" r="26"/><circle cx="50" cy="64" r="26"/></g>`],
  ['zigzag', 'Zigzag', 'Abstract', 'pattern chevron', `<path ${S(8)} d="M6 30l18 18 18-18 18 18 18-18 16 16M6 60l18 18 18-18 18 18 18-18 16 16"/>`],
  ['burst', 'Burst', 'Abstract', 'starburst explosion comic', `<path ${F} d="M50 2l8 22 20-12-4 22 22 4-16 16 16 16-22 4 4 22-20-12-8 22-8-22-20 12 4-22-22-4 16-16L4 38l22-4-4-22 20 12z"/>`],
  // Badges
  ['shield', 'Shield crest', 'Badges', 'club team crest security', `<path ${F} fill-rule="evenodd" d="M50 4l40 12v28c0 24-16 42-40 52C26 86 10 68 10 44V16zm0 10L20 23v21c0 18 12 32 30 40 18-8 30-22 30-40V23zm0 14l6 13 14 1-11 9 4 14-13-8-13 8 4-14-11-9 14-1z"/>`],
  ['ribbon-badge', 'Award ribbon', 'Badges', 'medal prize first', `<path ${F} fill-rule="evenodd" d="M50 4a30 30 0 1 1 0 60 30 30 0 0 1 0-60zm0 10a20 20 0 1 0 0 40 20 20 0 0 0 0-40zM30 60l-12 32 14-6 8 12 8-28zm40 0l12 32-14-6-8 12-8-28z"/>`],
  ['banner', 'Banner', 'Badges', 'ribbon scroll label', `<path ${F} d="M16 30h68v36H16zM4 40h10v34l-10-8 6-9zm92 0H86v34l10-8-6-9z"/>`],
  ['laurel', 'Laurel wreath', 'Badges', 'victory champion award', `<g ${F}>${Array.from({ length: 7 }, (_, i) => { const a = 200 + i * 20, r = 38, x = 50 + r * Math.cos((a * Math.PI) / 180), y = 54 + r * Math.sin((-a * Math.PI) / 180); return `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="5" ry="10" transform="rotate(${(a - 180).toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})"/><ellipse cx="${(100 - x).toFixed(1)}" cy="${y.toFixed(1)}" rx="5" ry="10" transform="rotate(${(180 - a).toFixed(0)} ${(100 - x).toFixed(1)} ${y.toFixed(1)})"/>` }).join('')}</g>`, true],
]

const numbers: Clipart[] = Array.from({ length: 10 }, (_, n) => ({
  id: `num-${n}`, name: `Number ${n}`, category: 'Numbers', tags: ['number', 'jersey', String(n)], svg: '', textPreset: { text: String(n), font: 'Graduate' }, license: CLIPART_LICENSE,
}))
const letters: Clipart[] = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((l) => ({
  id: `letter-${l}`, name: `Letter ${l}`, category: 'Letters', tags: ['letter', 'varsity', l.toLowerCase()], svg: '', textPreset: { text: l, font: 'Alfa Slab One' }, license: CLIPART_LICENSE,
}))

export const CLIPART: Clipart[] = [
  ...defs.map(([id, name, category, tags, body, premium]) => ({ id, name, category, tags: tags.split(' '), svg: svg(body), premium, license: CLIPART_LICENSE })),
  ...numbers,
  ...letters,
]

export const CLIPART_CATEGORIES = ['Animals', 'Sports', 'Business', 'Nature', 'Food', 'Travel', 'Education', 'Gaming', 'Holidays', 'Shapes', 'Icons', 'Abstract', 'Badges', 'Numbers', 'Letters']

export const colorizeSvg = (svgText: string, color: string) => svgText.replace(/currentColor/g, color)

let custom: Clipart[] = []
/** Tenant clipart from the catalog joins the built-in library. */
export function registerCustomClipart(list: Omit<Clipart, 'textPreset'>[] = []) { custom = list }
export const allClipart = (): Clipart[] => [...custom, ...CLIPART]
