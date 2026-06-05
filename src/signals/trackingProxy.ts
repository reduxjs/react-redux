import type { PathSignalRegistry } from './pathSignalRegistry'

function isObjectOrArray(v: unknown): v is object {
  return v !== null && typeof v === 'object'
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
  pathSegments: string[],
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
        // For inherited methods (e.g. Array.prototype.map), return them
        // bound to the proxy so iteration uses tracked access
        return value
      }

      const childPath = [...pathSegments, prop]
      const pathKey = childPath.join('.')

      if (isObjectOrArray(value)) {
        // Read signal to establish dependency (version counter for objects)
        registry.getOrCreate(pathKey, value).get()

        // Return cached child proxy
        if (!childCache.has(prop as string)) {
          childCache.set(
            prop as string,
            createTrackingProxy(value as object, childPath, registry),
          )
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
      const keysPath = [...pathSegments, '@@keys'].join('.')
      registry.getOrCreate(keysPath, Reflect.ownKeys(target)).get()
      return Reflect.ownKeys(target)
    },

    // Track has() checks for conditional property access (e.g., 'key' in obj)
    has(_obj, prop) {
      if (typeof prop === 'symbol') return Reflect.has(target, prop)
      const pathKey = [...pathSegments, prop].join('.')
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
