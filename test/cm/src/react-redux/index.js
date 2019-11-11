import React from 'react';
import { createStore } from 'redux';
import { Provider, useSelector, useDispatch } from '../../../../src';

import {
  syncBlock,
  useRegisterIncrementDispatcher,
  reducer,
  ids,
  useCheckTearing,
  shallowEqual,
} from '../common';

const store = createStore(reducer);

const Counter = React.memo(() => {
  const count = useSelector(state => state.count);
  syncBlock();
  return <div className="count">{count}</div>;
}, shallowEqual);

const Main = () => {
  const dispatch = useDispatch();
  const count = useSelector(state => state.count);
  useCheckTearing();
  useRegisterIncrementDispatcher(React.useCallback(() => {
    dispatch({ type: 'increment' });
  }, [dispatch]));
  const [localCount, localIncrement] = React.useReducer(c => c + 1, 0);
  return (
    <div>
      <h1>Remote Count</h1>
      {ids.map(id => <Counter key={id} />)}
      <div className="count">{count}</div>
      <h1>Local Count</h1>
      {localCount}
      <button type="button" id="localIncrement" onClick={localIncrement}>Increment local count</button>
    </div>
  );
};

const App = () => (
  <Provider store={store}>
    <Main />
  </Provider>
);

export default App;
