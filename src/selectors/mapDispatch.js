import { bindActionCreators } from 'redux'
import createFactoryAwareSelector from './createFactoryAwareSelector'

export function whenMapDispatchIsMissing({ mapDispatchToProps, dispatch }) {
  if (!mapDispatchToProps) {
    const dispatchProp = { dispatch }
    return () => dispatchProp
  }
}

export function whenMapDispatchIsObject({ mapDispatchToProps, dispatch }) {
  if (mapDispatchToProps && typeof mapDispatchToProps === 'object') {
    const bound = bindActionCreators(mapDispatchToProps, dispatch)
    return () => bound
  }
}

export function whenMapDispatchIsFunction({ mapDispatchToProps, pure, dispatch }) {
  if (typeof mapDispatchToProps === 'function') {
    return createFactoryAwareSelector(pure, () => dispatch, mapDispatchToProps)    
  }
}

export default [
  whenMapDispatchIsMissing,
  whenMapDispatchIsFunction,
  whenMapDispatchIsObject
]
