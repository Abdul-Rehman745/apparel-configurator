import { useShallow } from 'zustand/react/shallow'
import { useStore, setProduct, setModel, setColor, setMaterial, setMethod, setSize, setQuantity, openDialog, type Quality } from '../../state/store'
import { Field, Section, Segmented, Swatches, IconButton } from '../common'
import { Icon } from '../icons'
import { useResolved } from '../hooks'

export function ProductPanel() {
  const { catalog, design, quality } = useStore(useShallow((s) => ({ catalog: s.catalog, design: s.design, quality: s.quality })))
  const { product, model, material, method } = useResolved()
  const published = catalog.products.filter((p) => p.published)
  const zones = product.multiZoneColors ? model.colorZones : [{ id: 'body', label: 'Color' }]
  return <div className="panel-scroll product-panel">
    <p className="product-intro">Choose your next favorite.</p>
    <div className="garment-types" role="radiogroup" aria-label="Garment type">
      {published.filter(p => ['tshirt', 'polo', 'hoodie', 'sweatshirt'].includes(p.id)).map(p => <button key={p.id} role="radio" aria-checked={product.id === p.id} onClick={() => setProduct(p.id)}><img src={`/assets/icons/garment-${p.id}.png`} srcSet={`/assets/icons/garment-${p.id}@2x.png 2x, /assets/icons/garment-${p.id}@3x.png 3x`} alt="" /><span>{p.id === 'tshirt' ? 'T-Shirt' : p.models[0].label}</span></button>)}
    </div>
    <Section title="Model">
      <Field label="Garment"><select value={product.id} onChange={e => setProduct(e.target.value)}>{published.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select></Field>
      <div className="model-grid" role="radiogroup" aria-label="Garment model">
        {product.models.map(m => {
          const image = ({ 'basic-tee': 'classic', 'premium-tee': 'premium', 'oversized-tee': 'oversize' } as Record<string, string>)[m.id]
          return <button key={m.id} role="radio" aria-checked={model.id === m.id} onClick={() => setModel(m.id)}>{image ? <img src={`/assets/model-${image}.png`} alt="" /> : <Icon name="shirt" size={56} />}<span>{m.label}</span></button>
        })}
      </div>
    </Section>
    <Section title="Fabric"><select aria-label="Fabric" value={material.id} onChange={e => setMaterial(e.target.value)}>{product.materials.map(id => catalog.materials.find(m => m.id === id)!).filter(Boolean).map(m => <option key={m.id} value={m.id}>{m.label}</option>)}</select></Section>
    <Section title="Color">{zones.map(z => {
      const cur = product.colors.find(c => c.id === (design.colors[z.id] ?? design.colors.body))
      return <Field key={z.id} label={`${z.label} — ${cur?.name ?? ''}`}><Swatches label={`${z.label} colour`} allowCustom={false} value={cur?.hex ?? ''} colors={product.colors.map(c => ({ hex: c.hex, name: c.name }))} onChange={hex => setColor(z.id, product.colors.find(c => c.hex === hex)!.id)} /></Field>
    })}</Section>
    <Section title="Size" aside={<button className="link" onClick={() => openDialog('size')}>Size guide</button>}><div className="size-grid" role="radiogroup" aria-label="Size">{product.sizes.map(s => <button key={s.id} role="radio" aria-checked={design.sizeId === s.id} disabled={s.inStock === false} className="size-chip" onClick={() => setSize(s.id)}>{s.label}</button>)}</div></Section>
    {!design.bulk.enabled && <Section title="Quantity"><div className="stepper product-quantity"><IconButton icon="minus" label="Decrease product quantity" disabled={design.quantity <= 1} onClick={() => setQuantity(design.quantity - 1)} /><input aria-label="Product quantity" inputMode="numeric" value={design.quantity} onChange={e => setQuantity(+e.target.value.replace(/\D/g, '') || 1)} /><IconButton icon="plus" label="Increase product quantity" onClick={() => setQuantity(design.quantity + 1)} /></div></Section>}
    <details className="production-options"><summary>Print & preview settings</summary>
      <Section title="Print method"><div className="choice-list" role="radiogroup" aria-label="Print method">{product.printMethods.map(id => catalog.printMethods.find(m => m.id === id)!).filter(Boolean).map(m => <button key={m.id} role="radio" aria-checked={method.id === m.id} className="choice" onClick={() => setMethod(m.id)}><strong>{m.label}</strong><span>{m.description}</span>{m.materials && !m.materials.includes(material.id) && <span className="choice-warn">Not available on {material.label}</span>}</button>)}</div></Section>
      <Section title="3D quality"><Segmented<Quality> label="3D quality" value={quality} onChange={q => useStore.setState({ quality: q })} options={[{value:'low',label:'Low'},{value:'medium',label:'Medium'},{value:'high',label:'High'}]} /></Section>
    </details>
  </div>
}
