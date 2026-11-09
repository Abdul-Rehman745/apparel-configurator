import { useState } from 'react'
import { useMoney, usePrice, useResolved } from './hooks'
import { AreaPicker } from './Inspector'
import { Icon } from './icons'
import { setMode } from '../state/store'

export function ProductInfo() {
  const { product, model, material } = useResolved()
  const price = usePrice()
  const money = useMoney()
  const [areas, setAreas] = useState(false)
  return <aside className="inspector product-info" aria-label="Product information">
    <div className="info-heading"><div><h2>{product.title}</h2><p>{model.label} · {material.label}</p></div><strong>{money(price.unitPrice)}</strong></div>
    <div className="info-tabs" role="tablist" aria-label="Product details">
      <button role="tab" aria-selected={!areas} onClick={() => setAreas(false)}>Product Info</button>
      <button role="tab" aria-selected={areas} onClick={() => setAreas(true)}>Printing Areas</button>
    </div>
    {areas ? <div className="info-areas"><p>Select an area to start designing.</p><AreaPicker onSelect={() => setMode('design')} /></div> : <>
      <div className="info-specs">
        {[['material', 'Material', material.label], ['shirt', 'Fit', model.label], ['sizes', 'Sizes', `${product.sizes[0]?.label} – ${product.sizes.at(-1)?.label}`]].map(([icon, label, value]) => <div className="info-spec" key={label}><span><Icon name={icon} size={27} /></span><div><strong>{label}</strong><p>{value}</p></div></div>)}
      </div>
      <div className="fabric-card"><img src="/assets/fabric-cotton.png" alt="Soft white cotton jersey with fine woven texture" /><div><strong>Made for your everyday</strong><p>{material.description}</p></div></div>
      <div className="fabric-features">{[['breathable', 'Thoughtful detail'], ['durable', 'Made to last'], ['comfort', 'Comfort first']].map(([icon, label]) => <div key={icon}><span><Icon name={icon} size={26} /></span>{label}</div>)}</div>
      <p className="product-description">{product.description}</p>
    </>}
  </aside>
}
