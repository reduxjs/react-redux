import React from 'react';

// block for about 20 ms
export const syncBlock = () => {
  const start = Date.now();
  while (Date.now() - start < 20) {
    // empty
  }
};

export const useRegisterIncrementDispatcher = (listener) => {
  React.useEffect(() => {
    const ele = document.getElementById('remoteIncrement');
    ele.addEventListener('click', listener);
    return () => {
      ele.removeEventListener('click', listener);
    };
  }, [listener]);
};

export const initialState = {
  count: 0,
  dummy: 0,
};

export const reducer = (state = initialState, action) => {
  switch (action.type) {
    case 'increment':
      return {
        ...state,
        dummy: state.dummy + 1,
        // only update once in two
        count: state.dummy % 2 === 1 ? state.count + 1 : state.count,
      };
    default:
      return state;
  }
};

// 50 child components
export const ids = [...Array(50).keys()];

// check if all child components show the same count
// and if not, change the title
export const useCheckTearing = () => {
  React.useEffect(() => {
    const counts = ids.map(i => Number(
      document.querySelector(`.count:nth-of-type(${i + 1})`).innerHTML,
    ));
    if (!counts.every(c => c === counts[0])) {
      console.error('count mismatch', counts);
      document.title = 'failed';
    }
  });
};

// naive shallowEqual for React.memo
// a hack until the issue is resolved
// https://github.com/facebook/react/issues/17314
// https://github.com/facebook/react/issues/17318
export const shallowEqual = (prevProps, nextProps) => {
  const prevKeys = Object.keys(prevProps);
  const nextKeys = Object.keys(nextProps);
  return prevKeys.every(key => prevProps[key] === nextProps[key])
    && nextKeys.every(key => prevProps[key] === nextProps[key]);
};
