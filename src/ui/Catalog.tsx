// Storefront catalog (/catalog): every published product from the tenant catalog, linking into the studio.
import { useState } from 'react'
import type { Catalog, Product, ProceduralGarment, Tenant } from '../core/types'
import { formatMoney } from '../pricing/pricing'
import './catalog.css'

const BODY = {
  tee: 'M62 22 L86 12 Q100 26 114 12 L138 22 L180 52 L162 84 L140 72 L140 200 L60 200 L60 72 L38 84 L20 52 Z',
  long: 'M62 22 L86 12 Q100 26 114 12 L138 22 L170 50 L192 160 L170 168 L148 86 L140 78 L140 200 L60 200 L60 78 L52 86 L30 168 L8 160 L30 50 Z',
  hood: 'M58 34 Q58 2 100 2 Q142 2 142 34 L172 54 L194 164 L172 172 L150 90 L144 84 L144 200 L56 200 L56 84 L50 90 L28 172 L6 164 L28 54 Z',
  tank: 'M72 12 L86 12 Q100 50 114 12 L128 12 Q130 54 150 70 L150 200 L50 200 L50 70 Q70 54 72 12 Z',
}
const NECK = { crew: 'M86 12 Q100 30 114 12', v: 'M86 12 L100 38 L114 12', polo: 'M86 12 L93 32 L100 22 L107 32 L114 12', dress: 'M86 12 L94 36 L100 22 L106 36 L114 12', hood: 'M78 36 Q100 62 122 36' }

/** Flat 2D outline from the product's procedural garment (a GLB-only product falls back to a tee). */
function outline(g?: ProceduralGarment) {
  const long = !!g && g.sleeveLengthIn > 15
  const body = g?.kind === 'hoodie' ? BODY.hood : g?.kind === 'tank' ? BODY.tank : long ? BODY.long : BODY.tee
  const d = [g?.kind === 'tank' ? 'M86 12 Q100 50 114 12' : NECK[g?.collar ?? 'crew']]
  if (g?.placket) d.push(g.collar === 'dress' ? 'M100 22 L100 200' : 'M100 22 L100 58')
  if (g?.pocket) d.push('M66 150 L134 150 L142 188 L58 188 Z')
  if (g?.cuffs && long) d.push(g.kind === 'hoodie' ? 'M174 162 L192 156 M26 162 L8 156' : 'M170 158 L189 152 M30 158 L11 152')
  return { body, detail: d.join(' '), width: `${Math.min(70, Math.round((g?.chestIn ?? 20) * (long || g?.kind === 'hoodie' ? 3.4 : 3.1)))}%` }
}

const isDark = (hex: string) => { const n = parseInt(hex.slice(1), 16); return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 < 140 }

/** Base garment price: unit rules that apply to the product with no other condition. */
function basePrice(catalog: Catalog, p: Product) {
  return catalog.pricing.rules
    .filter((r) => r.per === 'unit' && r.when?.productIds?.includes(p.id) && Object.keys(r.when).length === 1)
    .reduce((s, r) => s + r.amount, 0)
}

function studioHref(productId: string) {
  const q = new URLSearchParams({ product: productId })
  const tenant = new URLSearchParams(location.search).get('tenant')
  if (tenant) q.set('tenant', tenant)
  return `/?${q}`
}

