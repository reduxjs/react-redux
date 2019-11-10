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

export const initialState = { count: 0 };

export const reducer = (state = initialState, action) => {
  switch (action.type) {
    case 'increment':
      return { ...state, count: state.count + 1 };
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
