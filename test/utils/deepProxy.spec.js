/* eslint-env es6 */

import {
  createDeepProxy,
  isDeepChanged,
  trackMemo,
  getUntrackedObject
} from '../../src/utils/deepProxy'

const noop = () => undefined

describe('shallow object spec', () => {
  it('no property access', () => {
    const s1 = { a: 'a', b: 'b' }
    const a1 = new WeakMap()
    const p1 = createDeepProxy(s1, a1)
    noop(p1)
    expect(isDeepChanged(s1, { a: 'a', b: 'b' }, a1)).toBe(false)
    expect(isDeepChanged(s1, { a: 'a2', b: 'b' }, a1)).toBe(false)
    expect(isDeepChanged(s1, { a: 'a', b: 'b2' }, a1)).toBe(false)
  })

  it('one property access', () => {
    const s1 = { a: 'a', b: 'b' }
    const a1 = new WeakMap()
    const p1 = createDeepProxy(s1, a1)
    noop(p1.a)
    expect(isDeepChanged(s1, { a: 'a', b: 'b' }, a1)).toBe(false)
    expect(isDeepChanged(s1, { a: 'a2', b: 'b' }, a1)).toBe(true)
    expect(isDeepChanged(s1, { a: 'a', b: 'b2' }, a1)).toBe(false)
  })
})

describe('deep object spec', () => {
  it('intermediate property access', () => {
    const s1 = { a: { b: 'b', c: 'c' } }
    const a1 = new WeakMap()
    const p1 = createDeepProxy(s1, a1)
    noop(p1.a)
    expect(isDeepChanged(s1, { a: s1.a }, a1)).toBe(false)
    expect(isDeepChanged(s1, { a: { b: 'b2', c: 'c' } }, a1)).toBe(true)
    expect(isDeepChanged(s1, { a: { b: 'b', c: 'c2' } }, a1)).toBe(true)
  })

  it('leaf property access', () => {
    const s1 = { a: { b: 'b', c: 'c' } }
    const a1 = new WeakMap()
    const p1 = createDeepProxy(s1, a1)
    noop(p1.a.b)
    expect(isDeepChanged(s1, { a: s1.a }, a1)).toBe(false)
    expect(isDeepChanged(s1, { a: { b: 'b2', c: 'c' } }, a1)).toBe(true)
    expect(isDeepChanged(s1, { a: { b: 'b', c: 'c2' } }, a1)).toBe(false)
  })
})

describe('reference equality spec', () => {
  it('simple', () => {
    const proxyCache = new WeakMap()
    const s1 = { a: 'a', b: 'b' }
    const a1 = new WeakMap()
    const p1 = createDeepProxy(s1, a1, proxyCache)
    noop(p1.a)
    const s2 = s1 // keep the reference
    const a2 = new WeakMap()
    const p2 = createDeepProxy(s2, a2, proxyCache)
    noop(p2.b)
    expect(p1).toBe(p2)
    expect(isDeepChanged(s1, { a: 'a', b: 'b' }, a1)).toBe(false)
    expect(isDeepChanged(s1, { a: 'a2', b: 'b' }, a1)).toBe(true)
    expect(isDeepChanged(s1, { a: 'a', b: 'b2' }, a1)).toBe(false)
    expect(isDeepChanged(s2, { a: 'a', b: 'b' }, a2)).toBe(false)
    expect(isDeepChanged(s2, { a: 'a2', b: 'b' }, a2)).toBe(false)
    expect(isDeepChanged(s2, { a: 'a', b: 'b2' }, a2)).toBe(true)
  })

  it('nested', () => {
    const proxyCache = new WeakMap()
    const s1 = { a: { b: 'b', c: 'c' } }
    const a1 = new WeakMap()
    const p1 = createDeepProxy(s1, a1, proxyCache)
    noop(p1.a.b)
    const s2 = { a: s1.a } // keep the reference
    const a2 = new WeakMap()
    const p2 = createDeepProxy(s2, a2, proxyCache)
    noop(p2.a.c)
    expect(p1).not.toBe(p2)
    expect(p1.a).toBe(p2.a)
    expect(isDeepChanged(s1, { a: { b: 'b', c: 'c' } }, a1)).toBe(false)
    expect(isDeepChanged(s1, { a: { b: 'b2', c: 'c' } }, a1)).toBe(true)
    expect(isDeepChanged(s1, { a: { b: 'b', c: 'c2' } }, a1)).toBe(false)
    expect(isDeepChanged(s2, { a: { b: 'b', c: 'c' } }, a2)).toBe(false)
    expect(isDeepChanged(s2, { a: { b: 'b2', c: 'c' } }, a2)).toBe(false)
    expect(isDeepChanged(s2, { a: { b: 'b', c: 'c2' } }, a2)).toBe(true)
  })
})

