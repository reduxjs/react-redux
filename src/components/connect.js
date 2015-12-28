import { Component, createElement } from 'react'
import storeShape from '../utils/storeShape'
import shallowEqual from '../utils/shallowEqual'
import isPlainObject from '../utils/isPlainObject'
import wrapActionCreators from '../utils/wrapActionCreators'
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

export function connectComponent(mapStateToPropsFactory, mapDispatchToPropsFactory, mergeProps, options = {}) {
  const finalMapStateToPropsFactory = mapStateToPropsFactory || (() => defaultMapStateToProps)
  const finalMapDispatchToPropsFactory = mapDispatchToPropsFactory || (() => defaultMapDispatchToProps)
  const finalMergeProps = mergeProps || defaultMergeProps
  const { pure = true, withRef = false } = options

  // Helps track hot reloading.
  const version = nextVersion++

  return function wrapWithConnect(WrappedComponent) {
    class Connect extends Component {
      shouldComponentUpdate() {
        return !pure || this.haveOwnPropsChanged || this.hasStoreStateChanged
      }

      constructor(props, context) {
        super(props, context)
        this.version = version
        this.store = props.store || context.store

        invariant(this.store,
          `Could not find "store" in either the context or ` +
          `props of "${this.constructor.displayName}". ` +
          `Either wrap the root component in a <Provider>, ` +
          `or explicitly pass "store" as a prop to "${this.constructor.displayName}".`
        )

        this.configure()
        const storeState = this.store.getState()
        this.state = { storeState }
        this.clearCache()
      }

      configure() {
        this.shouldSubscribe = Boolean(mapStateToPropsFactory)
        this.finalMapStateToProps = finalMapStateToPropsFactory()
        this.finalMapDispatchToProps = finalMapDispatchToPropsFactory()
        this.doStatePropsDependOnOwnProps = this.finalMapStateToProps.length !== 1
        this.doDispatchPropsDependOnOwnProps = this.finalMapDispatchToProps.length !== 1
      }

      computeStateProps(store, props) {
        const state = store.getState()
        const stateProps = this.doStatePropsDependOnOwnProps ?
          this.finalMapStateToProps(state, props) :
          this.finalMapStateToProps(state)

        invariant(
          isPlainObject(stateProps),
          '`mapStateToProps` must return an object. Instead received %s.',
          stateProps
        )
        return stateProps
      }

      computeDispatchProps(store, props) {
        const { dispatch } = store
        const dispatchProps = this.doDispatchPropsDependOnOwnProps ?
          this.finalMapDispatchToProps(dispatch, props) :
          this.finalMapDispatchToProps(dispatch)

        invariant(
          isPlainObject(dispatchProps),
          '`mapDispatchToProps` must return an object. Instead received %s.',
          dispatchProps
        )
        return dispatchProps
      }

      computeMergedProps(stateProps, dispatchProps, parentProps) {
        const mergedProps = finalMergeProps(stateProps, dispatchProps, parentProps)
        invariant(
          isPlainObject(mergedProps),
          '`mergeProps` must return an object. Instead received %s.',
          mergedProps
        )
        return mergedProps
      }

      updateStatePropsIfNeeded() {
        const nextStateProps = this.computeStateProps(this.store, this.props)
        if (this.stateProps && shallowEqual(nextStateProps, this.stateProps)) {
          return false
        }

        this.stateProps = nextStateProps
        return true
      }

      updateDispatchPropsIfNeeded() {
        const nextDispatchProps = this.computeDispatchProps(this.store, this.props)
        if (this.dispatchProps && shallowEqual(nextDispatchProps, this.dispatchProps)) {
          return false
        }

        this.dispatchProps = nextDispatchProps
        return true
      }

      updateMergedProps() {
        this.mergedProps = this.computeMergedProps(
          this.stateProps,
          this.dispatchProps,
          this.props
        )
      }

      isSubscribed() {
        return typeof this.unsubscribe === 'function'
      }

      trySubscribe() {
        if (this.shouldSubscribe && !this.unsubscribe) {
          this.unsubscribe = this.store.subscribe(() => this.handleChange())
          this.handleChange()
        }
      }

      tryUnsubscribe() {
        if (this.unsubscribe) {
          this.unsubscribe()
          this.unsubscribe = null
        }
      }

      componentDidMount() {
        this.trySubscribe()
      }

      componentWillReceiveProps(nextProps) {
        if (!pure || !shallowEqual(nextProps, this.props)) {
          this.haveOwnPropsChanged = true
        }
      }

      componentWillUnmount() {
        this.tryUnsubscribe()
        this.clearCache()
      }

      clearCache() {
        this.dispatchProps = null
        this.stateProps = null
        this.mergedProps = null
        this.haveOwnPropsChanged = true
        this.hasStoreStateChanged = true
        this.renderedElement = null
      }

      handleChange() {
        if (!this.unsubscribe) {
          return
        }

        const prevStoreState = this.state.storeState
        const storeState = this.store.getState()

        if (!pure || prevStoreState !== storeState) {
          this.hasStoreStateChanged = true
          this.setState({ storeState })
        }
      }

      getWrappedInstance() {
        invariant(withRef,
          `To access the wrapped instance, you need to specify ` +
          `{ withRef: true } as the fourth argument of the connect() call.`
        )

        return this.refs.wrappedInstance
      }

      render() {
        const {
          haveOwnPropsChanged,
          hasStoreStateChanged,
          renderedElement
        } = this

        this.haveOwnPropsChanged = false
        this.hasStoreStateChanged = false

        let shouldUpdateStateProps = true
        let shouldUpdateDispatchProps = true
        if (pure && renderedElement) {
          shouldUpdateStateProps = hasStoreStateChanged || (
            haveOwnPropsChanged && this.doStatePropsDependOnOwnProps
          )
          shouldUpdateDispatchProps =
            haveOwnPropsChanged && this.doDispatchPropsDependOnOwnProps
        }

        let haveStatePropsChanged = false
        let haveDispatchPropsChanged = false
        if (shouldUpdateStateProps) {
          haveStatePropsChanged = this.updateStatePropsIfNeeded()
        }
        if (shouldUpdateDispatchProps) {
          haveDispatchPropsChanged = this.updateDispatchPropsIfNeeded()
        }

        let haveMergedPropsChanged = true
        if (
          haveStatePropsChanged ||
          haveDispatchPropsChanged ||
          haveOwnPropsChanged
        ) {
          this.updateMergedProps()
        } else {
          haveMergedPropsChanged = false
        }

        if (!haveMergedPropsChanged && renderedElement) {
          return renderedElement
        }

        if (withRef) {
          this.renderedElement = createElement(WrappedComponent, {
            ...this.mergedProps,
            ref: 'wrappedInstance'
          })
        } else {
          this.renderedElement = createElement(WrappedComponent,
            this.mergedProps
          )
        }

        return this.renderedElement
      }
    }

    Connect.displayName = `Connect(${getDisplayName(WrappedComponent)})`
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
        this.configure()
        this.trySubscribe()
        this.clearCache()
      }
    }

    return hoistStatics(Connect, WrappedComponent)
  }
}

export function connect(mapStateToProps, mapDispatchToProps, mergeProps, options) {
  const configuredMapDispatch = isPlainObject(mapDispatchToProps) ?
    wrapActionCreators(mapDispatchToProps) :
    mapDispatchToProps
  return connectComponent(
    mapStateToProps ? (() => mapStateToProps) : null,
    configuredMapDispatch ? (() => configuredMapDispatch) : null,
    mergeProps,
    options
  )
}
