import { bindActionCreators } from 'redux';

import createStoreShape from '../utils/createStoreShape';
import shallowEqual from '../utils/shallowEqual';
import isPlainObject from '../utils/isPlainObject';
import invariant from 'invariant';

export default function createConnector(React) {
  const { Component, PropTypes } = React;
  const storeShape = createStoreShape(PropTypes);

  return class Connector extends Component {
    static contextTypes = {
      store: storeShape.isRequired
    };

    static propTypes = {
      children: PropTypes.func.isRequired,
      slicer: PropTypes.func.isRequired
    };

    static defaultProps = {
      slicer: state => state
    };

    shouldComponentUpdate(nextProps, nextState) {
      return !this.isSliceEqual(this.state.slice, nextState.slice) ||
             !shallowEqual(this.props, nextProps);
    }

    isSliceEqual(slice, nextSlice) {
      const isRefEqual = slice === nextSlice;
      if (isRefEqual) {
        return true;
      } else if (typeof slice !== 'object' || typeof nextSlice !== 'object') {
        return isRefEqual;
      }
      return shallowEqual(slice, nextSlice);
    }

    constructor(props, context) {
      super(props, context);
      this.state = this.selectState(props, context);
    }

    componentDidMount() {
      this.unsubscribe = this.context.store.subscribe(::this.handleChange);
      this.handleChange();
    }

    componentWillReceiveProps(nextProps) {
      if (nextProps.slicer !== this.props.slicer) {
        // Force the state slice recalculation
        this.handleChange(nextProps);
      }
    }

    componentWillUnmount() {
      this.unsubscribe();
    }

    handleChange(props = this.props) {
      const nextState = this.selectState(props, this.context);
      if (!this.isSliceEqual(this.state.slice, nextState.slice)) {
        this.setState(nextState);
      }
    }

    selectState(props, context) {
      const state = context.store.getState();
      const slice = props.slicer(state);

      invariant(
        isPlainObject(slice),
        'The return value of `slicer` prop must be an object. Instead received %s.',
        slice
      );

      return { slice };
    }

    wrapActionCreators(dispatch) {
      return typeof this.props.actionCreators === 'function'
        ? this.props.actionCreators(dispatch)
        : bindActionCreators(this.props.actionCreators, dispatch);
    }

    render() {
      const { children } = this.props;
      const { slice } = this.state;
      const { store: { dispatch } } = this.context;
      const actions = this.props.actionCreators
        ? this.wrapActionCreators(dispatch)
        : {};

      return children({ dispatch, ...slice, ...actions});
    }
  };
}
