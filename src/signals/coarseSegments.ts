import { throwStateMutationError } from './mutationError'
import { registerProxyTarget } from './trackingProxy'

/**
 * A deferred (not-yet-built) useSignalSelector subscriber, registered in
 * the coarse tier. The hook stays in this tier — no tracking proxies, no
 * path signals, no alien-signals effect — until a dispatch changes one of
 * the top-level state keys its selector read at probe time. Then
 * `onCoarseHit` promotes it to the deep (path-signal) tier.
 */
export interface CoarseSub {
  /**
   * Top-level state keys the selector read when probed, recorded as raw
   * (unencoded) key names. `null` means wildcard: the footprint can't be
   * gated (e.g. the selector returned the root state), so the subscriber
   * is hit on every dispatch that changes the root reference.
   */
  segments: Set<string> | null
  /** Promote this subscriber to the deep tier. Called at most once. */
  onCoarseHit(): void
}

/**
 * Inverted index from top-level state key ("segment") to the coarse
 * subscribers whose probed footprint includes that key. Lets the
 * SignalProvider wake only the deferred subscribers that could possibly
 * be affected by a dispatch, using the changed root keys the state diff
 * already computes.
 */
export interface SegmentIndex {
  register(sub: CoarseSub): void
  /** Idempotent: unregistering a sub that isn't registered is a no-op. */
  unregister(sub: CoarseSub): void
  /**
   * Collect subscribers whose footprint intersects the changed root keys.
   * `null` means the root wasn't diffable (non-plain-object root): every
   * subscriber is a candidate. An empty array still returns wildcard
   * subscribers — the root reference changed even if no key did.
   * Returns a snapshot array: subscribers unregister themselves during
   * `onCoarseHit`, so the caller must not iterate live index structures.
   */
  collect(changedRootKeys: readonly string[] | null): readonly CoarseSub[]
  size(): number
}

const EMPTY: readonly CoarseSub[] = []

export function createSegmentIndex(): SegmentIndex {
  const all = new Set<CoarseSub>()
  const bySegment = new Map<string, Set<CoarseSub>>()
  const wildcards = new Set<CoarseSub>()

  return {
    register(sub: CoarseSub): void {
      if (all.has(sub)) return
      all.add(sub)
      if (sub.segments === null) {
        wildcards.add(sub)
        return
      }
      for (const seg of sub.segments) {
        let bucket = bySegment.get(seg)
        if (bucket === undefined) {
          bucket = new Set()
          bySegment.set(seg, bucket)
        }
        bucket.add(sub)
      }
    },

    unregister(sub: CoarseSub): void {
      if (!all.delete(sub)) return
      if (sub.segments === null) {
        wildcards.delete(sub)
        return
      }
      for (const seg of sub.segments) {
        const bucket = bySegment.get(seg)
        if (bucket !== undefined) {
          bucket.delete(sub)
          if (bucket.size === 0) bySegment.delete(seg)
        }
      }
    },

    collect(changedRootKeys: readonly string[] | null): readonly CoarseSub[] {
      if (all.size === 0) return EMPTY
      if (changedRootKeys === null) return Array.from(all)
      if (changedRootKeys.length === 0) {
        return wildcards.size > 0 ? Array.from(wildcards) : EMPTY
      }
      const hits = new Set<CoarseSub>(wildcards)
      for (let i = 0; i < changedRootKeys.length; i++) {
        const bucket = bySegment.get(changedRootKeys[i])
        if (bucket !== undefined) {
          for (const sub of bucket) hits.add(sub)
        }
      }
      return hits.size > 0 ? Array.from(hits) : EMPTY
    },

    size(): number {
      return all.size
    },
  }
}

/**
 * Mutable record filled in while a selector runs against a probe proxy.
 */
export interface ProbeRecord {
  /** Raw top-level state keys the selector touched (get / has /
   *  getOwnPropertyDescriptor). */
  segments: Set<string>
  /** The selector enumerated the root's keys (Object.keys, spread,
   *  for...in). Key-set changes can't be gated by the segments alone,
   *  so an enumerating selector must build the deep tier eagerly. */
  enumerated: boolean
}

