import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Icon } from './icons'

export function IconButton({ icon, label, onClick, disabled, active, className = '', size = 20 }: { icon: string; label: string; onClick?: () => void; disabled?: boolean; active?: boolean; className?: string; size?: number }) {
  return (
    <button type="button" className={`icon-btn ${active ? 'is-active' : ''} ${className}`} onClick={onClick} disabled={disabled} aria-label={label} aria-pressed={active} title={label}>
      <Icon name={icon} size={size} />
    </button>
  )
}

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="section">
      <header className="section-head"><h3>{title}</h3>{aside}</header>
      {children}
    </section>
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  )
}

export function Slider({ label, value, min, max, step = 1, onChange, unit = '', format }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; unit?: string; format?: (v: number) => string }) {
  return (
    <label className="slider">
      <span className="slider-top"><span>{label}</span><output>{format ? format(value) : `${Math.round(value * 100) / 100}${unit}`}</output></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} />
    </label>
  )
}

/** Numeric input that commits on blur/Enter (no store churn per keystroke). */
export function NumberInput({ value, onCommit, step = 0.1, min, max, suffix, label }: { value: number; onCommit: (v: number) => void; step?: number; min?: number; max?: number; suffix?: string; label: string }) {
  const [txt, setTxt] = useState(fmt(value))
  useEffect(() => setTxt(fmt(value)), [value])
  const commit = () => {
    const v = parseFloat(txt)
    if (Number.isFinite(v)) onCommit(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v)))
    else setTxt(fmt(value))
  }
  return (
    <span className="num">
      <input aria-label={label} inputMode="decimal" value={txt} step={step} onChange={(e) => setTxt(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') { commit(); (e.target as HTMLInputElement).blur() } }} />
      {suffix && <span className="num-suffix">{suffix}</span>}
    </span>
  )
}
const fmt = (v: number) => String(Math.round(v * 100) / 100)

export function Swatches({ colors, value, onChange, allowCustom = true, label }: { colors: { hex: string; name?: string }[]; value: string; onChange: (hex: string) => void; allowCustom?: boolean; label: string }) {
  return (
    <div className="swatches" role="radiogroup" aria-label={label}>
      {colors.map((c) => (
        <button key={c.hex + c.name} type="button" role="radio" aria-checked={value.toLowerCase() === c.hex.toLowerCase()} className="swatch" style={{ background: c.hex }} title={c.name ?? c.hex} aria-label={c.name ?? c.hex} onClick={() => onChange(c.hex)}>
          {value.toLowerCase() === c.hex.toLowerCase() && <Icon name="check" size={14} />}
        </button>
      ))}
      {allowCustom && (
        <label className="swatch swatch-custom" title="Custom colour">
          <input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'} onChange={(e) => onChange(e.target.value)} aria-label="Custom colour" />
          <Icon name="plus" size={14} />
        </label>
      )}
    </div>
  )
}

export function Segmented<T extends string>({ options, value, onChange, label }: { options: { value: T; label: ReactNode; title?: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} className={o.value === value ? 'is-on' : ''} onClick={() => onChange(o.value)} title={o.title}>{o.label}</button>
      ))}
    </div>
  )
}

/** Accessible modal dialog: focus trap, Escape to close, focus restore. */
export function Dialog({ title, onClose, children, wide, footer, side }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; footer?: ReactNode; side?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const id = useId()
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    const el = ref.current!
    const focusables = () => [...el.querySelectorAll<HTMLElement>('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter((x) => !x.hasAttribute('disabled'))
    focusables()[0]?.focus()
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose() }
      if (e.key === 'Tab') {
        const f = focusables()
        if (!f.length) return
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus() }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus() }
      }
    }
    el.addEventListener('keydown', key)
    return () => { el.removeEventListener('keydown', key); prev?.focus?.() }
  }, [onClose])
  return (
    <div className={`dialog-backdrop ${side ? 'is-side' : ''}`} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={`dialog ${wide ? 'is-wide' : ''} ${side ? 'is-side' : ''}`} role="dialog" aria-modal="true" aria-labelledby={id}>
        <header className="dialog-head">
          <h2 id={id}>{title}</h2>
          <IconButton icon="close" label="Close" onClick={onClose} />
        </header>
        <div className="dialog-body">{children}</div>
        {footer && <footer className="dialog-foot">{footer}</footer>}
      </div>
    </div>
  )
}

export function Empty({ icon, title, children }: { icon: string; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <Icon name={icon} size={28} />
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  )
}
