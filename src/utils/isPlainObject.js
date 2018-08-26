/**
 * @param {any} obj The object to inspect.
 * @returns {boolean} True if the argument appears to be a plain object.
 */
export default function isPlainObject(obj) {
  if (typeof obj !== 'object' || obj === null) return false

  let proto = obj
  while (Object.getPrototypeOf(proto) !== null) {
    proto = Object.getPrototypeOf(proto)

    if (proto.constructor && !(proto.constructor.create && Object.getPrototypeOf(proto.constructor.create(proto)) === proto)) {
      return false
    }
  }

  return true
}