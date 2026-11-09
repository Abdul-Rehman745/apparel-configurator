// Provider-agnostic analytics. Host pages register sinks; nothing here knows about GA/Segment/etc.
export type AnalyticsEvent =
  | 'configurator_opened' | 'product_changed' | 'color_changed' | 'print_area_selected' | 'text_added'
  | 'image_uploaded' | 'clipart_added' | 'design_saved' | 'design_shared' | 'validation_failed'
  | 'add_to_cart' | 'checkout_started'

export type Sink = (event: AnalyticsEvent, props: Record<string, unknown>) => void

const sinks = new Set<Sink>()

export function addAnalyticsSink(s: Sink) {
  sinks.add(s)
  return () => sinks.delete(s)
}

export function track(event: AnalyticsEvent, props: Record<string, unknown> = {}) {
  for (const s of sinks) {
    try { s(event, props) } catch { /* a broken sink must never break the configurator */ }
  }
}

/** Built-in sinks the embedding page can opt into via tenant config. */
export const sinksLibrary = {
  dataLayer: ((event, props) => ((window as any).dataLayer ??= []).push({ event, ...props })) as Sink,
  postMessage: ((event, props) => window.parent !== window && window.parent.postMessage({ type: 'configurator:analytics', event, props }, '*')) as Sink,
  console: ((event, props) => console.debug('[analytics]', event, props)) as Sink,
}
