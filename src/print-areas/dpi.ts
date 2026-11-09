import { DESIGN_PPI } from '../core/design'
import type { PrintMethod } from '../core/types'

/** effective DPI = source pixels / printed inches. `sizeScale` accounts for print size scaling with garment size. */
export function effectiveDpi(naturalPx: number, displayUnits: number, sizeScale = 1): number {
  const inches = (displayUnits / DESIGN_PPI) * sizeScale
  return inches > 0 ? naturalPx / inches : Infinity
}

export function imageDpi(img: { naturalW: number; naturalH: number; displayW: number; displayH: number }, sizeScale = 1): number {
  return Math.min(effectiveDpi(img.naturalW, img.displayW, sizeScale), effectiveDpi(img.naturalH, img.displayH, sizeScale))
}

export type DpiRating = 'good' | 'acceptable' | 'low' | 'n/a'

export function rateDpi(dpi: number, method: Pick<PrintMethod, 'minDpi' | 'goodDpi'>): DpiRating {
  if (!method.goodDpi) return 'n/a'
  if (dpi >= method.goodDpi) return 'good'
  if (dpi >= method.minDpi) return 'acceptable'
  return 'low'
}

/** Largest printed width (inches) at which an image still meets `dpi`. */
export const maxPrintInches = (naturalPx: number, dpi: number) => naturalPx / dpi
