/**
 * Maps proxy objects to their path keys.
 * Used by useSignalSelector to detect when a selector returns a proxy (object)
 * and explicitly establish a dependency on that object's signal.
 */
const proxyPathMap = new WeakMap<object, string>()

/**
 * Maps tracking proxies back to their raw target objects.
 * Used to unwrap proxy arguments in array methods like includes/indexOf
 * where identity comparison needs to work against raw array elements.
 */
const proxyTargetMap = new WeakMap<object, object>()

/**
 * Maps scan-recorder proxies (used by array method callbacks) to their
 * mutable holders. A recorder proxy is reused across all elements of a
 * scan, reading from `holder.current`. unwrap() consults this map so
 * identity comparisons inside callbacks can be unwrapped correctly.
 */
const recordingHolders = new WeakMap<object, { current: unknown }>()

/**
 * Register a tracking proxy with its path and raw target.
 * @param proxy - The tracking proxy
 * @param target - The raw object it wraps
 * @param path - The proxy's path key
 * @returns void
 */
export function registerTrackingProxy(
  proxy: object,
  target: object,
  path: string,
): void {
  proxyPathMap.set(proxy, path)
  proxyTargetMap.set(proxy, target)
}

/**
 * Register a proxy→target mapping for a proxy that has no path (the
 * coarse-tier probe proxy). Makes `unwrap` and `untrackResult` treat it
 * like any tracking proxy.
 * @param proxy - The proxy object
 * @param target - The raw object it wraps
 * @returns void
 */
export function registerProxyTarget(proxy: object, target: object): void {
  proxyTargetMap.set(proxy, target)
}

/**
 * Register a scan-recorder proxy so unwrap() can resolve it to the
 * element currently being scanned.
 * @param proxy - The recorder proxy passed to array method callbacks
 * @param holder - Mutable holder whose `current` is the raw element
 * @returns void
 */
export function registerRecordingHolder(
  proxy: object,
  holder: { current: unknown },
): void {
  recordingHolders.set(proxy, holder)
}

/**
 * Get the path key associated with a tracking proxy, or undefined if not a proxy.
 * @param value - The value to check
 * @returns The path string, or undefined if not a tracking proxy
 */
export function getProxyPath(value: unknown): string | undefined {
  if (value !== null && typeof value === 'object') {
    return proxyPathMap.get(value)
  }
  return undefined
}

/**
 * Get the raw target of a tracking proxy, or undefined if the value is
 * not a tracking proxy. Unlike unwrap(), this distinguishes "was a
 * proxy" from "was already raw", which the result-untracking walk needs
 * (proxies mark subtree boundaries: everything below a target is raw).
 * @param value - The value to check
 * @returns The raw target, or undefined if not a tracking proxy
 */
export function getProxyTarget(value: object): object | undefined {
  return proxyTargetMap.get(value)
}

/**
 * Descriptor for a proxy whose target is an unfrozen shell standing in for
 * frozen state. Frozen state props are non-configurable, and the shell
 * doesn't have them, so they are reported configurable. An array shell
 * does have its own non-configurable `length`, which the proxy may not
 * report as configurable; it is reported writable instead, which matches
 * the shell's own `length` and allows a different value.
 */
export function shellDescriptor(
  target: object,
  prop: PropertyKey,
): PropertyDescriptor | undefined {
  const desc = Object.getOwnPropertyDescriptor(target, prop)
  if (desc === undefined) return desc
  if (prop === 'length' && Array.isArray(target)) {
    return { ...desc, writable: true }
  }
  return { ...desc, configurable: true }
}

/**
 * Get the raw target object from a tracking proxy, or the value itself if not a proxy.
 *
 * Use this when you need identity comparison between values that may be
 * tracking proxies. Since `proxy === rawObject` is always `false` in JS,
 * unwrapping both sides allows correct identity checks:
 *
 * ```ts
 * import { unwrap } from 'react-redux/signals'
 *
 * const selector = (state) => {
 *   const current = unwrap(state.current)
 *   return state.items.find(item => unwrap(item) === current)
 * }
 * ```
 *
 * `unwrap` itself registers no dependency. Safe to call on non-proxy
 * values — returns them unchanged.
 *
 * @param value - The value to unwrap (proxy or raw)
 * @returns The raw target object, or the original value if not a tracking proxy
 */
export function unwrap<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    const target = proxyTargetMap.get(value as object)
    if (target !== undefined) return target as T
    const holder = recordingHolders.get(value as object)
    if (holder !== undefined) return holder.current as T
  }
  return value
}
