import { getProxyTarget } from './proxyIdentity'

// Proxies already swapped out of each derived container. A memoized result
// comes back unwrapped on a cache hit, so these are replayed to `onProxy`
// to keep depending on the state objects it embeds.
const strippedProxies = new WeakMap<object, object[]>()

function recordStripped(container: object, proxy: object): void {
  const list = strippedProxies.get(container)
  if (list) list.push(proxy)
  else strippedProxies.set(container, [proxy])
}

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
 * evaluations — a memoized (reselect-cached) array keeps its identity.
 * Re-untracking it changes nothing but replays the proxies stripped from
 * it earlier, so `onProxy` sees the same state objects on a cache hit.
 *
 * `onProxy` is called for every proxy that is stripped. The tracked path
 * uses it to depend on the identity of each state object that leaves the
 * selector, since the component holds that whole object.
 */
export function untrackResult<R>(
  result: R,
  onProxy?: (proxy: object) => void,
): R {
  return untrackRecursive(result, null, onProxy)
}

function untrackRecursive<R>(
  value: R,
  seen: WeakSet<object> | null,
  onProxy: ((proxy: object) => void) | undefined,
): R {
  if (value === null || typeof value !== 'object') return value

  // Tracking proxy: swap for the raw target. No descent — everything
  // reachable from a raw state object is raw.
  const target = getProxyTarget(value)
  if (target !== undefined) {
    onProxy?.(value)
    return target as R
  }

  // Frozen non-proxy objects can't be repaired in place. Raw state
  // subtrees (already frozen, can't contain proxies) are the common
  // case — skipping them also avoids walking large unwrapped subtrees.
  // A user-frozen derived container holding proxies is unsupported.
  if (Object.isFrozen(value)) return value

  if (seen === null) seen = new WeakSet()
  else if (seen.has(value)) return value
  seen.add(value)

  if (onProxy) {
    const replay = strippedProxies.get(value)
    if (replay) for (let i = 0; i < replay.length; i++) onProxy(replay[i])
  }

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const v: unknown = value[i]
      const u = untrackRecursive(v, seen, onProxy)
      if (u !== v) {
        value[i] = u
        recordStripped(value, v as object)
      }
    }
    return value
  }

  if (value instanceof Map) {
    for (const [k, v] of value) {
      const u = untrackRecursive(v, seen, onProxy)
      if (u !== v) {
        value.set(k, u)
        recordStripped(value, v as object)
      }
    }
    return value
  }

  if (value instanceof Set) {
    let replacements: Array<[unknown, unknown]> | null = null
    for (const v of value) {
      const u = untrackRecursive(v, seen, onProxy)
      if (u !== v) (replacements ??= []).push([v, u])
    }
    if (replacements) {
      // Rebuild preserving insertion order is not possible with targeted
      // deletes; proxies in Sets are rare enough that delete+add is fine.
      for (const [v, u] of replacements) {
        value.delete(v)
        value.add(u)
        recordStripped(value, v as object)
      }
    }
    return value
  }

  const record = value as Record<string, unknown>
  for (const k of Object.keys(record)) {
    const v = record[k]
    const u = untrackRecursive(v, seen, onProxy)
    if (u !== v) {
      record[k] = u
      recordStripped(record, v as object)
    }
  }
  return value
}
