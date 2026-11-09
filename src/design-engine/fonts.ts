// Font loading. Only catalog fonts (licence recorded) are offered; uploads go through admin with a licence declaration.
import type { FontDef } from '../core/types'
import { assetUrl } from '../assets/assetStore'

const loaded = new Map<string, Promise<boolean>>()
let cssInjected = ''

/** One stylesheet request for all Google families; font files download lazily when first used. */
export function registerFonts(fonts: FontDef[]) {
  const google = fonts.filter((f) => f.source === 'google').map((f) => `family=${encodeURIComponent(f.family).replace(/%20/g, '+')}`)
  const href = `https://fonts.googleapis.com/css2?${google.join('&')}&display=swap`
  if (google.length && href !== cssInjected) {
    cssInjected = href
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = href
    document.head.appendChild(link)
  }
  for (const f of fonts) if (f.source === 'upload' && f.url && !loaded.has(f.family)) {
    loaded.set(f.family, (async () => {
      try {
        const url = await assetUrl(f.url!)
        if (!url) return false
        const face = new FontFace(f.family, `url(${url})`)
        document.fonts.add(await face.load())
        return true
      } catch { return false }
    })())
  }
}

/** Resolves true once the family is usable; false if it failed (caller falls back and warns). */
export function loadFont(family: string, timeoutMs = 6000): Promise<boolean> {
  const hit = loaded.get(family)
  if (hit) return hit
  const p = Promise.race([
    document.fonts.load(`48px "${family}"`, 'AaBb09').then((faces) => faces.length > 0).catch(() => false),
    new Promise<boolean>((r) => setTimeout(() => r(false), timeoutMs)),
  ])
  loaded.set(family, p)
  p.then((ok) => { if (!ok) loaded.delete(family) })
  return p
}
