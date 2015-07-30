import getDisplayName from '../utils/getDisplayName';
import shallowEqualScalar from '../utils/shallowEqualScalar';

export default function createConnectDecorator(React, Connector) {
  const { Component } = React;

  return function connect(slicer, actionCreators) {
    return DecoratedComponent => class ConnectorDecorator extends Component {
      static displayName = `Connector(${getDisplayName(DecoratedComponent)})`;
      static DecoratedComponent = DecoratedComponent;

      shouldComponentUpdate(nextProps) {
        return !shallowEqualScalar(this.props, nextProps);
      }

      render() {
        // Linter doesn't allow const slicerFn = slicer || () => ({});
        let slicerFn = slicer;
        if (slicerFn === null) {
          slicerFn = () => ({});
        }

        return (
          <Connector
            slicer={state => slicerFn(state, this.props)}
            actionCreators={actionCreators}
          >
            {stuff => <DecoratedComponent {...stuff} {...this.props} />}
          </Connector>
        );
      }
    };
  };
}
