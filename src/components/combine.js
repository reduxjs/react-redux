import React from 'react';
import SubProvider from './SubProvider';

const subStateHOC = (subState) => {
  return (WrappedComponent) => {
    return class Combine extends React.Component {
      render() {
        return (
          <SubProvider subState={ subState }>
            <WrappedComponent {...this.props}/>
          </SubProvider>
        );
      }
    };
  };
};

export const subStateWrapper = subStateHOC;

const combineConnected = (components) => {
  const combined = {};
  for (const subState in components) {
    const keys = Object.keys(components[subState]);

    const isNamed = (
      typeof components[subState] === 'object' &&
      keys.length === 1
    ); 

    const name = isNamed ? keys[0] : subState;

    const result = isNamed ?
      subStateWrapper(subState)(components[subState][name]) :
      subStateWrapper(subState)(components[subState]);

    combined[name] = result;
  }
  return combined;
};

export default combineConnected;
