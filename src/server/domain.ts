// Pure domain logic shared with the server (bundled into supabase/functions/_shared/domain.js).
// Must stay free of DOM, Fabric and Three imports.
export { validateDesign, blocking, needsApproval } from '../validation/validate'
export { computePrice } from '../pricing/pricing'
export { priceInput } from '../pricing/priceInput'
export { deserializeDesign, DesignLoadError } from '../state/serialize'
export { defaultCatalog } from '../products/defaultCatalog'
export { sniff } from '../assets/sniff'
export { resolve } from '../products/lookup'
export { totalQty } from '../core/design'
