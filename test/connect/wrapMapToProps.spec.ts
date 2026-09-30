import type { MapToProps } from '@internal/connect/wrapMapToProps'
import { wrapMapToPropsFunc } from '@internal/connect/wrapMapToProps'
import type { Dispatch } from 'redux'

const fakeDispatch = (() => {}) as Dispatch
const fakeOptions = { displayName: 'TestComponent' }

function getDependsOnOwnProps(mapToProps: MapToProps) {
  const proxy = wrapMapToPropsFunc(mapToProps, 'mapStateToProps')(
    fakeDispatch,
    fakeOptions,
  )
  proxy({}, undefined)
  return proxy.dependsOnOwnProps
}

describe('wrapMapToProps', () => {
  describe('getDependsOnOwnProps', () => {
    it('infers dependsOnOwnProps=true from a 2-arity function with no explicit flag', () => {
      const mapToProps = (_state: unknown, _ownProps: unknown) => ({})

      expect(getDependsOnOwnProps(mapToProps)).toBe(true)
    })

    it('infers dependsOnOwnProps=false from a 1-arity function with no explicit flag', () => {
      const mapToProps = (_state: unknown) => ({})

      expect(getDependsOnOwnProps(mapToProps)).toBe(false)
    })

    it('respects an explicit dependsOnOwnProps=false even when function arity is 2', () => {
      const mapToProps = Object.assign(
        (_state: unknown, _ownProps: unknown) => ({}),
        { dependsOnOwnProps: false },
      )

      expect(getDependsOnOwnProps(mapToProps)).toBe(false)
    })

    it('respects an explicit dependsOnOwnProps=true even when function arity is 1', () => {
      const mapToProps = Object.assign((_state: unknown) => ({}), {
        dependsOnOwnProps: true,
      })

      expect(getDependsOnOwnProps(mapToProps)).toBe(true)
    })
  })
})
