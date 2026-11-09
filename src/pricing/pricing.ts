// Data-driven pricing. React never computes prices; it renders this engine's output.
import type { AreaGroup, Id, PricingConfig, PricingRule } from '../core/types'

export interface PriceInput {
  productId: Id
  modelId: Id
  materialId: Id
  methodId: Id
  units: { sizeId: Id; qty: number; personalized: boolean }[]
  areas: { id: Id; group: AreaGroup; colorCount: number }[]
  premiumAssets: number
}

export interface PriceLine { ruleId: Id; label: string; unitAmount: number; qty: number; total: number; discountable: boolean }

export interface PriceResult {
  currency: string
  lines: PriceLine[]
  subtotal: number
  tier: { label: string; pctOff: number }
  discount: number
  total: number
  quantity: number
  unitPrice: number
}

const round = (n: number) => Math.round(n * 100) / 100

function matches(rule: PricingRule, input: PriceInput, sizeId?: Id, group?: AreaGroup): boolean {
  const w = rule.when
  if (!w) return true
  if (w.productIds && !w.productIds.includes(input.productId)) return false
  if (w.modelIds && !w.modelIds.includes(input.modelId)) return false
  if (w.materialIds && !w.materialIds.includes(input.materialId)) return false
  if (w.methodIds && !w.methodIds.includes(input.methodId)) return false
  if (w.sizeIds && (!sizeId || !w.sizeIds.includes(sizeId))) return false
  if (w.areaGroups && (!group || !w.areaGroups.includes(group))) return false
  return true
}

export function computePrice(cfg: PricingConfig, input: PriceInput): PriceResult {
  const quantity = input.units.reduce((s, u) => s + Math.max(0, u.qty), 0)
  const lines: PriceLine[] = []
  const push = (rule: PricingRule, qty: number, unitAmount = rule.amount, discountable = true) => {
    if (qty > 0 && unitAmount !== 0) lines.push({ ruleId: rule.id, label: rule.label, unitAmount, qty, total: round(unitAmount * qty), discountable })
  }
  const decorated = input.areas.length > 0

  for (const rule of cfg.rules) {
    switch (rule.per) {
      case 'unit': {
        // Size-dependent rules evaluate per ordered size; others once for the whole quantity.
        if (rule.when?.sizeIds) {
          const qty = input.units.filter((u) => matches(rule, input, u.sizeId)).reduce((s, u) => s + u.qty, 0)
          push(rule, qty)
        } else if (matches(rule, input)) push(rule, quantity)
        break
      }
      case 'area': {
        const n = input.areas.filter((a) => matches(rule, input, undefined, a.group)).length
        if (n) push(rule, quantity, rule.amount * n)
        break
      }
      case 'color': {
        const colors = input.areas.filter((a) => matches(rule, input, undefined, a.group)).reduce((s, a) => s + a.colorCount, 0)
        if (colors) push(rule, quantity, rule.amount * colors)
        break
      }
      case 'order':
        if (decorated && matches(rule, input) && quantity > 0) push(rule, 1, rule.amount, false)
        break
      case 'personalizedUnit':
        if (matches(rule, input)) push(rule, input.units.filter((u) => u.personalized).reduce((s, u) => s + u.qty, 0))
        break
      case 'premiumAsset':
        if (input.premiumAssets && matches(rule, input)) push(rule, quantity, rule.amount * input.premiumAssets)
        break
    }
  }

  const subtotal = round(lines.reduce((s, l) => s + l.total, 0))
  const tiers = [...cfg.tiers].sort((a, b) => a.minQty - b.minQty)
  const tier = tiers.filter((t) => quantity >= t.minQty).pop() ?? { label: '—', pctOff: 0 }
  const discountable = lines.filter((l) => l.discountable).reduce((s, l) => s + l.total, 0)
  const discount = round((discountable * tier.pctOff) / 100)
  const total = round(subtotal - discount)
  return { currency: cfg.currency, lines, subtotal, tier: { label: tier.label, pctOff: tier.pctOff }, discount, total, quantity, unitPrice: quantity ? round(total / quantity) : 0 }
}

export function formatMoney(amount: number, currency: string, locale = 'en-US') {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount)
}
