// Versioned, deterministic (de)serialisation of the design document.
import { SCHEMA_VERSION, type DesignState } from '../core/design'

export class DesignLoadError extends Error {}

/** JSON with sorted object keys so identical designs always produce identical bytes. */
export function stableStringify(v: unknown): string {
  return JSON.stringify(v, (_k, val) =>
    val && typeof val === 'object' && !Array.isArray(val)
      ? Object.fromEntries(Object.keys(val).sort().map((k) => [k, (val as Record<string, unknown>)[k]]))
      : val,
  )
}

type Migration = (d: Record<string, any>) => Record<string, any>

/** migrations[n] upgrades schemaVersion n → n+1. Never edit a shipped migration; append a new one. */
export const migrations: Record<number, Migration> = {
  // v1 stored a single garment colour and called the method `printMethod`.
  1: (d) => {
    const { color, printMethod, ...rest } = d
    return { ...rest, colors: rest.colors ?? { body: color ?? 'white' }, methodId: rest.methodId ?? printMethod, bulk: rest.bulk ?? { enabled: false, rows: [] }, schemaVersion: 2 }
  },
}

export function migrate(raw: Record<string, any>): DesignState {
  let d = raw
  let v = typeof d.schemaVersion === 'number' ? d.schemaVersion : 1
  if (v > SCHEMA_VERSION) throw new DesignLoadError(`Design was saved by a newer version (schema ${v}).`)
  while (v < SCHEMA_VERSION) {
    const m = migrations[v]
    if (!m) throw new DesignLoadError(`No migration from schema ${v}.`)
    d = m(d)
    v = d.schemaVersion
  }
  return d as DesignState
}

export function serializeDesign(d: DesignState): string {
  return stableStringify({ ...d, schemaVersion: SCHEMA_VERSION })
}

export function deserializeDesign(text: string): DesignState {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new DesignLoadError('Saved design is corrupted (invalid JSON).')
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new DesignLoadError('Saved design is corrupted.')
  const d = migrate(raw as Record<string, any>)
  for (const k of ['productId', 'modelId', 'sizeId', 'materialId', 'methodId'] as const) {
    if (typeof d[k] !== 'string') throw new DesignLoadError(`Saved design is missing “${k}”.`)
  }
  if (typeof d.quantity !== 'number' || !d.areas || typeof d.areas !== 'object') throw new DesignLoadError('Saved design is incomplete.')
  for (const [id, a] of Object.entries(d.areas)) {
    if (!a || !Array.isArray(a.objects)) throw new DesignLoadError(`Area “${id}” is corrupted.`)
  }
  return d
}
