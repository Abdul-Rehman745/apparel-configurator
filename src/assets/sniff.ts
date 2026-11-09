// File-signature sniffing. The extension and browser-reported MIME are never trusted.
export type Sniffed = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/svg+xml' | 'application/pdf' | null

export function sniff(bytes: Uint8Array): Sniffed {
  const b = bytes
  const at = (i: number, ...v: number[]) => v.every((x, j) => b[i + j] === x)
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png'
  if (at(0, 0xff, 0xd8, 0xff)) return 'image/jpeg'
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return 'image/webp'
  if (at(0, 0x25, 0x50, 0x44, 0x46)) return 'application/pdf'
  // SVG is text: allow BOM/whitespace/XML prolog/comments before the root element.
  const head = new TextDecoder('utf-8', { fatal: false }).decode(b.subarray(0, 1024)).replace(/^﻿/, '').trimStart()
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(head)) return 'image/svg+xml'
  return null
}
