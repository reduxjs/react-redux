import React from 'react'

const INDEX_SIZE = 31-3;

const allMarked = () => 0xFFFF << 2;

export const createHashFunction = (state) => {
  if (Array.isArray(state)) {
    return allMarked;
  }
  const keys = {};
  Object
    .keys(state)
    .forEach((key, index) => keys[key] = 1 << (3 + index % INDEX_SIZE))

  return (hash, key) => hash | keys[key];
}

const Context = React.createContext(null, (prev, next) => {
  let result = 1; // one bit always changed 1 to enable non pure connect

  if (typeof prev.state !== 'object' || Array.isArray(next.state)) {
    return 0xFFFFFF
  }
  // foo has been changed
  if (prev.store !== next.store) {
    result |= 2
  }
  if (prev.hashFunction !== next.hashFunction) {
    result |= 4
  }
  Object
    .keys(prev.state)
    .forEach(key => {
      if (prev.state[key] !== next.state[key]) {
        result = next.hashFunction(result, key)
      }
    })
  return result
})

export default Context