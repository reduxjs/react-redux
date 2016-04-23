import expect from 'expect'
import shallowEqual from '../../src/utils/shallowEqual'

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
    })

    it('should return false if arguments fields are different function identities', () => {
      expect(
        shallowEqual(
          { a: 1, b: 2, d: function () {return 1} },
          { a: 1, b: 2, d: function () {return 1} }
        )
      ).toBe(false)
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
