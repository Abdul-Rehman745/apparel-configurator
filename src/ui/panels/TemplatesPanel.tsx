import { useStore } from '../../state/store'
import { applyTemplate } from '../../design-engine/templates'
import { hasArtwork } from '../../core/design'
import { Section } from '../common'
import { Icon } from '../icons'

export function TemplatesPanel() {
  const catalog = useStore((s) => s.catalog)
  const design = useStore((s) => s.design)
  const templates = catalog.templates.filter((t) => catalog.products.some((p) => p.id === t.productId && p.published))
  const apply = (id: string) => {
    const t = templates.find((x) => x.id === id)!
    const dirty = Object.values(design.areas).some(hasArtwork)
    if (dirty && !confirm(`Start from “${t.title}”? Your current artwork will be replaced (you can undo this).`)) return
    applyTemplate(t)
  }
  return (
    <div className="panel-scroll">
      <Section title="Start from a template">
        <div className="card-list">
          {templates.map((t) => {
            const p = catalog.products.find((x) => x.id === t.productId)!
            return (
              <button key={t.id} className={`tpl-card ${design.templateId === t.id ? 'is-active' : ''}`} onClick={() => apply(t.id)}>
                <span className="tpl-icon"><Icon name="layout" size={22} /></span>
                <span className="tpl-text"><strong>{t.title}</strong><span>{t.description}</span><em>{p.title}</em></span>
              </button>
            )
          })}
        </div>
      </Section>
    </div>
  )
}
