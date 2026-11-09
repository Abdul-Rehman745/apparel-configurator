import { useEffect, useMemo, useState } from 'react'
import qrcode from 'qrcode-generator'
import { openDialog, setActiveArea, setTool, toast, useStore } from '../state/store'
import { commerceFor } from '../api/commerce'
import { supabase } from '../api/supabase'
import type { ConfigurationResult } from '../export/result'
import { track } from '../api/analytics'
import { blocking, needsApproval } from '../validation/validate'
import { totalQty } from '../core/design'
import { editor } from '../design-engine/editor'
import { Dialog, Segmented } from './common'
import { Icon } from './icons'
import { useIssues, useMoney, usePrice, useResolved } from './hooks'
import { addToCart, downloadPreviews, exportProduction, saveDesign, startNew } from './flows'

function ShareDialog() {
  const configId = useStore((s) => s.configurationId)
  const [id, setId] = useState(configId)
  useEffect(() => { if (!id) saveDesign().then(setId) }, [id])
  const url = id ? `${location.origin}/design/${id}${location.search}` : ''
  const qr = (() => {
    if (!url) return ''
    const q = qrcode(0, 'M'); q.addData(url); q.make()
    return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true })
  })()
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); toast('Link copied', 'success'); track('design_shared', { configurationId: id }) } catch { toast('Copy failed — select the link and copy it manually.', 'error') }
  }
  return (
    <Dialog title="Share your design" onClose={() => openDialog(null)}>
      {!id ? <p><span className="spinner" /> Saving…</p> : (
        <div className="share">
          <div className="qr" aria-label="QR code for design link" dangerouslySetInnerHTML={{ __html: qr }} />
          <div>
            <p className="small muted">Design ID</p>
            <p className="config-id">{id}</p>
            <div className="row"><input readOnly value={url} aria-label="Share link" onFocus={(e) => e.target.select()} /><button className="btn btn-primary" onClick={copy}>Copy</button></div>
            <p className="muted small">The link restores garment, colours, artwork, text and pricing{supabase ? ' on any device.' : ' — this offline build stores designs on this device only.'}</p>
            <button className="link" onClick={startNew}>Start a new design</button>
          </div>
        </div>
      )}
    </Dialog>
  )
}

function SizeGuide() {
  const { product, size } = useResolved()
  const [unit, setUnit] = useState<'in' | 'cm'>('in')
  const f = (v?: number) => (v === undefined ? '—' : unit === 'in' ? v.toFixed(1) : (v * 2.54).toFixed(0))
  return (
    <Dialog title={`Size guide · ${product.title}`} onClose={() => openDialog(null)} wide>
      <div className="size-guide">
        <svg viewBox="0 0 200 180" className="size-diagram" role="img" aria-label="Measurement diagram: chest across, length from shoulder to hem, sleeve from shoulder seam">
          <path d="M70 20 L40 32 L18 70 L38 80 L52 58 L52 165 L148 165 L148 58 L162 80 L182 70 L160 32 L130 20 C124 32 76 32 70 20Z" fill="var(--c-surface-2)" stroke="var(--c-muted)" />
          <path d="M54 70 H146" stroke="var(--c-accent)" strokeWidth="2" markerEnd="url(#a)" markerStart="url(#a)" /><text x="100" y="66" textAnchor="middle" fontSize="10" fill="var(--c-text)">A · Chest</text>
          <path d="M100 26 V163" stroke="#d9a400" strokeWidth="2" strokeDasharray="4 3" /><text x="104" y="120" fontSize="10" fill="var(--c-text)">B · Length</text>
          <path d="M160 34 L180 68" stroke="#2e9f5a" strokeWidth="2" /><text x="150" y="98" fontSize="10" fill="var(--c-text)">C · Sleeve</text>
          <defs><marker id="a" viewBox="0 0 6 6" refX="3" refY="3" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L6 3L0 6z" fill="var(--c-accent)" /></marker></defs>
        </svg>
        <div>
          <Segmented label="Units" value={unit} onChange={setUnit} options={[{ value: 'in', label: 'Inches' }, { value: 'cm', label: 'cm' }]} />
          <div className="table-wrap">
            <table className="size-table">
              <thead><tr><th>Size</th><th>A · Chest</th><th>B · Length</th><th>C · Sleeve</th></tr></thead>
              <tbody>{product.sizes.map((s) => <tr key={s.id} className={s.id === size.id ? 'is-on' : ''}><th>{s.label}</th><td>{f(s.chestIn)}</td><td>{f(s.lengthIn)}</td><td>{f(s.sleeveIn)}</td></tr>)}</tbody>
            </table>
          </div>
          <p className="muted small">Chest is measured flat, pit to pit. Garment measurements; allow ±0.5" tolerance.</p>
        </div>
      </div>
    </Dialog>
  )
}

