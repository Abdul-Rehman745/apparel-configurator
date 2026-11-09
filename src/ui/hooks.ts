import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { FeatureFlag } from '../core/types'
import { resolve } from '../products/lookup'
import { computePrice } from '../pricing/pricing'
import { priceInput } from '../pricing/priceInput'
import { useStore } from '../state/store'
import { validateDesign } from '../validation/validate'
import { editor } from '../design-engine/editor'

export function useResolved() {
  const { catalog, design } = useStore(useShallow((s) => ({ catalog: s.catalog, design: s.design })))
  return useMemo(() => resolve(catalog, design), [catalog, design])
}

export function useIssues() {
  const { catalog, design, missing } = useStore(useShallow((s) => ({ catalog: s.catalog, design: s.design, missing: s.missingAssets })))
  return useMemo(() => {
    const knownFonts = new Set(catalog.fonts.map((f) => f.family))
    return validateDesign(catalog, design, { missingAssets: new Set(missing), knownFonts })
  }, [catalog, design, missing])
}

export function usePrice() {
  const { catalog, design } = useStore(useShallow((s) => ({ catalog: s.catalog, design: s.design })))
  return useMemo(() => computePrice(catalog.pricing, priceInput(catalog, design)), [catalog, design])
}

export const useFeature = (f: FeatureFlag) => useStore((s) => s.tenant.features[f] !== false)

/** Live Fabric selection; re-evaluated whenever the editor reports a change. */
export function useActiveObject() {
  const rev = useStore((s) => s.editorRev)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => ({ obj: editor.canvas?.getActiveObject() as any, all: editor.canvas?.getActiveObjects() ?? [], rev }), [rev])
}

export function useMoney() {
  const t = useStore((s) => s.tenant)
  const currency = useStore((s) => s.catalog.pricing.currency)
  return useMemo(() => {
    const f = new Intl.NumberFormat(t.locale, { style: 'currency', currency })
    return (n: number) => f.format(n)
  }, [t.locale, currency])
}

export const isMobile = () => matchMedia('(max-width: 1100px)').matches
