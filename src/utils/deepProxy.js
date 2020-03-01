/* eslint-env es6 */

// deep proxy for useTrackedState

const OWN_KEYS_SYMBOL = Symbol('OWN_KEYS')
const TRACK_MEMO_SYMBOL = Symbol('TRACK_MEMO')
const GET_ORIGINAL_SYMBOL = Symbol('GET_ORIGINAL')

// check if obj is a plain object or an array
const isPlainObject = obj => {
  try {
    const proto = Object.getPrototypeOf(obj)
    return proto === Object.prototype || proto === Array.prototype
  } catch (e) {
    return false
  }
}

// copy obj if frozen
const unfreeze = obj => {
  if (!Object.isFrozen(obj)) return obj
  if (Array.isArray(obj)) {
    return Array.from(obj)
  }
  return Object.assign({}, obj)
}

const createProxyHandler = () => ({
  recordUsage(key) {
    if (this.trackObj) return
    let used = this.affected.get(this.originalObj)
    if (!used) {
      used = new Set()
      this.affected.set(this.originalObj, used)
    }
    used.add(key)
  },
  recordObjectAsUsed() {
    this.trackObj = true
    this.affected.delete(this.originalObj)
  },
  get(target, key) {
    if (key === GET_ORIGINAL_SYMBOL) {
      return this.originalObj
    }
    this.recordUsage(key)
    return createDeepProxy(target[key], this.affected, this.proxyCache)
  },
  has(target, key) {
    if (key === TRACK_MEMO_SYMBOL) {
      this.recordObjectAsUsed()
      return true
    }
    // LIMITATION:
    // We simply record the same as get.
    // This means { a: {} } and { a: {} } is detected as changed,
    // if 'a' in obj is handled.
    this.recordUsage(key)
    return key in target
  },
  ownKeys(target) {
    this.recordUsage(OWN_KEYS_SYMBOL)
    return Reflect.ownKeys(target)
  }
})

export const createDeepProxy = (obj, affected, proxyCache) => {
  if (!isPlainObject(obj)) return obj
  const origObj = obj[GET_ORIGINAL_SYMBOL] // unwrap proxy
  if (origObj) obj = origObj
  let proxyHandler = proxyCache && proxyCache.get(obj)
  if (!proxyHandler) {
    proxyHandler = createProxyHandler()
    proxyHandler.proxy = new Proxy(unfreeze(obj), proxyHandler)
    proxyHandler.originalObj = obj
    proxyHandler.trackObj = false // for trackMemo
    if (proxyCache) {
      proxyCache.set(obj, proxyHandler)
    }
  }
  proxyHandler.affected = affected
  proxyHandler.proxyCache = proxyCache
  return proxyHandler.proxy
}

const isOwnKeysChanged = (origObj, nextObj) => {
  const origKeys = Reflect.ownKeys(origObj)
  const nextKeys = Reflect.ownKeys(nextObj)
  return (
    origKeys.length !== nextKeys.length ||
    origKeys.some((k, i) => k !== nextKeys[i])
  )
}

export const isDeepChanged = (
  origObj,
  nextObj,
  affected,
  cache,
  assumeChangedIfNotAffected
) => {
  if (origObj === nextObj) return false
  if (typeof origObj !== 'object' || origObj === null) return true
  if (typeof nextObj !== 'object' || nextObj === null) return true
  const used = affected.get(origObj)
  if (!used) return !!assumeChangedIfNotAffected
  if (cache) {
    const hit = cache.get(origObj)
    if (hit && hit.nextObj === nextObj) {
      return hit.changed
    }
    // for object with cycles (changed is `undefined`)
    cache.set(origObj, { nextObj })
  }
  let changed = null
  for (const key of used) {
    const c =
      key === OWN_KEYS_SYMBOL
        ? isOwnKeysChanged(origObj, nextObj)
        : isDeepChanged(
            origObj[key],
            nextObj[key],
            affected,
            cache,
            assumeChangedIfNotAffected !== false
          )
    if (typeof c === 'boolean') changed = c
    if (changed) break
  }
  if (changed === null) changed = !!assumeChangedIfNotAffected
  if (cache) {
    cache.set(origObj, { nextObj, changed })
  }
  return changed
}

// explicitly track object with memo
export const trackMemo = obj => {
  if (isPlainObject(obj)) {
    return TRACK_MEMO_SYMBOL in obj
  }
  return false
}

// get original object from proxy
export const getUntrackedObject = obj => {
  if (isPlainObject(obj)) {
    return obj[GET_ORIGINAL_SYMBOL] || null
  }
  return null
}
