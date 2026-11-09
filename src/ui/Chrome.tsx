// Top bar, tool rail / bottom bar and the commerce footer.
import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { openDialog, redo, setMode, setQuantity, setSize, setTool, undo, useStore, type Tool } from '../state/store'
import { blocking } from '../validation/validate'
import { totalQty } from '../core/design'
import { IconButton } from './common'
import { Icon } from './icons'
import { useFeature, useIssues, useMoney, usePrice, useResolved } from './hooks'
import { saveDesign } from './flows'

export const TOOLS: { id: Tool; label: string; icon: string; flag?: Parameters<typeof useFeature>[0] }[] = [
  { id: 'product', label: 'Product', icon: 'shirt' },
  { id: 'designs', label: 'Design', icon: 'palette', flag: 'templates' },
  { id: 'text', label: 'Text', icon: 'text', flag: 'text' },
  { id: 'upload', label: 'Upload', icon: 'upload', flag: 'uploads' },
  { id: 'clipart', label: 'Graphics', icon: 'image', flag: 'clipart' },
  { id: 'shapes', label: 'Shapes', icon: 'shapes', flag: 'shapes' },
  { id: 'patterns', label: 'Patterns', icon: 'pattern', flag: 'patterns' },
  { id: 'layers', label: 'Layers', icon: 'layers' },
  { id: 'team', label: 'Team', icon: 'team', flag: 'bulk' },
]

export function useTools() {
  const features = useStore((s) => s.tenant.features)
  return TOOLS.filter((t) => !t.flag || features[t.flag] !== false)
}

export function TopBar() {
  const { tenant, canUndo, canRedo } = useStore(useShallow((s) => ({ tenant: s.tenant, canUndo: s.past.length > 0, canRedo: s.future.length > 0 })))
  const { product } = useResolved()
  const tool = useStore((s) => s.tool)
  const sharing = useFeature('sharing')
  const preview = useFeature('downloadPreview')
  const exportOk = useFeature('export')
  return (
    <header className="topbar">
      <div className="brand">
        <span className="logo" dangerouslySetInnerHTML={{ __html: tenant.logoSvg }} aria-hidden />
        <span className="brand-name">{tenant.companyName}<small>DESIGN YOUR STORY</small></span>
      </div>
      <h1 className="product-title">{product.title}</h1>
      <nav className="workflow" aria-label="Configuration steps">
        <button className={tool === 'product' ? 'is-on' : ''} onClick={() => { setTool('product'); setMode('view') }}><b>1</b> Product</button>
        <button className={tool && tool !== 'product' ? 'is-on' : ''} onClick={() => { setTool('text'); setMode('design') }}><b>2</b> Design</button>
        <button onClick={() => openDialog('review')}><b>3</b> Review</button>
      </nav>
      <div className="topbar-actions">
        <IconButton icon="undo" label="Undo (Ctrl+Z)" onClick={undo} disabled={!canUndo} />
        <IconButton icon="redo" label="Redo (Ctrl+Shift+Z)" onClick={redo} disabled={!canRedo} />
        <span className="divider" />
        <button className="btn btn-ghost hide-sm" onClick={() => saveDesign()}><Icon name="save" size={18} /> Save</button>
        {sharing && <button className="btn btn-ghost" onClick={() => openDialog('share')} aria-label="Share"><Icon name="share" size={18} /><span className="hide-sm"> Share</span></button>}
        <button className="btn btn-ghost hide-sm" onClick={() => openDialog('help')}><Icon name="help" size={20} /> Help</button>
        {preview && <IconButton icon="download" label="Download preview images" onClick={() => openDialog('preview')} className="hide-sm" />}
        {exportOk && <IconButton icon="file" label="Production files" onClick={() => openDialog('export')} className="hide-sm" />}
        <IconButton icon="cart" label="Cart" onClick={() => openDialog('cart')} />
        <button className="btn btn-primary header-cart hide-sm" onClick={() => openDialog('review')}><Icon name="cart" /> Add to cart</button>
      </div>
    </header>
  )
}

