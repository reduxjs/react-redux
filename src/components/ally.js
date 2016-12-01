import { Component, PropTypes, createElement } from 'react'
import storeShape from '../utils/storeShape'
import fieldShape from '../utils/fieldShape'
import shallowEqual from '../utils/shallowEqual'
import wrapActionCreators from '../utils/wrapActionCreators'
import warning from '../utils/warning'
import combinePath from '../utils/combinePath'
import allySet from '../actions/set';
import isPlainObject from 'lodash/isPlainObject'
import lodashMerge from 'lodash/merge'
import noop from 'lodash/noop'
import lodashGet from 'lodash/get'
import hoistStatics from 'hoist-non-react-statics'
import invariant from 'invariant'

const DefaultFieldType = 'instance';
const defaultMapStateToProps = state => ({}) // eslint-disable-line no-unused-vars
const defaultMapDispatchToProps = dispatch => ({ dispatch })
const defaultMergeProps = (stateProps, dispatchProps, parentProps, allyProps) => ({
  ...parentProps,
  ...stateProps,
  ...allyProps,
  ...dispatchProps
});

function getDisplayName(WrappedComponent) {
  return WrappedComponent.displayName || WrappedComponent.name || 'Component'
}

function sanitizeFields(fields) {
  for (const fieldName of Object.keys(fields)) {
    const field = fields[fieldName];
    field.name = field.name || fieldName;
    field.path = field.path || fieldName;
    field.type = field.type || DefaultFieldType;
    field.readonly = !!field.readonly;
  }
}

let errorObject = { value: null }
function tryCatch(fn, ctx) {
  try {
    return fn.apply(ctx)
  } catch (e) {
    errorObject.value = e
    return errorObject
  }
}

// Helps track hot reloading.
let nextVersion = 0;

