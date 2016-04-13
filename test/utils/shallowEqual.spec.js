import expect from 'expect'
import shallowEqual from '../../src/utils/shallowEqual'
import _ from 'lodash'

describe('Utils', () => {
  describe('shallowEqual', () => {
    it('should return true if arguments fields are equal', () => {
      expect(
        shallowEqual(
          { a: 1, b: 2, c: undefined },
          { a: 1, b: 2, c: undefined }
        )
      ).toBe(true)

      expect(
        shallowEqual(
          { a: 1, b: 2, c: 3 },
          { a: 1, b: 2, c: 3 }
        )
      ).toBe(true)

      const o = {}
      expect(
        shallowEqual(
          { a: 1, b: 2, c: o },
          { a: 1, b: 2, c: o }
        )
      ).toBe(true)

      const d = function () {return 1}
      expect(
        shallowEqual(
          { a: 1, b: 2, c: o, d },
          { a: 1, b: 2, c: o, d }
        )
      ).toBe(true)

      const e = function () {return 2 }
      expect(
        shallowEqual(
          { a: 1, b: 2, c: o, d, e: e() },
          { a: 1, b: 2, c: o, d, e: e() }
        )
      ).toBe(true)
      const e1 = function () {return { a: 2 }}
      const eVal = e1()
      expect(
        shallowEqual(
          { a: 1, b: 2, c: o, d, e: eVal },
          { a: 1, b: 2, c: o, d, e: eVal }
        )
      ).toBe(true)      
    })

    it('should return false if arguments fields are different function identities', () => {
      expect(
        shallowEqual(
          { a: 1, b: 2, d: function () {return 1} },
          { a: 1, b: 2, d: function () {return 1} }
        )
      ).toBe(false)


      const e1 = function () {return { a: 2 }}
      expect(
        shallowEqual(
          { a: 1, b: 2,  e: e1() },
          { a: 1, b: 2,  e: e1() }
        )
      ).toBe(false) 

      const e2 = { b : { c : 2 } }
      expect(
        shallowEqual(
          { a: 1, b: 2,  e: _.get(e2, 'b') },
          { a: 1, b: 2,  e: _.get(e2, 'b') }
        )
      ).toBe(true) 
    })

    it('should return false if first argument has too many keys', () => {
      expect(
        shallowEqual(
          { a: 1, b: 2, c: 3 },
          { a: 1, b: 2 }
        )
      ).toBe(false)
    })

    it('should return false if second argument has too many keys', () => {
      expect(
        shallowEqual(
          { a: 1, b: 2 },
          { a: 1, b: 2, c: 3 }
        )
      ).toBe(false)
    })

    it('should return false if arguments have different keys', () => {
      expect(
        shallowEqual(
          { a: 1, b: 2, c: undefined },
          { a: 1, bb: 2, c: undefined }
        )
      ).toBe(false)
    })
  })
})
