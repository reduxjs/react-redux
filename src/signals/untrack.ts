import { getProxyTarget } from './trackingProxy'

/**
 * Strip tracking proxies from a selector result so components, effects,
 * DevTools, and dispatch payloads only ever see raw (frozen) state.
 *
 * proxy-memoize style: walk the result, swap every tracking proxy for its
 * raw target in place, stop descending at each proxy (everything below a
 * raw target is raw).
 *
 * Derived containers built by the selector are mutated IN PLACE (proxy
 * values swapped for raw targets), preserving container identity across
 * evaluations — a memoized (reselect-cached) array keeps its identity,
 * and re-untracking it is an idempotent no-op.
 * @param result - The selector's return value
 * @returns The result with all tracking proxies replaced by raw state
 */
export function untrackResult<R>(result: R): R {
  return untrackRecursive(result, null)
}

function untrackRecursive<R>(value: R, seen: WeakSet<object> | null): R {
  if (value === null || typeof value !== 'object') return value

  // Tracking proxy: swap for the raw target. No descent — everything
  // reachable from a raw state object is raw.
  const target = getProxyTarget(value)
  if (target !== undefined) return target as R

  // Frozen non-proxy objects can't be repaired in place. Raw state
  // subtrees (already frozen, can't contain proxies) are the common
  // case — skipping them also avoids walking large unwrapped subtrees.
  // A user-frozen derived container holding proxies is unsupported.
  if (Object.isFrozen(value)) return value

  if (seen === null) seen = new WeakSet()
  else if (seen.has(value)) return value
  seen.add(value)

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const v: unknown = value[i]
      const u = untrackRecursive(v, seen)
      if (u !== v) value[i] = u
    }
    return value
  }

  if (value instanceof Map) {
    for (const [k, v] of value) {
      const u = untrackRecursive(v, seen)
      if (u !== v) value.set(k, u)
    }
    return value
  }

  if (value instanceof Set) {
    let replacements: Array<[unknown, unknown]> | null = null
    for (const v of value) {
      const u = untrackRecursive(v, seen)
      if (u !== v) (replacements ??= []).push([v, u])
    }
    if (replacements) {
      // Rebuild preserving insertion order is not possible with targeted
      // deletes; proxies in Sets are rare enough that delete+add is fine.
      for (const [v, u] of replacements) {
        value.delete(v)
        value.add(u)
      }
    }
    return value
  }

  const record = value as Record<string, unknown>
  for (const k of Object.keys(record)) {
    const v = record[k]
    const u = untrackRecursive(v, seen)
    if (u !== v) record[k] = u
  }
  return value
}
