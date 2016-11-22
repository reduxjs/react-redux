export default function shallowEqual(objA, objB) {
  if (objA === objB) {
    return true
  }

  const keysA = Object.keys(objA)
  const keysB = Object.keys(objB)

  if (keysA.length !== keysB.length) {
    return false
  }

  // Test for A's keys different from B.
  const hasOwn = Object.prototype.hasOwnProperty
  return !keysA.some( key => {
    if (!hasOwn.call(objB, key) ||
        objA[key] !== objB[key]) {
      return true
    }
    return false
  })
}