describe('array spec', () => {
  it('length', () => {
    const s1 = [1, 2, 3]
    const a1 = new WeakMap()
    const p1 = createDeepProxy(s1, a1)
    noop(p1.length)
    expect(isDeepChanged(s1, [1, 2, 3], a1)).toBe(false)
    expect(isDeepChanged(s1, [1, 2, 3, 4], a1)).toBe(true)
    expect(isDeepChanged(s1, [1, 2], a1)).toBe(true)
    expect(isDeepChanged(s1, [1, 2, 4], a1)).toBe(false)
  })

  it('forEach', () => {
    const s1 = [1, 2, 3]
    const a1 = new WeakMap()
    const p1 = createDeepProxy(s1, a1)
    p1.forEach(noop)
    expect(isDeepChanged(s1, [1, 2, 3], a1)).toBe(false)
    expect(isDeepChanged(s1, [1, 2, 3, 4], a1)).toBe(true)
    expect(isDeepChanged(s1, [1, 2], a1)).toBe(true)
    expect(isDeepChanged(s1, [1, 2, 4], a1)).toBe(true)
  })

  it('for-of', () => {
    const s1 = [1, 2, 3]
    const a1 = new WeakMap()
    const p1 = createDeepProxy(s1, a1)
    // eslint-disable-next-line no-restricted-syntax
    for (const x of p1) {
      noop(x)
    }
    expect(isDeepChanged(s1, [1, 2, 3], a1)).toBe(false)
    expect(isDeepChanged(s1, [1, 2, 3, 4], a1)).toBe(true)
    expect(isDeepChanged(s1, [1, 2], a1)).toBe(true)
    expect(isDeepChanged(s1, [1, 2, 4], a1)).toBe(true)
  })
})

describe('keys spec', () => {
  it('object keys', () => {
    const s1 = { a: { b: 'b' }, c: 'c' }
    const a1 = new WeakMap()
    const p1 = createDeepProxy(s1, a1)
    noop(Object.keys(p1))
    expect(isDeepChanged(s1, { a: s1.a, c: 'c' }, a1)).toBe(false)
    expect(isDeepChanged(s1, { a: { b: 'b' }, c: 'c' }, a1)).toBe(false)
    expect(isDeepChanged(s1, { a: s1.a }, a1)).toBe(true)
    expect(isDeepChanged(s1, { a: s1.a, c: 'c', d: 'd' }, a1)).toBe(true)
  })

  it('for-in', () => {
    const s1 = { a: { b: 'b' }, c: 'c' }
    const a1 = new WeakMap()
    const p1 = createDeepProxy(s1, a1)
    // eslint-disable-next-line no-restricted-syntax, guard-for-in
    for (const k in p1) {
      noop(k)
    }
    expect(isDeepChanged(s1, { a: s1.a, c: 'c' }, a1)).toBe(false)
    expect(isDeepChanged(s1, { a: { b: 'b' }, c: 'c' }, a1)).toBe(false)
    expect(isDeepChanged(s1, { a: s1.a }, a1)).toBe(true)
    expect(isDeepChanged(s1, { a: s1.a, c: 'c', d: 'd' }, a1)).toBe(true)
  })

  it('single in operator', () => {
    const s1 = { a: { b: 'b' }, c: 'c' }
    const a1 = new WeakMap()
    const p1 = createDeepProxy(s1, a1)
    noop('a' in p1)
    expect(isDeepChanged(s1, { a: s1.a, c: 'c' }, a1)).toBe(false)
    expect(isDeepChanged(s1, { a: s1.a }, a1)).toBe(false)
    expect(isDeepChanged(s1, { c: 'c', d: 'd' }, a1)).toBe(true)
  })
})

