import { wrapMapToPropsFunc } from '@internal/connect/wrapMapToProps'
import type { Dispatch } from 'redux'

const fakeDispatch = (() => {}) as Dispatch
const fakeOptions = { displayName: 'TestComponent' }

describe('wrapMapToProps', () => {
  describe('getDependsOnOwnProps', () => {
    it('infers dependsOnOwnProps=true from a 2-arity function with no explicit flag', () => {
      const mapToProps = (_state: any, _ownProps: any) => ({})
      const proxy = wrapMapToPropsFunc(mapToProps, 'mapStateToProps')(
        fakeDispatch,
        fakeOptions,
      )
      proxy({}, undefined)
      expect(proxy.dependsOnOwnProps).toBe(true)
    })

    it('infers dependsOnOwnProps=false from a 1-arity function with no explicit flag', () => {
      const mapToProps = (_state: any) => ({})
      const proxy = wrapMapToPropsFunc(mapToProps, 'mapStateToProps')(
        fakeDispatch,
        fakeOptions,
      )
      proxy({}, undefined)
      expect(proxy.dependsOnOwnProps).toBe(false)
    })

    it('respects an explicit dependsOnOwnProps=false even when function arity is 2', () => {
      // This is the bug: a 2-arg function with dependsOnOwnProps=false set
      // should have the explicit flag honoured, not be overridden by the
      // length heuristic.
      const mapToProps = (_state: any, _ownProps: any) => ({})
      ;(mapToProps as any).dependsOnOwnProps = false

      const proxy = wrapMapToPropsFunc(mapToProps, 'mapStateToProps')(
        fakeDispatch,
        fakeOptions,
      )
      proxy({}, undefined)
      // Before the fix: proxy.dependsOnOwnProps === true  (bug – length heuristic wins)
      // After the fix:  proxy.dependsOnOwnProps === false (explicit flag is respected)
      expect(proxy.dependsOnOwnProps).toBe(false)
    })

    it('respects an explicit dependsOnOwnProps=true even when function arity is 1', () => {
      const mapToProps = (_state: any) => ({})
      ;(mapToProps as any).dependsOnOwnProps = true

      const proxy = wrapMapToPropsFunc(mapToProps, 'mapStateToProps')(
        fakeDispatch,
        fakeOptions,
      )
      proxy({}, undefined)
      expect(proxy.dependsOnOwnProps).toBe(true)
    })
  })
})
