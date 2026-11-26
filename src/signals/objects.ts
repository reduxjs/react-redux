export function isObjectOrArray(v: unknown): v is object {
  return v !== null && typeof v === 'object'
}

/**
 * True for objects whose prototype is exactly `Object.prototype` or
 * `null`. Stricter than `utils/isPlainObject`, which also accepts plain
 * objects from another realm: the signals proxies only wrap objects whose
 * properties can be read without internal slots.
 */
export function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (!isObjectOrArray(v)) return false
  const proto = Object.getPrototypeOf(v)
  return proto === Object.prototype || proto === null
}
