// Tenant/brand configurations. A deployment normally serves this from its API; these
// two seed brands demonstrate that the same build renders fully different storefronts.
import type { FeatureFlag, Tenant } from '../core/types'

const ALL_ON: Record<FeatureFlag, boolean> = {
  viewer3d: true, editor2d: true, uploads: true, text: true, clipart: true, shapes: true, patterns: true, embroidery: true,
  sharing: true, bulk: true, templates: true, premiumAssets: true, downloadPreview: true, export: true,
}

const mark = (fill: string, letter: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="${fill}"/><text x="16" y="22" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="700" font-size="17" fill="#fff">${letter}</text></svg>`

export const TENANTS: Tenant[] = [
  {
    id: 'default', companyName: 'Threadline Studio', logoSvg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><path fill="#20242c" d="M7 5h34a7 7 0 0 1 0 14H31v23a6 6 0 0 1-12 0V19H7A7 7 0 0 1 7 5Z"/><path fill="#fff" d="M24 11h12v3h-4v4h-4v-4h-4z"/></svg>', primary: '#1b1b1f', primaryText: '#ffffff', accent: '#1684ff',
    font: '"Inter", system-ui, -apple-system, "Segoe UI", sans-serif', radius: 10, currency: 'USD', locale: 'en-US', features: ALL_ON,
    commerce: { adapter: 'local' },
  },
  {
    id: 'brand-b', companyName: 'Northfield Teamwear', logoSvg: mark('#0e5a43', 'N'), primary: '#0e5a43', primaryText: '#ffffff', accent: '#e2a927',
    font: '"Archivo", system-ui, sans-serif', radius: 4, currency: 'GBP', locale: 'en-GB',
    features: { ...ALL_ON, patterns: false, premiumAssets: false, uploads: true },
    commerce: { adapter: 'local' },
  },
]

export function tenantFromLocation(): Tenant {
  const id = new URLSearchParams(location.search).get('tenant') ?? (window as any).__CONFIGURATOR__?.tenant
  return TENANTS.find((t) => t.id === id) ?? TENANTS[0]
}

export function applyTenantTheme(t: Tenant) {
  document.documentElement.dataset.theme = 'light'
  const r = document.documentElement.style
  r.setProperty('--c-primary', t.primary)
  r.setProperty('--c-on-primary', t.primaryText)
  r.setProperty('--c-accent', t.accent)
  r.setProperty('--radius', `${t.radius}px`)
  r.setProperty('--font-ui', t.font)
  document.title = `Customise · ${t.companyName}`
  const icon = document.querySelector<HTMLLinkElement>('link[rel=icon]') ?? Object.assign(document.createElement('link'), { rel: 'icon' })
  icon.href = 'data:image/svg+xml,' + encodeURIComponent(t.logoSvg)
  document.head.appendChild(icon)
}
