const hasOwn = Object.prototype.hasOwnProperty

export default function shallowEqual(objA, objB) {
  if (objA === objB) {
    return true
  }

  const keysA = Object.keys(objA)
  const keysB = Object.keys(objB)
  const lengthA = keysA.length

  if (lengthA !== keysB.length) {
    return false
  }

  // Test for A's keys different from B.
  for (let i = 0; i < lengthA; i++) {
    const key = keysA[i]
    if (!hasOwn.call(objB, key) || objA[key] !== objB[key]) {
      return false
    }
  }

  return true
}