function ReviewDialog() {
  const issues = useIssues()
  const price = usePrice()
  const money = useMoney()
  const design = useStore((s) => s.design)
  const { product, model, method, material, size } = useResolved()
  const [busy, setBusy] = useState(false)
  const errors = blocking(issues)
  const others = issues.filter((i) => i.severity !== 'error')
  const jump = (areaId?: string, objectId?: string) => {
    openDialog(null)
    if (areaId) { setActiveArea(areaId); if (objectId) setTimeout(() => editor.select([objectId]), 400) }
    else if (/bulk|team/i.test(issues.find((i) => i.areaId === areaId)?.id ?? '')) setTool('team')
  }
  const go = async () => { setBusy(true); track('checkout_started', {}); const ok = await addToCart(); setBusy(false); if (ok) openDialog('cart') }
  return (
    <Dialog title="Review before adding to cart" onClose={() => openDialog(null)} wide
      footer={<>
        <button className="btn" onClick={() => openDialog(null)}>Keep editing</button>
        <button className="btn btn-primary" disabled={errors.length > 0 || busy} onClick={go}>{busy ? 'Adding…' : `Add to cart · ${money(price.total)}`}</button>
      </>}>
      <div className="review">
        <dl className="specs">
          <dt>Garment</dt><dd>{product.title} · {model.label}</dd>
          <dt>Colour</dt><dd>{Object.entries(design.colors).map(([z, c]) => `${product.multiZoneColors ? z + ': ' : ''}${product.colors.find((x) => x.id === c)?.name ?? c}`).join(', ')}</dd>
          <dt>Fabric</dt><dd>{material.label}</dd>
          <dt>Print</dt><dd>{method.label} · {model.printAreas.filter((a) => design.areas[a.id]?.objects.some((o) => o.visible)).map((a) => a.label).join(', ') || 'blank'}</dd>
          <dt>Size / qty</dt><dd>{design.bulk.enabled ? `${totalQty(design)} pcs (team list)` : `${size.label} × ${design.quantity}`}</dd>
        </dl>
        {errors.length > 0 && <h3 className="error-text"><Icon name="alert" size={18} /> Fix before ordering</h3>}
        <ul className="issue-list">
          {errors.map((i) => <li key={i.id} className="issue issue-error"><Icon name="alert" size={16} /><span>{i.message}</span>{i.areaId && <button className="link" onClick={() => jump(i.areaId, i.objectId)}>Show</button>}</li>)}
        </ul>
        {others.length > 0 && <h3>Notes</h3>}
        <ul className="issue-list">
          {others.map((i) => <li key={i.id} className={`issue issue-${i.severity}`}><Icon name="info" size={16} /><span>{i.message}</span>{i.areaId && <button className="link" onClick={() => jump(i.areaId, i.objectId)}>Show</button>}</li>)}
        </ul>
        {needsApproval(issues) && <p className="muted small">This order will be checked by our production team before printing.</p>}
        {!issues.length && <p className="ok-text"><Icon name="check" size={18} /> Everything looks print-ready.</p>}
      </div>
    </Dialog>
  )
}

