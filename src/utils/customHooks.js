import { useReducer } from 'react'

// based on https://reactjs.org/docs/hooks-faq.html#is-there-something-like-forceupdate
const forceRenderFn = s => s + 1
export const useForceRender = () => useReducer(forceRenderFn, 0)[1]
