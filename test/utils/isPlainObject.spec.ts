import isPlainObject from '@internal/utils/isPlainObject'
import vm from 'node:vm'
class Test {}
describe('isPlainObject', () => {
  it('returns true only if plain object', () => {
    const sandbox = { fromAnotherRealm: false }
    vm.runInNewContext('fromAnotherRealm = {}', sandbox)

    expect(isPlainObject(sandbox.fromAnotherRealm)).toBe(true)
    expect(isPlainObject(new Test())).toBe(false)
    expect(isPlainObject(new Date())).toBe(false)
    expect(isPlainObject([1, 2, 3])).toBe(false)
    expect(isPlainObject(null)).toBe(false)
    //@ts-expect-error
    expect(isPlainObject()).toBe(false)
    expect(isPlainObject({ x: 1, y: 2 })).toBe(true)
    expect(isPlainObject(Object.create(null))).toBe(true)
  })
  it('returns false for an object whose prototype is a non-Object.prototype null-proto object', () => {
    // Object.create(null) creates a null-proto object that is NOT Object.prototype.
    // Object.create(Object.create(null)) therefore has a prototype that is a root
    // but not Object.prototype — it should NOT be considered plain.
    expect(isPlainObject(Object.create(Object.create(null)))).toBe(false)
  })
})
