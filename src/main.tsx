import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './ui/styles.css'
import { catalogApi, setDesignApi, setRemoteCatalog } from './api/designApi'
import { loadRemoteCatalog, saveRemoteCatalog, supabase, supabaseAssets, SupabaseDesignApi } from './api/supabase'
import { setRemoteAssets } from './assets/assetStore'
import { addAnalyticsSink, sinksLibrary } from './api/analytics'
import { applyTenantTheme, tenantFromLocation } from './tenants/tenants'
import { defaultDesign, initStore, useStore } from './state/store'
import { registerCustomClipart } from './assets/clipart'
import { fillChecker } from './design-engine/checker'
import { editor } from './design-engine/editor'
import { registerFonts } from './design-engine/fonts'
import { viewer, webglAvailable } from './3d/bridge'
import App from './ui/App'

const AdminApp = lazy(() => import('./admin/AdminApp'))
const CatalogPage = lazy(() => import('./ui/Catalog'))

async function boot() {
  const container = document.getElementById('root')! as HTMLElement & { __root?: ReturnType<typeof createRoot> }
  const root = (container.__root ??= createRoot(container)) // HMR re-runs boot(); reuse the root
  let tenant = tenantFromLocation()
  if (supabase) {
    // Hosted backend: shared designs, object storage for uploads, server-validated cart, per-tenant catalogs.
    const sb = supabase
    setDesignApi(new SupabaseDesignApi(sb, tenant.id))
    setRemoteAssets(supabaseAssets(sb, tenant.id))
    setRemoteCatalog({ load: (t) => loadRemoteCatalog(sb, t), save: (t, c) => saveRemoteCatalog(sb, t, c) })
    if (tenant.commerce.adapter === 'local') tenant = { ...tenant, commerce: { adapter: 'supabase' } }
  }
  applyTenantTheme(tenant)
  if (location.pathname.startsWith('/admin')) {
    root.render(<Suspense fallback={null}><AdminApp /></Suspense>)
    return
  }
  const catalog = await catalogApi.load(tenant).catch(() => catalogApi.seed(tenant))
  if (location.pathname.startsWith('/catalog')) {
    root.render(<Suspense fallback={null}><CatalogPage catalog={catalog} tenant={tenant} /></Suspense>)
    return
  }
  if (import.meta.env.DEV) addAnalyticsSink(sinksLibrary.console)
  addAnalyticsSink(sinksLibrary.dataLayer)
  addAnalyticsSink(sinksLibrary.postMessage)
  registerCustomClipart(catalog.customClipart)
  const params = new URLSearchParams(location.search)
  const product = catalog.products.find((p) => p.id === params.get('product'))
  initStore(catalog, tenant, product ? { ...defaultDesign(catalog, product.id), modelId: product.models.find((m) => m.id === params.get('model'))?.id ?? product.models[0].id } : undefined)
  registerFonts(catalog.fonts)
  if (!webglAvailable()) useStore.setState({ webgl: false, mode: 'precision' })
  editor.init(tenant.primary)
  ;(window as any).__configurator = { store: useStore, editor, viewer } // integration/e2e hook
  root.render(<StrictMode><App /></StrictMode>)
  const checker = params.get('checker')
  if (checker) setTimeout(() => fillChecker(checker), 600) // admin print-area test
}

boot()
