import wrapActionCreators from '../../src/utils/wrapActionCreators'

describe('Utils', () => {
  describe('wrapActionCreators', () => {
    it('should return a function that wraps argument in a call to bindActionCreators', () => {

      function dispatch(action) {
        return {
          dispatched: action
        }
      }

      const actionResult = { an: 'action' }

      const actionCreators = {
        action: () => actionResult
      }

      const wrapped = wrapActionCreators(actionCreators)
      expect(wrapped).toBeInstanceOf(Function)
      expect(() => wrapped(dispatch)).not.toThrow()
      expect(() => wrapped().action()).toThrow()

      const bound = wrapped(dispatch)
      expect(bound.action).not.toThrow()
      expect(bound.action().dispatched).toBe(actionResult)

    })
  })
})
