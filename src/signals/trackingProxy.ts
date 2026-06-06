import type { PathSignalRegistry } from './pathSignalRegistry'

function isObjectOrArray(v: unknown): v is object {
  return v !== null && typeof v === 'object'
}

/**
 * Maps proxy objects to their path keys.
 * Used by useSignalSelector to detect when a selector returns a proxy (object)
 * and explicitly establish a dependency on that object's signal.
 */
const proxyPathMap = new WeakMap<object, string>()

/** Get the path key associated with a tracking proxy, or undefined if not a proxy. */
export function getProxyPath(value: unknown): string | undefined {
  if (value !== null && typeof value === 'object') {
    return proxyPathMap.get(value)
  }
  return undefined
}

/**
 * Creates a read-only tracking proxy that wraps frozen Redux state.
 *
 * On property access, the proxy:
 * 1. Reads the corresponding path signal (establishing a reactive dependency)
 * 2. Returns the actual frozen value (primitives) or a nested tracking proxy (objects/arrays)
 *
 * For frozen state compatibility: the proxy target is a thin unfrozen shell
 * that mirrors the real state's structure. This avoids the ES Proxy invariant
 * that forbids returning different values for non-configurable properties.
 * The proxy reads actual values from the real frozen state object.
 *
 * Child proxies are cached within a single evaluation to avoid duplicates.
 */
export function createTrackingProxy<T extends object>(
  target: T,
  parentPath: string,
  registry: PathSignalRegistry,
): T {
  // Cache child proxies within this evaluation to avoid duplicate creation
  const childCache = new Map<string, unknown>()

  // Use an unfrozen shell as the proxy target to avoid ES Proxy invariant
  // violations with frozen objects. The shell copies the target's prototype
  // so that Array.isArray, instanceof, etc. work correctly.
  const shell = Array.isArray(target) ? [] : Object.create(Object.getPrototypeOf(target))

  return new Proxy(shell, {
    get(_obj, prop, _receiver) {
      // Symbols: read from actual target (iterator protocol, toStringTag, etc.)
      if (typeof prop === 'symbol') return Reflect.get(target, prop)

      const value = (target as Record<string, unknown>)[prop]

      // Functions (like Array.prototype.map) — bind to proxy so `this` works
      if (typeof value === 'function') {
        return value
      }

      const pathKey = parentPath ? parentPath + '.' + (prop as string) : (prop as string)

      if (isObjectOrArray(value)) {
        // Register the signal (for hasPrefix/diff tracking) but DON'T read it.
        // This avoids "false sharing" — intermediate object traversals won't
        // create dependencies. Only leaf reads and explicit terminal reads
        // (detected by useSignalSelector) establish reactive dependencies.
        registry.getOrCreate(pathKey, value)

        // Return cached child proxy
        if (!childCache.has(prop as string)) {
          const childProxy = createTrackingProxy(
            value as object,
            pathKey,
            registry,
          )
          proxyPathMap.set(childProxy as object, pathKey)
          childCache.set(prop as string, childProxy)
        }
        return childCache.get(prop as string)
      }

      // Primitive leaf: read signal to establish dependency
      registry.getOrCreate(pathKey, value).get()

      // Return the actual value
      return value
    },

    // Track when selectors iterate keys (Object.keys, for...in, .map, .filter, etc.)
    ownKeys(_obj) {
      const keysPath = parentPath ? parentPath + '.@@keys' : '@@keys'
      registry.getOrCreate(keysPath, Reflect.ownKeys(target)).get()
      return Reflect.ownKeys(target)
    },

    // Track has() checks for conditional property access (e.g., 'key' in obj)
    has(_obj, prop) {
      if (typeof prop === 'symbol') return Reflect.has(target, prop)
      const pathKey = parentPath ? parentPath + '.' + (prop as string) : (prop as string)
      registry.getOrCreate(pathKey, (target as Record<string, unknown>)[prop]).get()
      return Reflect.has(target, prop)
    },

    // Delegate to real target for property descriptors
    getOwnPropertyDescriptor(_obj, prop) {
      const desc = Object.getOwnPropertyDescriptor(target, prop)
      if (desc) {
        // Mark as configurable so the proxy can return different values
        // (our proxy may return child proxies for object properties)
        return { ...desc, configurable: true }
      }
      return desc
    },

    // Report the real target's prototype
    getPrototypeOf(_obj) {
      return Object.getPrototypeOf(target)
    },

    // Report the real target's extensibility
    isExtensible(_obj) {
      return Object.isExtensible(target)
    },

    // Prevent mutation
    set() {
      return false
    },
    deleteProperty() {
      return false
    },
  }) as T
}