export function ToolRail() {
  const tool = useStore((s) => s.tool)
  const tools = useTools()
  return (
    <nav className="tool-rail" aria-label="Design tools">
      {tools.map((t) => (
        <button key={t.id} className={`tool ${tool === t.id ? 'is-on' : ''}`} aria-pressed={tool === t.id} onClick={() => setTool(tool === t.id ? null : t.id)}>
          <Icon name={t.icon} size={22} />
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  )
}

export function Footer() {
  const { design, catalog } = useStore(useShallow((s) => ({ design: s.design, catalog: s.catalog })))
  const { product } = useResolved()
  const price = usePrice()
  const money = useMoney()
  const issues = useIssues()
  const errors = blocking(issues)
  const warnings = issues.filter((i) => i.severity !== 'error' && i.id !== 'blank')
  const [showBreakdown, setShowBreakdown] = useState(false)
  const qty = totalQty(design)
  const nextTier = catalog.pricing.tiers.find((t) => t.minQty > qty)

  return (
    <footer className="footer" aria-label="Order summary">
      <div className="price-block">
        <button className="price" onClick={() => setShowBreakdown((v) => !v)} aria-expanded={showBreakdown} aria-controls="price-breakdown">
          <span className="total-label muted">Total</span>
          <strong>{money(price.total)}</strong>
          <span className="muted small">{qty > 1 ? `${money(price.unitPrice)} each` : 'incl. decoration'} <Icon name="info" size={14} /></span>
        </button>
        {showBreakdown && (
          <div className="breakdown" id="price-breakdown" role="region" aria-label="Price breakdown">
            <table>
              <tbody>
                {price.lines.map((l) => (
                  <tr key={l.ruleId + l.label}><td>{l.label}</td><td className="muted">{l.qty > 1 ? `${money(l.unitAmount)} × ${l.qty}` : ''}</td><td>{money(l.total)}</td></tr>
                ))}
                {price.discount > 0 && <tr className="discount"><td>Quantity discount ({price.tier.pctOff}%)</td><td /><td>−{money(price.discount)}</td></tr>}
                <tr className="total"><td>Total</td><td /><td>{money(price.total)}</td></tr>
              </tbody>
            </table>
            {nextTier && <p className="muted small">Order {nextTier.minQty - qty} more to save {nextTier.pctOff}%.</p>}
          </div>
        )}
      </div>

      <button className="order-options link" onClick={() => setTool(design.bulk.enabled ? 'team' : 'product')}>{qty} {qty === 1 ? 'item' : 'items'}{!design.bulk.enabled && ` · Size ${design.sizeId}`} · Edit</button>

      {design.bulk.enabled ? (
        <button className="btn btn-ghost team-qty" onClick={() => setTool('team')}><Icon name="team" size={18} /> {qty} pcs · team list</button>
      ) : (
        <div className="qty-size">
          <label className="mini-field">
            <span>Size</span>
            <select value={design.sizeId} onChange={(e) => setSize(e.target.value)} aria-label="Size">
              {product.sizes.map((s) => <option key={s.id} value={s.id} disabled={s.inStock === false}>{s.label}</option>)}
            </select>
          </label>
          <button className="link hide-sm" onClick={() => openDialog('size')}>Size guide</button>
          <div className="stepper" role="group" aria-label="Quantity">
            <IconButton icon="minus" label="Decrease quantity" onClick={() => setQuantity(design.quantity - 1)} disabled={design.quantity <= 1} size={16} />
            <input value={design.quantity} inputMode="numeric" aria-label="Quantity" onChange={(e) => setQuantity(+e.target.value.replace(/\D/g, '') || 1)} />
            <IconButton icon="plus" label="Increase quantity" onClick={() => setQuantity(design.quantity + 1)} size={16} />
          </div>
        </div>
      )}

      <div className="checkout">
        {(errors.length > 0 || warnings.length > 0) && (
          <button className={`issues-btn ${errors.length ? 'is-error' : 'is-warn'}`} onClick={() => openDialog('review')}>
            <Icon name="alert" size={16} /> {errors.length ? `${errors.length} to fix` : `${warnings.length} note${warnings.length > 1 ? 's' : ''}`}
          </button>
        )}
        <button className="btn btn-primary btn-cta" onClick={() => openDialog('review')}>
          <Icon name="cart" size={18} /> Add to cart
        </button>
      </div>
    </footer>
  )
}
