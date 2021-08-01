import isPlainObject from '../../src/utils/isPlainObject'
import vm from 'vm'
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
})
