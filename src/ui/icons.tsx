import { Shirt, Palette, Image, Square, Grid2X2, Layers, Save, Share2, ShoppingCart, CircleHelp, Maximize2, MoveDiagonal, Wind, ShieldCheck, StretchHorizontal, Lightbulb, Hd, ChevronLeft, ChevronRight, Scan, type LucideIcon } from 'lucide-react'
const library: Record<string, LucideIcon> = { shirt: Shirt, palette: Palette, image: Image, shapes: Square, layout: Grid2X2, layers: Layers, save: Save, share: Share2, cart: ShoppingCart, help: CircleHelp, expand: Maximize2, material: Scan, sizes: MoveDiagonal, breathable: Wind, durable: ShieldCheck, comfort: StretchHorizontal, light: Lightbulb, hd: Hd, left: ChevronLeft, right: ChevronRight }
// Existing editor-specific icons remain compatible with their callers.
const P: Record<string, string> = {
  shirt: 'M8 3l-5 3 2 5 3-1v11h8V10l3 1 2-5-5-3c-.5 1.7-2 3-4 3S8.5 4.7 8 3z',
  layout: 'M4 4h16v16H4zM4 10h16M10 10v10',
  text: 'M5 6V4h14v2M12 4v16M9 20h6',
  upload: 'M12 16V4M7 9l5-5 5 5M4 16v4h16v-4',
  sticker: 'M12 3l2.6 5.6L20 9.3l-4 4 1 5.7-5-2.8-5 2.8 1-5.7-4-4 5.4-.7z',
  shapes: 'M4 14h7v7H4zM17.5 3l4 7h-8zM17.5 14a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7z',
  pattern: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5',
  team: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2 20c0-3.5 3-6 7-6s7 2.5 7 6M17 11a3 3 0 1 0-1-5.8M22 20c0-3-2-5-5-5.5',
  undo: 'M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
  redo: 'M15 14l5-5-5-5M20 9H9a5 5 0 0 0 0 10h3',
  save: 'M5 3h11l4 4v14H4V3zM8 3v5h7V3M7 13h10v8H7z',
  share: 'M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.6 13.5l6.8 4M15.4 6.5l-6.8 4',
  download: 'M12 4v12M7 11l5 5 5-5M4 20h16',
  cart: 'M3 4h2l2.5 11h11L21 7H6.3M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM18 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  close: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12l5 5 9-10',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  eyeOff: 'M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
  unlock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 7.5-2',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  up: 'M12 19V5M6 11l6-6 6 6',
  down: 'M12 5v14M6 13l6 6 6-6',
  front: 'M4 8h12v12H4zM8 4h12v12',
  back: 'M8 4h12v12H8zM4 8h12v12H4z',
  flipH: 'M12 3v18M8 7l-5 5 5 5V7zM16 7l5 5-5 5V7z',
  flipV: 'M3 12h18M7 8l5-5 5 5H7zM7 16l5 5 5-5H7z',
  alignL: 'M4 3v18M8 7h10v4H8zM8 14h6v4H8z',
  alignCH: 'M12 3v18M6 7h12v4H6zM8 14h8v4H8z',
  alignR: 'M20 3v18M6 7h10v4H6zM10 14h6v4h-6z',
  alignT: 'M3 4h18M7 8v10h4V8zM14 8v6h4V8z',
  alignCV: 'M3 12h18M7 6v12h4V6zM14 8v8h4V8z',
  alignB: 'M3 20h18M7 6v10h4V6zM14 10v6h4v-6z',
  distH: 'M4 3v18M20 3v18M10 8h4v8h-4z',
  distV: 'M3 4h18M3 20h18M8 10h8v4H8z',
  group: 'M3 3h7v7H3zM14 14h7v7h-7zM7 10v4a3 3 0 0 0 3 3h4',
  ungroup: 'M3 3h7v7H3zM14 14h7v7h-7z',
  rotate: 'M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5',
  zoomIn: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5M11 8v6M8 11h6',
  zoomOut: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5M8 11h6',
  expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  reset: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5',
  cube: 'M12 2l9 5v10l-9 5-9-5V7zM3 7l9 5 9-5M12 12v10',
  hand: 'M8 13V5a1.5 1.5 0 0 1 3 0v6M11 11V3.5a1.5 1.5 0 0 1 3 0V11M14 11V5a1.5 1.5 0 0 1 3 0v8c0 4-3 8-7 8-3 0-4.5-1.5-6-4l-2-3.5a1.5 1.5 0 0 1 2.5-1.7L8 14',
  crop: 'M6 2v14h14M2 6h14v14',
  ruler: 'M3 17L17 3l4 4L7 21zM7 13l2 2M10 10l2 2M13 7l2 2',
  alert: 'M12 3l10 18H2zM12 10v5M12 18v.5',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 11v6M12 7v.5',
  star: 'M12 3l2.6 5.6L20 9.3l-4 4 1 5.7-5-2.8-5 2.8 1-5.7-4-4 5.4-.7z',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5',
  grip: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
  edit: 'M4 20h4L20 8l-4-4L4 16zM14 6l4 4',
  menu: 'M4 7h16M4 12h16M4 17h16',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.8 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.8-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.8H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 2.8-1.2V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.8 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.8H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1.1z',
  qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2',
  curve: 'M3 17c4-8 14-8 18 0',
  file: 'M6 2h9l5 5v15H6zM14 2v6h6',
}

export function Icon({ name, size = 20, label, className }: { name: keyof typeof P | string; size?: number; label?: string; className?: string }) {
  const Glyph = library[name]
  if (Glyph) return <Glyph size={size} strokeWidth={1.75} className={className} aria-hidden={label ? undefined : true} aria-label={label} role={label ? 'img' : undefined} />
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden={label ? undefined : true} role={label ? 'img' : undefined} aria-label={label}>
      <path d={P[name] ?? P.info} />
    </svg>
  )
}
