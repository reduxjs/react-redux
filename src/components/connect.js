import { Component, createElement } from 'react'
import storeShape from '../utils/storeShape'
import shallowEqual from '../utils/shallowEqual'
import wrapActionCreators from '../utils/wrapActionCreators'
import warning from '../utils/warning'
import isPlainObject from 'lodash/isPlainObject'
import hoistStatics from 'hoist-non-react-statics'
import invariant from 'invariant'

const defaultMapStateToProps = state => ({}) // eslint-disable-line no-unused-vars
const defaultMapDispatchToProps = dispatch => ({ dispatch })
const defaultMergeProps = (stateProps, dispatchProps, parentProps) => ({
  ...parentProps,
  ...stateProps,
  ...dispatchProps
})

function getDisplayName(WrappedComponent) {
  return WrappedComponent.displayName || WrappedComponent.name || 'Component'
}

// Helps track hot reloading.
let nextVersion = 0

export default function connect(mapStateToProps, mapDispatchToProps, mergeProps, options = {}) {
  const shouldSubscribe = Boolean(mapStateToProps)
  const mapState = mapStateToProps || defaultMapStateToProps

  let mapDispatch
  if (typeof mapDispatchToProps === 'function') {
    mapDispatch = mapDispatchToProps
  } else if (!mapDispatchToProps) {
    mapDispatch = defaultMapDispatchToProps
  } else {
    mapDispatch = wrapActionCreators(mapDispatchToProps)
  }

  const finalMergeProps = mergeProps || defaultMergeProps
  const { pure = true, withRef = false } = options

  // Helps track hot reloading.
  const version = nextVersion++

  return function wrapWithConnect(WrappedComponent) {
    const connectDisplayName = `Connect(${getDisplayName(WrappedComponent)})`

    function checkStateShape(props, methodName) {
      if (!isPlainObject(props)) {
        warning(
          `${methodName}() in ${connectDisplayName} must return a plain object. ` +
          `Instead received ${props}.`
        )
      }
    }

    function computeMergedProps(stateProps, dispatchProps, parentProps) {
      const mergedProps = finalMergeProps(stateProps, dispatchProps, parentProps)
      if (process.env.NODE_ENV !== 'production') {
        checkStateShape(mergedProps, 'mergeProps')
      }
      return mergedProps
    }

    class Connect extends Component {

      shouldComponentUpdate() {
        if ( this.skipNextRender ) {
          this.skipNextRender = false
          return false
        }
        return true
      }

      constructor(props, context) {
        super(props, context)
        this.version = version
        this.store = props.store || context.store

        invariant(this.store,
          `Could not find "store" in either the context or ` +
          `props of "${connectDisplayName}". ` +
          `Either wrap the root component in a <Provider>, ` +
          `or explicitly pass "store" as a prop to "${connectDisplayName}".`
        )
        this.state = { }
        this.clearCache()
      }

      computeStateProps(props) {
        const state = this.store.getState()

        // Handle special case where user-provided mapStateToProps is a factory
        // We can only know it after running the function once
        if (!this.finalMapStateToProps) {
          const mappedState = mapState(state, props)
          const isFactory = typeof mappedState === 'function'
          this.finalMapStateToProps = isFactory ? mappedState : mapState
          this.doStatePropsDependOnOwnProps = this.finalMapStateToProps.length !== 1
          if (isFactory) {
            return this.computeStateProps(props)
          }
          if (process.env.NODE_ENV !== 'production') {
            checkStateShape(mappedState, 'mapStateToProps')
          }
          return mappedState
        }

        const stateProps = this.doStatePropsDependOnOwnProps ?
          this.finalMapStateToProps(state, props) :
          this.finalMapStateToProps(state)

        if (process.env.NODE_ENV !== 'production') {
          checkStateShape(stateProps, 'mapStateToProps')
        }
        return stateProps
      }

      computeDispatchProps(props) {
        const { dispatch } = this.store

        // Handle special case where user-provided mapDispatchToProps is a factory
        // We can only know it after running the function once
        if (!this.finalMapDispatchToProps) {
          const mappedDispatch = mapDispatch(dispatch, props)
          const isFactory = typeof mappedDispatch === 'function'
          this.finalMapDispatchToProps = isFactory ? mappedDispatch : mapDispatch
          this.doDispatchPropsDependOnOwnProps = this.finalMapDispatchToProps.length !== 1
          if (isFactory) {
            return this.computeDispatchProps(props)
          }
          if (process.env.NODE_ENV !== 'production') {
            checkStateShape(mappedDispatch, 'mapDispatchToProps')
          }
          return mappedDispatch
        }

        const dispatchProps = this.doDispatchPropsDependOnOwnProps ?
          this.finalMapDispatchToProps(dispatch, props) :
          this.finalMapDispatchToProps(dispatch)

        if (process.env.NODE_ENV !== 'production') {
          checkStateShape(dispatchProps, 'mapDispatchToProps')
        }
        return dispatchProps
      }

      isSubscribed() {
        return typeof this.unsubscribe === 'function'
      }

      trySubscribe() {
        if (shouldSubscribe && !this.unsubscribe) {
          this.unsubscribe = this.store.subscribe(() => {
            if (!this.unsubscribe) {
              return
            }
            if (pure && (this.store.getState() === this.state.storeState)) {
              return
            }
            this.handleChange(false,false,true)
          })
        }
        this.handleChange(true,false,false)
      }

      tryUnsubscribe() {
        if (this.unsubscribe) {
          this.unsubscribe()
          this.unsubscribe = null
        }
      }

      componentWillMount() {
        this.trySubscribe()
      }

      componentWillReceiveProps(nextProps) {
        if (pure) {
          const propsUpdated = !shallowEqual(nextProps, this.props)
          propsUpdated ?
            this.handleChange(false,true,false) :
            this.skipNextRender = true
        }
        else {
          this.handleChange(false,true,false)
        }
      }

      componentWillUnmount() {
        this.tryUnsubscribe()
        this.clearCache()
      }

      clearCache() {
        this.finalMapDispatchToProps = null
        this.finalMapStateToProps = null
        this.skipNextRender = null
      }

      handleChange(isInit,isPropsChange,isStoreStateChange) {
        try {
          this.doHandleChange(isInit,isPropsChange,isStoreStateChange)
        } catch(e) {
          this.setState({ handleChangeError: e })
        }
      }

      doHandleChange(isInit,isPropsChange,isStoreStateChange) {

        // Put outside because it's used in both the fast and normal paths
        let stateProps
        let statePropsUpdated
        const setStatePropsIfNeeded = (props) => {
          if (typeof statePropsUpdated === 'undefined') {
            stateProps = (!isInit && pure && isPropsChange && !this.doStatePropsDependOnOwnProps) ?
              this.state.stateProps :
              this.computeStateProps(props)
            statePropsUpdated = !this.state.stateProps || !shallowEqual(stateProps, this.state.stateProps)
          }
        }

        // Bail out early if we can
        if (isStoreStateChange && pure && !this.doStatePropsDependOnOwnProps) {
          setStatePropsIfNeeded(undefined) // Props not needed here
          if (!statePropsUpdated) {
            return
          }
        }

        const setStateFunction = (prevState, props) => {
          // State props
          setStatePropsIfNeeded(props)
          // Dispatch props
          const dispatchProps = (!isInit && pure && isPropsChange && !this.doDispatchPropsDependOnOwnProps) ?
            this.state.dispatchProps :
            this.computeDispatchProps(props)
          const dispatchPropsUpdated = !this.state.dispatchProps || !shallowEqual(dispatchProps, this.state.dispatchProps)
          // Merged props
          const mergedProps = (!statePropsUpdated && !dispatchPropsUpdated && !isPropsChange) ?
            this.state.mergedProps :
            computeMergedProps(stateProps, dispatchProps, props)
          const mergedPropsUpdated = !this.state.mergedProps || !shallowEqual(mergedProps, this.state.mergedProps)

          // From there we already know if we should call render or not
          if ( pure && !mergedPropsUpdated ) {
            this.skipNextRender = true
          }

          return {
            handleChangeError: undefined,
            storeState: this.store.getState(),
            stateProps,
            dispatchProps,
            mergedProps,
            mergedPropsUpdated
          }
        }

        // See #86 and #368
        // We need to avoid computing state multiple times per batch so we only run the last one
        this.lastSetStateFunction = setStateFunction
        this.setState((prevState, props) => {
          const isLast = this.lastSetStateFunction === setStateFunction
          return isLast ?
            setStateFunction(prevState,props) :
            prevState
        })
      }

      getWrappedInstance() {
        invariant(withRef,
          `To access the wrapped instance, you need to specify ` +
          `{ withRef: true } as the fourth argument of the connect() call.`
        )
        return this.refs.wrappedInstance
      }

      render() {
        if ( this.state.handleChangeError ) {
          throw this.state.handleChangeError
        }
        const finalProps = withRef ?
          ({ ...this.state.mergedProps, ref: 'wrappedInstance' }) :
          this.state.mergedProps
        return createElement(WrappedComponent,finalProps)
      }

    }

    Connect.displayName = connectDisplayName
    Connect.WrappedComponent = WrappedComponent
    Connect.contextTypes = {
      store: storeShape
    }
    Connect.propTypes = {
      store: storeShape
    }

    if (process.env.NODE_ENV !== 'production') {
      Connect.prototype.componentWillUpdate = function componentWillUpdate() {
        if (this.version === version) {
          return
        }

        // We are hot reloading!
        this.version = version
        this.clearCache()
        this.setState({},() => {
          this.trySubscribe()
        })
      }
    }

    return hoistStatics(Connect, WrappedComponent)
  }
}
