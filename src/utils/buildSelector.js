import shallowEqual from '../utils/shallowEqual'

export default function buildSelector({
    selectorFactory,
    dispatch,
    getState,
    ref,
    recomputationsProp,
    ...options
  }) {
  // the final props obect is mutated directly instead of projecting into a new object to avoid
  // some extra object creation and tracking.
  const mightMutateProps = ref || recomputationsProp
  function mutateProps(newProps, recomputations) {
    if (!mightMutateProps) return newProps

    // make a shallow copy so that fields added by mutateProps don't leak to the original selector.
    // this is especially important for 'ref' since that's a reference back to the component
    // instance. a singleton memoized selector would then be holding a reference to the instance,
    // preventing the instance from being garbage collected
    const props = { ...newProps }
    if (ref) props.ref = ref
    if (recomputationsProp) props[recomputationsProp] = recomputations
    return props
  }

  const selector = selectorFactory({
    // useful for selecto factories that want to bind action creators before returning
    // their selector
    dispatch,
    // additional options passed to buildSelector are passed along to the selectorFactory
    ...options
  })

  let recomputations = 0
  let selectedProps = undefined
  let finalProps = undefined
  return function runSelector(ownProps) {
    const state = getState()
    const newProps = selector(state, ownProps, dispatch)

    // wrap the source selector in a shallow equals because props objects with same properties are
    // semantically equal to React... no need to re-render.
    if (!selectedProps || !shallowEqual(selectedProps, newProps)) {
      recomputations++
      selectedProps = newProps
      finalProps = mutateProps(newProps, recomputations)
    }

    return finalProps
  }
}