function CartDrawer() {
  const [items, setItems] = useState<(ConfigurationResult & { cartItemId?: string; serverTotal?: number })[] | null>(null)
  const money = useMoney()
  const tenant = useStore((s) => s.tenant)
  const cart = useMemo(() => commerceFor(tenant), [tenant])
  const adapter = cart.name
  const refresh = () => (cart.items ? cart.items() : Promise.resolve([])).then(setItems).catch(() => setItems([]))
  useEffect(() => { refresh() }, [cart])
  // Server-priced carts show the server's total, never the browser's.
  const total = (items ?? []).reduce((s, i) => s + (i.serverTotal ?? i.pricingSnapshot.total), 0)
  return (
    <Dialog title="Cart" onClose={() => openDialog(null)} side footer={items?.length ? <><strong>{money(total)}</strong><button className="btn btn-primary" onClick={() => { track('checkout_started', { items: items.length }); toast('Checkout is handled by the store’s e-commerce platform (demo cart).') }}>Checkout</button></> : undefined}>
      {adapter !== 'local' && adapter !== 'supabase' && <p className="muted small">Items are sent to the store’s cart.</p>}
      {items === null ? <p>Loading…</p> : !items.length ? <p className="muted">Your cart is empty.</p> : (
        <ul className="cart-list">
          {items.map((i) => (
            <li key={i.configurationId + i.createdAt} className="cart-item">
              {i.previews.front && <img src={i.previews.front} alt="" />}
              <div>
                <strong>{i.product.title}</strong>
                <span className="muted small">{i.quantity} pcs · {i.configurationId}</span>
                <span className="muted small">{i.productionJob.status === 'requires_approval' ? 'Needs production review' : 'Ready for production'}</span>
              </div>
              <span>{money(i.serverTotal ?? i.pricingSnapshot.total)}</span>
              <button className="link" onClick={async () => { await cart.remove?.(i.cartItemId ?? i.configurationId); refresh() }}>Remove</button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  )
}

function PreviewDialog() {
  const [bg, setBg] = useState<'transparent' | 'studio'>('studio')
  const [busy, setBusy] = useState(false)
  return (
    <Dialog title="Download preview images" onClose={() => openDialog(null)}
      footer={<button className="btn btn-primary" disabled={busy} onClick={async () => { setBusy(true); await downloadPreviews(bg); setBusy(false) }}>{busy ? 'Rendering…' : 'Download 5 images'}</button>}>
      <p>Front, back, left, right and perspective views as PNG.</p>
      <Segmented label="Background" value={bg} onChange={setBg} options={[{ value: 'studio', label: 'Studio' }, { value: 'transparent', label: 'Transparent' }]} />
      <p className="muted small">Previews are for sharing and approval. Printing uses separate high-resolution production files.</p>
    </Dialog>
  )
}

function ExportDialog() {
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const run = async () => {
    setBusy(true)
    try { const id = await exportProduction(setMsg); setMsg(`Downloaded ${id}.zip`) } catch (e) { setMsg(`Export failed: ${(e as Error).message}`) } finally { setBusy(false) }
  }
  return (
    <Dialog title="Production package" onClose={() => openDialog(null)} footer={<button className="btn btn-primary" onClick={run} disabled={busy}>{busy ? 'Building…' : 'Build & download ZIP'}</button>}>
      <p>Generates print-ready files for every decorated area at production DPI, SVG vectors, the design JSON, original uploads, previews and <code>manifest.json</code>.</p>
      <p className="muted small">Operators normally receive this automatically with the order; it’s exposed here for integration testing.</p>
      {msg && <p role="status">{busy && <span className="spinner" />} {msg}</p>}
    </Dialog>
  )
}

export function Dialogs() {
  const d = useStore((s) => s.dialog)
  if (d === 'help') return <Dialog title="Design your shirt" onClose={() => openDialog(null)}>
    <ol className="help-steps">
      <li><strong>Choose your product.</strong> Pick a fit, fabric, color, size and quantity.</li>
      <li><strong>Make it yours.</strong> Use Text, Upload or Graphics. Select a print area to decorate the front, back or sleeves.</li>
      <li><strong>Fine-tune your artwork.</strong> Open 2D Design to move, resize and rotate it. Drag the 3D garment to look around; scroll to zoom.</li>
      <li><strong>Review your order.</strong> Add to cart checks print quality and shows any fixes needed before ordering.</li>
    </ol>
    <p className="muted small">Undo: Ctrl/⌘ + Z · Redo: Ctrl/⌘ + Shift + Z · Delete: Backspace or Delete</p>
  </Dialog>
  if (d === 'share') return <ShareDialog />
  if (d === 'size') return <SizeGuide />
  if (d === 'review') return <ReviewDialog />
  if (d === 'cart') return <CartDrawer />
  if (d === 'preview') return <PreviewDialog />
  if (d === 'export') return <ExportDialog />
  return null
}

export function Toasts() {
  const toasts = useStore((s) => s.toasts)
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => <div key={t.id} className={`toast toast-${t.kind}`}><Icon name={t.kind === 'error' ? 'alert' : t.kind === 'success' ? 'check' : 'info'} size={16} />{t.text}</div>)}
    </div>
  )
}