// export default function ally(mapStateToProps, mapDispatchToProps, mergeProps, options = {}) {
export default function ally(allyOptions = {}) {
  const defaultAllyOptions = {
    fields: {},
    mapStateToProps: null,
    mapDispatchToProps: null,
    mergeProps: null,
    options: {}
  };
  allyOptions = Object.assign({}, defaultAllyOptions, allyOptions);
  const {fields, mapStateToProps, mapDispatchToProps, mergeProps, options} = allyOptions;

  const shouldSubscribe = Boolean(mapStateToProps || fields.length > 0);
  const mapState = mapStateToProps || defaultMapStateToProps;

  let mapDispatch;
  if (typeof mapDispatchToProps === 'function') {
    mapDispatch = mapDispatchToProps
  } else if (!mapDispatchToProps) {
    mapDispatch = defaultMapDispatchToProps
  } else {
    mapDispatch = wrapActionCreators(mapDispatchToProps)
  }

  const finalMergeProps = mergeProps || defaultMergeProps;
  const { pure = true, withRef = false } = options;
  const checkMergedEquals = pure && finalMergeProps !== defaultMergeProps;

  sanitizeFields(fields);

  // Helps track hot reloading.
  const version = nextVersion++;

  return function wrapWithAlly(WrappedComponent) {
    const allyDisplayName = `Ally(${getDisplayName(WrappedComponent)})`;

    function checkStateShape(props, methodName) {
      if (!isPlainObject(props)) {
        warning(
          `${methodName}() in ${allyDisplayName} must return a plain object. ` +
          `Instead received ${props}.`
        )
      }
    }

    function computeMergedProps(stateProps, dispatchProps, parentProps, allyProps) {
      const mergedProps = finalMergeProps(stateProps, dispatchProps, parentProps, allyProps)
      if (process.env.NODE_ENV !== 'production') {
        checkStateShape(mergedProps, 'mergeProps')
      }
      return mergedProps
    }

    let instanceNumber = 1;

    class Ally extends Component {
      shouldComponentUpdate() {
        return !pure || this.haveOwnPropsChanged || this.hasStoreStateChanged
      }

      constructor(props, context) {
        super(props, context)
        this.version = version
        this.store = props.store || context.store

        invariant(this.store,
          `Could not find "store" in either the context or ` +
          `props of "${allyDisplayName}". ` +
          `Either wrap the root component in a <Provider>, ` +
          `or explicitly pass "store" as a prop to "${allyDisplayName}".`
        )

        const storeState = this.store.getState()
        this.state = { storeState }
        this.clearCache()
        this.initializeAllyPropsWithDefaults()
        this.componentName = getDisplayName(WrappedComponent)
        this.instanceNumber = instanceNumber++
      }
      
      initializeAllyPropsWithDefaults() {
        this.allyProps = {};
        for (var fieldName of Object.keys(fields)) {
          const field = fields[fieldName];
          const {defaultValue, name} = field;
          this.allyProps[name] = defaultValue;
        }
      }

      computeStateProps(store, props) {
        if (!this.finalMapStateToProps) {
          return this.configureFinalMapState(store, props)
        }

        const state = store.getState()
        const stateProps = this.doStatePropsDependOnOwnProps ?
          this.finalMapStateToProps(state, props) :
          this.finalMapStateToProps(state)

        if (process.env.NODE_ENV !== 'production') {
          checkStateShape(stateProps, 'mapStateToProps')
        }
        return stateProps
      }

      configureFinalMapState(store, props) {
        const mappedState = mapState(store.getState(), props)
        const isFactory = typeof mappedState === 'function'

        this.finalMapStateToProps = isFactory ? mappedState : mapState
        this.doStatePropsDependOnOwnProps = this.finalMapStateToProps.length !== 1

        if (isFactory) {
          return this.computeStateProps(store, props)
        }

        if (process.env.NODE_ENV !== 'production') {
          checkStateShape(mappedState, 'mapStateToProps')
        }
        return mappedState
      }

      computeDispatchProps(store, props) {
        if (!this.finalMapDispatchToProps) {
          return this.configureFinalMapDispatch(store, props)
        }

        const { dispatch } = store
        const dispatchProps = this.doDispatchPropsDependOnOwnProps ?
          this.finalMapDispatchToProps(dispatch, props) :
          this.finalMapDispatchToProps(dispatch)

        if (process.env.NODE_ENV !== 'production') {
          checkStateShape(dispatchProps, 'mapDispatchToProps')
        }
        return dispatchProps
      }

      configureFinalMapDispatch(store, props) {
        const mappedDispatch = mapDispatch(store.dispatch, props)
        const isFactory = typeof mappedDispatch === 'function'

        this.finalMapDispatchToProps = isFactory ? mappedDispatch : mapDispatch
        this.doDispatchPropsDependOnOwnProps = this.finalMapDispatchToProps.length !== 1

        if (isFactory) {
          return this.computeDispatchProps(store, props)
        }

        if (process.env.NODE_ENV !== 'production') {
          checkStateShape(mappedDispatch, 'mapDispatchToProps')
        }
        return mappedDispatch
      }

      computeAllyProps() {
        this.configureFieldsForAlly();
        const allyProps = {
          allyFields: this.fields,
          allyComponentName: this.componentName,
          allyInstanceNumber: this.instanceNumber
        };
        
        var precomputedMergedProps = computeMergedProps(this.stateProps, this.dispatchProps, this.props, this.allyProps);
        
        //  these properties are so that the most up to date information is used
        //  when computing properties
        for (const fieldName of Object.keys(this.fields)) {
          const field = this.fields[fieldName];
          Object.defineProperty(precomputedMergedProps, field.name, {
            configurable: true,
            enumerable: true,
            get: field.finalGetter,
            set: noop
          })
        }
        
        this.allyInstanceData = {
          props: precomputedMergedProps,
          state: this.state.storeState,
          dispatch: this.store.dispatch
        };
        for (const fieldName of Object.keys(this.fields)) {
          const field = this.fields[fieldName];
          const {name, setterName, finalSetter} = field;
          tryCatch(field.updatePath, this.allyInstanceData);
          allyProps[name] = field.finalGetter();
          if (!field.readonly) {
            allyProps[setterName] = finalSetter;
          }
        }
        if (process.env.NODE_ENV !== 'production') {
          checkStateShape(allyProps, 'mapDispatchToProps')
        }
        return allyProps;
      }

      configureFieldsForAlly() {
        if (this.fields) {
          return this.fields;
        }
        const instanceFields = {...fields};
        for (const fieldName of Object.keys(instanceFields)) {
          const field = instanceFields[fieldName];
          const {
              name,
              type,
              defaultValue,
              getter,
              setter,
              readonly
          } = field;
          let path = field.path;
          const pathPrefix = [];
          switch(type) {
            case 'component':
                pathPrefix.push(this.componentName);
                break;
            case 'instance':
                pathPrefix.push(this.componentName, 'instances', this.instanceNumber);
                break;
          }
          
          var computedPath;
          const doesPathDependOnInstance = typeof path === 'function';
          const doesGetterDependOnInstance = typeof getter === 'function';
          const doesSetterDependOnInstance = typeof setter === 'function';

          if (!doesPathDependOnInstance) {
            computedPath = path;
          }
          const finalPath = combinePath(pathPrefix, computedPath);

          const updatePath = () => {
            if (doesPathDependOnInstance) {
              field.computedPath = path.call(this.allyInstanceData);
              field.finalPath = combinePath(field.pathPrefix, field.computedPath);
            }
          };
          
          field.pathPrefix = pathPrefix;
          field.computedPath = computedPath;
          field.finalPath = finalPath;
          field.doesPathDependOnInstance = doesPathDependOnInstance;
          field.doesGetterDependOnInstance = doesGetterDependOnInstance;
          field.doesSetterDependOnInstance = doesSetterDependOnInstance;
          field.updatePath = updatePath;
          field.defaultGetter = () => {
            return lodashGet(this.state.storeState, field.finalPath, defaultValue);
          };
          field.finalGetter = doesGetterDependOnInstance && (() => {
                return getter.call(this.allyInstanceData, field.defaultGetter);
              }) ||
              field.defaultGetter;
          if (!readonly) {
            field.defaultSetter = value => {
              return dispatch => dispatch(allySet(field.finalPath, value))
            };
            field.finalSetter = doesSetterDependOnInstance && (value => {
                  return setter.call(this.allyInstanceData, value, field.defaultSetter);
                }) ||
                field.defaultGetter;
            field.setterName = `set${name[0].toUpperCase()}${name.slice(1)}`;
          }
        }

        this.fields = instanceFields;
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

      updateAllyPropsIfNeeded() {
        const nextAllyProps = this.computeAllyProps();
        if (this.allyProps && shallowEqual(nextAllyProps, this.allyProps)) {
          return false;
        }

        this.allyProps = nextAllyProps;
        return true;
      }

      updateMergedPropsIfNeeded() {
        const nextMergedProps = computeMergedProps(this.stateProps, this.dispatchProps, this.props, this.allyProps)
        if (this.mergedProps && checkMergedEquals && shallowEqual(nextMergedProps, this.mergedProps)) {
          return false
        }

        this.mergedProps = nextMergedProps
        return true
      }

      isSubscribed() {
        return typeof this.unsubscribe === 'function'
      }

      trySubscribe() {
        if (shouldSubscribe && !this.unsubscribe) {
          this.unsubscribe = this.store.subscribe(this.handleChange.bind(this))
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
        this.fields = null
        this.allyProps = null
        this.dispatchProps = null
        this.stateProps = null
        this.mergedProps = null
        this.haveOwnPropsChanged = true
        this.hasStoreStateChanged = true
        this.haveStatePropsBeenPrecalculated = false
        this.statePropsPrecalculationError = null
        this.renderedElement = null
        this.finalMapDispatchToProps = null
        this.finalMapStateToProps = null
      }

      handleChange() {
        if (!this.unsubscribe) {
          return
        }

        const storeState = this.store.getState()
        const prevStoreState = this.state.storeState
        if (pure && prevStoreState === storeState) {
          return
        }

        if (pure && !this.doStatePropsDependOnOwnProps) {
          const haveStatePropsChanged = tryCatch(this.updateStatePropsIfNeeded, this)
          if (!haveStatePropsChanged) {
            return
          }
          if (haveStatePropsChanged === errorObject) {
            this.statePropsPrecalculationError = errorObject.value
          }
          this.haveStatePropsBeenPrecalculated = true
        }

        this.hasStoreStateChanged = true
        this.setState({ storeState })
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
          haveStatePropsBeenPrecalculated,
          statePropsPrecalculationError,
          renderedElement
        } = this
        const fieldsNotYetDefined = !this.fields && withRef;

        this.haveOwnPropsChanged = false
        this.hasStoreStateChanged = false
        this.haveStatePropsBeenPrecalculated = false
        this.statePropsPrecalculationError = null

        if (statePropsPrecalculationError) {
          throw statePropsPrecalculationError
        }

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
        if (haveStatePropsBeenPrecalculated) {
          haveStatePropsChanged = true
        } else if (shouldUpdateStateProps) {
          haveStatePropsChanged = this.updateStatePropsIfNeeded()
        }
        if (shouldUpdateDispatchProps) {
          haveDispatchPropsChanged = this.updateDispatchPropsIfNeeded()
        }
        let haveAllyPropsChanged = this.updateAllyPropsIfNeeded()

        let haveMergedPropsChanged = true
        if (
          haveStatePropsChanged ||
          haveDispatchPropsChanged ||
          haveOwnPropsChanged ||
          haveAllyPropsChanged
        ) {
          haveMergedPropsChanged = this.updateMergedPropsIfNeeded()
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

    Ally.displayName = allyDisplayName
    Ally.WrappedComponent = WrappedComponent
    Ally.contextTypes = {
      store: storeShape
    };
    Ally.propTypes = {
      store: storeShape
    };

    if (process.env.NODE_ENV !== 'production') {
      Ally.prototype.componentWillUpdate = function componentWillUpdate() {
        if (this.version === version) {
          return
        }

        // We are hot reloading!
        this.version = version
        this.trySubscribe()
        this.clearCache()
      }
    }

    return hoistStatics(Ally, WrappedComponent)
  }
}