function isGuardable(value: unknown): value is object {
  if (value === null || typeof value !== 'object') return false
  if (Array.isArray(value)) return true
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

// Guards are cached by target identity so a probe run wraps each object
// once. Module-level: guards carry no per-probe state, and `untrackResult`
// strips them from results regardless of which probe created them.
const guardCache = new WeakMap<object, object>()

/**
 * Dev-only read-only wrapper for nested objects handed out by the probe
 * proxy. The deep tracking proxy rejects selector writes, but the probe
 * returns nested values raw — without this guard, a mutating selector
 * (e.g. `s => s.items.sort()`) silently corrupts real store state during
 * the mount evaluation and only starts throwing after promotion.
 *
 * The guard records nothing (the probe already recorded the top-level
 * segment); it exists purely to make write rejection consistent across
 * both tiers. Plain objects and arrays only: wrapping Date/Map/Set/class
 * instances breaks methods that need internal slots, and the deep tier
 * returns those raw too.
 *
 * The proxy target is an unfrozen shell (same trick as the deep tracking
 * proxy): the get trap returns nested guards, which would violate ES
 * Proxy invariants on a frozen target's non-configurable properties.
 *
 * Registered in the proxy→target map so `untrackResult` and `unwrap`
 * strip guards from selector results.
 * @param target - The raw nested state object to guard
 * @returns A proxy that reads through to `target` and throws on writes
 */
function createWriteGuard<T extends object>(target: T): T {
  const cached = guardCache.get(target)
  if (cached) return cached as T

  const shell = Array.isArray(target)
    ? []
    : Object.create(Object.getPrototypeOf(target))

  const proxy = new Proxy(shell as T, {
    get(_obj, prop) {
      if (typeof prop === 'symbol') return Reflect.get(target, prop)
      const value = (target as Record<string, unknown>)[prop]
      return isGuardable(value) ? createWriteGuard(value) : value
    },

    has(_obj, prop) {
      return Reflect.has(target, prop)
    },

    ownKeys(_obj) {
      return Reflect.ownKeys(target)
    },

    getOwnPropertyDescriptor(_obj, prop) {
      const desc = Object.getOwnPropertyDescriptor(target, prop)
      // Frozen state props are non-configurable; the shell doesn't have
      // them, so report configurable to satisfy proxy invariants.
      return desc ? { ...desc, configurable: true } : desc
    },

    getPrototypeOf(_obj) {
      return Object.getPrototypeOf(target)
    },

    isExtensible(_obj) {
      return Object.isExtensible(target)
    },

    set(_obj, prop) {
      throwStateMutationError('set', String(prop))
    },

    deleteProperty(_obj, prop) {
      throwStateMutationError('delete', String(prop))
    },

    defineProperty(_obj, prop) {
      throwStateMutationError('defineProperty', String(prop))
    },

    setPrototypeOf() {
      throwStateMutationError('setPrototypeOf', '')
    },
  }) as T

  guardCache.set(target, proxy)
  registerProxyTarget(proxy as object, target)
  return proxy
}

/**
 * Create a one-level-shallow probe proxy over the root state object.
 *
 * Unlike the deep tracking proxy, the probe:
 * - records only WHICH top-level keys the selector reads (no signals,
 *   no path strings, no nested proxies)
 * - returns raw nested values, so the selector runs at native speed
 *   below the first level (in production; dev builds wrap nested
 *   objects in write guards so mutating selectors throw at mount too)
 *
 * The proxy target is an unfrozen shell so the dev-mode get trap can
 * return write guards without violating ES Proxy invariants on frozen
 * state; the other traps read through to the real state object.
 *
 * The proxy is registered in the proxy→target map so `untrackResult`
 * and `unwrap` strip it from selector results (`s => s`,
 * `s => ({ root: s })`).
 *
 * Only plain-object roots may be probed: for class instances / Map /
 * Set roots, method calls through the proxy would run with the proxy as
 * `this` and break internal-slot access. Callers must check first.
 * @param state - The root state object (plain object)
 * @returns The probe proxy and the record it fills in
 */
export function createProbeProxy<T extends object>(
  state: T,
): { proxy: T; record: ProbeRecord } {
  const record: ProbeRecord = { segments: new Set(), enumerated: false }

  const shell = Object.create(Object.getPrototypeOf(state)) as T

  const proxy = new Proxy(shell, {
    get(_obj, prop) {
      if (typeof prop === 'symbol') return Reflect.get(state, prop)
      record.segments.add(prop)
      const value = (state as Record<string, unknown>)[prop]
      if (process.env.NODE_ENV !== 'production' && isGuardable(value)) {
        return createWriteGuard(value)
      }
      return value
    },

    has(_obj, prop) {
      if (typeof prop !== 'symbol') record.segments.add(prop)
      return Reflect.has(state, prop)
    },

    ownKeys(_obj) {
      record.enumerated = true
      return Reflect.ownKeys(state)
    },

    // Fires for Object.getOwnPropertyDescriptor and hasOwnProperty, and
    // per-key during enumeration (where `enumerated` is already set by
    // ownKeys). A single descriptor read reveals one key's existence and
    // value — record it as a segment read, like get/has.
    getOwnPropertyDescriptor(_obj, prop) {
      if (typeof prop !== 'symbol') record.segments.add(prop)
      const desc = Object.getOwnPropertyDescriptor(state, prop)
      // The shell target doesn't have the state's props; report them
      // configurable to satisfy proxy invariants (matters for frozen state).
      return desc ? { ...desc, configurable: true } : desc
    },

    getPrototypeOf(_obj) {
      return Object.getPrototypeOf(state)
    },

    isExtensible(_obj) {
      return Object.isExtensible(state)
    },

    set(_obj, prop) {
      throwStateMutationError('set', String(prop))
    },

    deleteProperty(_obj, prop) {
      throwStateMutationError('delete', String(prop))
    },
  }) as T

  registerProxyTarget(proxy as object, state)

  return { proxy, record }
}
