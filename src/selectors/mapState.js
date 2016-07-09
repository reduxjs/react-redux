import createFactoryAwareSelector from './createFactoryAwareSelector'

export function whenMapStateIsMissing({ mapStateToProps }) {
  if (!mapStateToProps) {
    const empty = {}
    return () => empty
  }
}

export function whenMapStateIsFunction({ mapStateToProps, pure }) {
  if (typeof mapStateToProps === 'function') {
    return createFactoryAwareSelector(pure, mapStateToProps)
  }
}

export default [
  whenMapStateIsMissing,
  whenMapStateIsFunction
]
