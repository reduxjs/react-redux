import verifyPlainObject from '../utils/verifyPlainObject'

export default function makeImpurePropsSelector(
  dispatch, { mapStateToProps, mapDispatchToProps, mergeProps, displayName }
) {

  function impureMain(state, ownProps) {
    return mergeProps(
      mapStateToProps(state, ownProps),
      mapDispatchToProps(dispatch, ownProps),
      ownProps
    )
  }

  let selector = function impureFirst(state, ownProps) {
    selector = impureMain

    const stateProps = mapStateToProps(state, ownProps)
    verifyPlainObject(stateProps, displayName, 'mapStateToProps')

    const dispatchProps = mapDispatchToProps(dispatch, ownProps)
    verifyPlainObject(dispatchProps, displayName, 'mapDispatchToProps')
    
    const mergedProps = mergeProps(stateProps, dispatchProps, ownProps)
    verifyPlainObject(mergedProps, displayName, 'mergeProps')

    return mergedProps
  }

  return function impureProxy(state, props) { return selector(state, props) }
}