function Card({ catalog, product, currency, locale }: { catalog: Catalog; product: Product; currency: string; locale: string }) {
  const [color, setColor] = useState(product.colors[0]?.hex ?? '#f4f4f1')
  const g = product.models.map((m) => m.source.garment).find(Boolean)
  const o = outline(g)
  const edge = isDark(color) ? '#8e8c96' : '#8d8a84'
  const methods = product.printMethods.map((id) => catalog.printMethods.find((m) => m.id === id)?.label ?? id)
  const areas = Math.max(...product.models.map((m) => m.printAreas.length))
  const shown = product.colors.slice(0, 6)
  return (
    <article className="cat-card">
      <div className="cat-card-media">
        <svg viewBox="0 0 200 210" style={{ width: o.width }} aria-hidden>
          <path d={o.body} fill={color} stroke={edge} strokeWidth={1.5} strokeLinejoin="round" />
          <path d={o.detail} fill="none" stroke={edge} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="cat-tag">{product.category}</span>
      </div>
      <div className="cat-card-body">
        <div className="cat-card-head">
          <h2>{product.title}</h2>
          <p>from <strong>{formatMoney(basePrice(catalog, product), currency, locale)}</strong></p>
        </div>
        <p className="cat-desc">{product.description}</p>
        <div className="cat-swatches" role="group" aria-label={`${product.title} colours`}>
          {shown.map((c) => (
            <button key={c.id} type="button" aria-label={c.name} aria-pressed={c.hex === color} onClick={() => setColor(c.hex)}>
              <span style={{ background: c.hex }} />
            </button>
          ))}
          {product.colors.length > shown.length && <span className="cat-more">+{product.colors.length - shown.length} more</span>}
        </div>
        <ul className="cat-methods" aria-label="Print methods">{methods.map((m) => <li key={m}>{m}</li>)}</ul>
        <div className="cat-card-foot">
          <span>{areas} print areas{product.models.length > 1 ? ` · ${product.models.length} fits` : ''}</span>
          <a className="btn btn-primary" href={studioHref(product.id)}>Customise</a>
        </div>
      </div>
    </article>
  )
}

export default function CatalogPage({ catalog, tenant }: { catalog: Catalog; tenant: Tenant }) {
  const products = catalog.products.filter((p) => p.published)
  const categories = ['All', ...new Set(products.map((p) => p.category))]
  const [cat, setCat] = useState('All')
  const list = products.filter((p) => cat === 'All' || p.category === cat)
  const maxAreas = Math.max(...products.flatMap((p) => p.models.map((m) => m.printAreas.length)))
  const methodCount = new Set(products.flatMap((p) => p.printMethods)).size
  return (
    <div className="cat-page">
      <header className="cat-top">
        <div className="cat-wrap cat-top-row">
          <a className="brand" href="/catalog">
            <span className="logo" dangerouslySetInnerHTML={{ __html: tenant.logoSvg }} aria-hidden />
            <span className="brand-name">{tenant.companyName}</span>
          </a>
          <a className="btn" href={studioHref(products[0]?.id ?? '')}>Open studio</a>
        </div>
      </header>
      <main className="cat-wrap">
        <section className="cat-hero">
          <div>
            <p className="cat-eyebrow">Garment catalog</p>
            <h1>Pick a blank. Design it in 3D.</h1>
            <p className="cat-lede">Every garment opens in the studio with its real print areas, so you see front, back and sleeve artwork on the shirt before you order.</p>
          </div>
          <dl className="cat-stats">
            <div><dt>Garments</dt><dd>{products.length}</dd></div>
            <div><dt>Print methods</dt><dd>{methodCount}</dd></div>
            <div><dt>Print areas</dt><dd>Up to {maxAreas}</dd></div>
            <div><dt>Colours</dt><dd>Up to {Math.max(...products.map((p) => p.colors.length))}</dd></div>
          </dl>
        </section>
        <div className="cat-bar">
          <div role="group" aria-label="Filter by category" className="cat-filters">
            {categories.map((c) => <button key={c} type="button" aria-pressed={c === cat} onClick={() => setCat(c)}>{c}</button>)}
          </div>
          <p aria-live="polite">{list.length} {list.length === 1 ? 'garment' : 'garments'}</p>
        </div>
        <div className="cat-grid">
          {list.map((p) => <Card key={p.id} catalog={catalog} product={p} currency={catalog.pricing.currency} locale={tenant.locale} />)}
        </div>
      </main>
      <footer className="cat-foot"><div className="cat-wrap">Prices per garment, before print add-ons and quantity.</div></footer>
    </div>
  )
}