describe('special objects spec', () => {
  it('object with cycles', () => {
    const proxyCache = new WeakMap()
    const s1 = { a: 'a' }
    s1.self = s1
    const a1 = new WeakMap()
    const p1 = createDeepProxy(s1, a1, proxyCache)
    const c1 = new WeakMap()
    noop(p1.self.a)
    expect(isDeepChanged(s1, s1, a1, c1)).toBe(false)
    expect(isDeepChanged(s1, { a: 'a', self: s1 }, a1, c1)).toBe(false)
    const s2 = { a: 'a' }
    s2.self = s2
    expect(isDeepChanged(s1, s2, a1, c1)).toBe(false)
    const s3 = { a: 'a2' }
    s3.self = s3
    expect(isDeepChanged(s1, s3, a1, c1)).toBe(true)
  })

  it('object with cycles 2', () => {
    const proxyCache = new WeakMap()
    const s1 = { a: { b: 'b' } }
    s1.self = s1
    const a1 = new WeakMap()
    const p1 = createDeepProxy(s1, a1, proxyCache)
    const c1 = new WeakMap()
    noop(p1.self.a)
    expect(isDeepChanged(s1, s1, a1, c1)).toBe(false)
    expect(isDeepChanged(s1, { a: s1.a, self: s1 }, a1, c1)).toBe(false)
    const s2 = { a: { b: 'b' } }
    s2.self = s2
    expect(isDeepChanged(s1, s2, a1, c1)).toBe(true)
  })

  it('frozen object', () => {
    const proxyCache = new WeakMap()
    const s1 = { a: { b: 'b' } }
    Object.freeze(s1)
    const a1 = new WeakMap()
    const p1 = createDeepProxy(s1, a1, proxyCache)
    noop(p1.a.b)
    expect(isDeepChanged(s1, s1, a1)).toBe(false)
    expect(isDeepChanged(s1, { a: { b: 'b' } }, a1)).toBe(false)
    expect(isDeepChanged(s1, { a: { b: 'b2' } }, a1)).toBe(true)
  })
})

describe('builtin objects spec', () => {
  // we can't track builtin objects

  it('boolean', () => {
    /* eslint-disable no-new-wrappers */
    const proxyCache = new WeakMap()
    const s1 = { a: new Boolean(false) }
    const a1 = new WeakMap()
    const p1 = createDeepProxy(s1, a1, proxyCache)
    noop(p1.a.valueOf())
    expect(isDeepChanged(s1, s1, a1)).toBe(false)
    expect(isDeepChanged(s1, { a: new Boolean(false) }, a1)).toBe(true)
    /* eslint-enable no-new-wrappers */
  })

  it('error', () => {
    const proxyCache = new WeakMap()
    const s1 = { a: new Error('e') }
    const a1 = new WeakMap()
    const p1 = createDeepProxy(s1, a1, proxyCache)
    noop(p1.a.message)
    expect(isDeepChanged(s1, s1, a1)).toBe(false)
    expect(isDeepChanged(s1, { a: new Error('e') }, a1)).toBe(true)
  })

  it('date', () => {
    const proxyCache = new WeakMap()
    const s1 = { a: new Date('2019-05-11T12:22:29.293Z') }
    const a1 = new WeakMap()
    const p1 = createDeepProxy(s1, a1, proxyCache)
    noop(p1.a.getTime())
    expect(isDeepChanged(s1, s1, a1)).toBe(false)
    expect(
      isDeepChanged(s1, { a: new Date('2019-05-11T12:22:29.293Z') }, a1)
    ).toBe(true)
  })

  it('regexp', () => {
    const proxyCache = new WeakMap()
    const s1 = { a: /a/ }
    const a1 = new WeakMap()
    const p1 = createDeepProxy(s1, a1, proxyCache)
    noop(p1.a.test('a'))
    expect(isDeepChanged(s1, s1, a1)).toBe(false)
    expect(isDeepChanged(s1, { a: /a/ }, a1)).toBe(true)
  })

  it('map', () => {
    const proxyCache = new WeakMap()
    const s1 = { a: new Map() }
    const a1 = new WeakMap()
    const p1 = createDeepProxy(s1, a1, proxyCache)
    noop(p1.a.entries())
    expect(isDeepChanged(s1, s1, a1)).toBe(false)
    expect(isDeepChanged(s1, { a: new Map() }, a1)).toBe(true)
  })

  it('typed array', () => {
    const proxyCache = new WeakMap()
    const s1 = { a: Int8Array.from([1]) }
    const a1 = new WeakMap()
    const p1 = createDeepProxy(s1, a1, proxyCache)
    noop(p1.a[0])
    expect(isDeepChanged(s1, s1, a1)).toBe(false)
    expect(isDeepChanged(s1, { a: Int8Array.from([1]) }, a1)).toBe(true)
  })
})

