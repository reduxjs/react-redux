import shallowEqual from '../utils/shallowEqual'

export default function buildSelector({
    selectorFactory,
    dispatch,
    getState,
    ref,
    recomputationsProp,
    ...options
  }) {
  const selector = selectorFactory({
    // useful for selector factories that want to bind action creators before returning
    // their selector
    dispatch,
    // additional options passed to buildSelector are passed along to the selectorFactory
    ...options
  })

  let recomputations = 0
  let selectorProps = undefined
  let finalProps = undefined

  const mightAddProps = ref || recomputationsProp
  function getFinalProps() {
    if (!mightAddProps) return selectorProps

    // make a shallow copy so that fields added don't leak to the original selector.
    // this is especially important for 'ref' since that's a reference back to the component
    // instance. a singleton memoized selector would then be holding a reference to the instance,
    // preventing the instance from being garbage collected, and that would be bad
    const props = { ...selectorProps }
    if (ref) props.ref = ref
    if (recomputationsProp) props[recomputationsProp] = recomputations
    return props
  }

  return function runSelector(ownProps) {
    const state = getState()
    const newProps = selector(state, ownProps, dispatch)

    // wrap the source selector in a shallow equals because props objects with same properties are
    // semantically equal to React... no need to return a new object.
    if (!selectorProps || !shallowEqual(selectorProps, newProps)) {
      recomputations++
      selectorProps = newProps
      finalProps = getFinalProps()
    }

    return finalProps
  }
}
