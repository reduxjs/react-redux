import { buildIdentityPath, findKeyField, getKeyValue } from './arrayKeys'
import {
  isOverriddenArrayMethod,
  createArrayMethodInterceptor,
} from './arrayMethodOverrides'
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

/**
 * Type for the proxy cache. Exported so the registry can own one.
 * Caches proxies by their target object identity.
 * Since Immer uses structural sharing, unchanged subtrees keep the same
 * object reference across state snapshots — so we can reuse their proxies.
 */
export type ProxyCache = WeakMap<object, object>

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
  cache: ProxyCache,
): T {
  // Check proxy cache — reuse proxy if we've already wrapped this exact object
  const cached = cache.get(target)
  if (cached) return cached as T

  // Use an unfrozen shell as the proxy target to avoid ES Proxy invariant
  // violations with frozen objects. The shell copies the target's prototype
  // so that Array.isArray, instanceof, etc. work correctly.
  const shell = Array.isArray(target) ? [] : Object.create(Object.getPrototypeOf(target))

  const proxy = new Proxy(shell, {
    get(_obj, prop, _receiver) {
      // Symbols: read from actual target (iterator protocol, toStringTag, etc.)
      if (typeof prop === 'symbol') return Reflect.get(target, prop)

      const value = (target as Record<string, unknown>)[prop]

      // Functions: intercept array methods to avoid per-element proxy creation
      if (typeof value === 'function') {
        if (Array.isArray(target) && isOverriddenArrayMethod(prop as string)) {
          return createArrayMethodInterceptor(target, proxy, prop as string)
        }
        return value
      }

      let pathKey = parentPath ? parentPath + '.' + (prop as string) : (prop as string)

      if (isObjectOrArray(value)) {
        // For array element access: check if parent array has identity-based tracking.
        // If so, use the identity path (items.{id:42}) instead of index path (items.0).
        if (Array.isArray(target) && !Array.isArray(value) && !isNaN(Number(prop))) {
          let meta = registry.getArrayMeta(parentPath)
          if (!meta) {
            // First time accessing this array's elements — try to detect key field
            const keyField = findKeyField(value)
            if (keyField) {
              meta = { keyField, entityMap: new Map() }
              registry.setArrayMeta(parentPath, meta)
            }
          }
          if (meta) {
            const kv = getKeyValue(value, meta.keyField)
            if (kv !== undefined) {
              pathKey = buildIdentityPath(parentPath, meta.keyField, kv)
            }
          }
        }

        // Register in prefix index (for hasPrefix/diff tracking) but DON'T
        // create a signal. This avoids allocating signals for intermediate
        // objects that are only traversed, not read as terminal values.
        registry.ensurePrefix(pathKey)

        // Return cached child proxy (createTrackingProxy checks cache internally)
        const childProxy = createTrackingProxy(
          value as object,
          pathKey,
          registry,
          cache,
        )
        return childProxy
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

  // Cache by target identity — unchanged Immer subtrees reuse same proxy
  cache.set(target, proxy)
  proxyPathMap.set(proxy as object, parentPath)

  return proxy
}