describe('object tracking', () => {
  it('should fail without trackMemo', () => {
    const proxyCache = new WeakMap()
    const s1 = { a: { b: 1, c: 2 } }
    const a1 = new WeakMap()
    const p1 = createDeepProxy(s1, a1, proxyCache)
    noop(p1.a.b)
    expect(isDeepChanged(s1, { a: s1.a }, a1)).toBe(false)
    expect(isDeepChanged(s1, { a: { b: 3, c: 2 } }, a1)).toBe(true)
    expect(isDeepChanged(s1, { a: { b: 1, c: 3 } }, a1)).not.toBe(true)
  })

  it('should work with trackMemo', () => {
    const proxyCache = new WeakMap()
    const s1 = { a: { b: 1, c: 2 } }
    const a1 = new WeakMap()
    const p1 = createDeepProxy(s1, a1, proxyCache)
    noop(p1.a.b)
    trackMemo(p1.a)
    expect(isDeepChanged(s1, { a: s1.a }, a1)).toBe(false)
    expect(isDeepChanged(s1, { a: { b: 3, c: 2 } }, a1)).toBe(true)
    expect(isDeepChanged(s1, { a: { b: 1, c: 3 } }, a1)).toBe(true)
  })

  it('should work with trackMemo in advance', () => {
    const proxyCache = new WeakMap()
    const s1 = { a: { b: 1, c: 2 } }
    const a1 = new WeakMap()
    const p1 = createDeepProxy(s1, a1, proxyCache)
    trackMemo(p1.a)
    noop(p1.a.b)
    expect(isDeepChanged(s1, { a: s1.a }, a1)).toBe(false)
    expect(isDeepChanged(s1, { a: { b: 3, c: 2 } }, a1)).toBe(true)
    expect(isDeepChanged(s1, { a: { b: 1, c: 3 } }, a1)).toBe(true)
  })
})

describe('object tracking two level deep', () => {
  it('should fail without trackMemo', () => {
    const proxyCache = new WeakMap()
    const s1 = { x: { a: { b: 1, c: 2 } } }
    const a1 = new WeakMap()
    const p1 = createDeepProxy(s1, a1, proxyCache)
    noop(p1.x.a.b)
    expect(isDeepChanged(s1, { x: { a: s1.x.a } }, a1)).toBe(false)
    expect(isDeepChanged(s1, { x: { a: { b: 3, c: 2 } } }, a1)).toBe(true)
    expect(isDeepChanged(s1, { x: { a: { b: 1, c: 3 } } }, a1)).not.toBe(true)
  })

  it('should work with trackMemo', () => {
    const proxyCache = new WeakMap()
    const s1 = { x: { a: { b: 1, c: 2 } } }
    const a1 = new WeakMap()
    const p1 = createDeepProxy(s1, a1, proxyCache)
    noop(p1.x.a.b)
    trackMemo(p1.x.a)
    expect(isDeepChanged(s1, { x: { a: s1.x.a } }, a1)).toBe(false)
    expect(isDeepChanged(s1, { x: { a: { b: 3, c: 2 } } }, a1)).toBe(true)
    expect(isDeepChanged(s1, { x: { a: { b: 1, c: 3 } } }, a1)).toBe(true)
  })

  it('should work with trackMemo in advance', () => {
    const proxyCache = new WeakMap()
    const s1 = { x: { a: { b: 1, c: 2 } } }
    const a1 = new WeakMap()
    const p1 = createDeepProxy(s1, a1, proxyCache)
    trackMemo(p1.x.a)
    noop(p1.x.a.b)
    expect(isDeepChanged(s1, { x: { a: s1.x.a } }, a1)).toBe(false)
    expect(isDeepChanged(s1, { x: { a: { b: 3, c: 2 } } }, a1)).toBe(true)
    expect(isDeepChanged(s1, { x: { a: { b: 1, c: 3 } } }, a1)).toBe(true)
  })
})

describe('object tracking', () => {
  it('should get untracked object', () => {
    const proxyCache = new WeakMap()
    const s1 = { a: { b: 1, c: 2 } }
    const a1 = new WeakMap()
    const p1 = createDeepProxy(s1, a1, proxyCache)
    noop(p1.a.b)
    expect(p1).not.toBe(s1)
    expect(p1.a).not.toBe(s1.a)
    expect(p1.a.b).toBe(s1.a.b)
    expect(getUntrackedObject(p1)).toBe(s1)
    expect(getUntrackedObject(p1.a)).toBe(s1.a)
    expect(getUntrackedObject(p1.a.b)).toBe(null)
  })
})
