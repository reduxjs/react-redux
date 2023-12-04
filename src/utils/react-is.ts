import type { ElementType, MemoExoticComponent, ReactElement } from 'react'

// Directly ported from:
// https://unpkg.com/browse/react-is@18.3.0-canary-ee68446ff-20231115/cjs/react-is.production.js
// It's very possible this could change in the future, but given that
// we only use these in `connect`, this is a low priority.

const REACT_ELEMENT_TYPE = Symbol.for('react.element')
const REACT_PORTAL_TYPE = Symbol.for('react.portal')
const REACT_FRAGMENT_TYPE = Symbol.for('react.fragment')
const REACT_STRICT_MODE_TYPE = Symbol.for('react.strict_mode')
const REACT_PROFILER_TYPE = Symbol.for('react.profiler')
const REACT_PROVIDER_TYPE = Symbol.for('react.provider')
const REACT_CONTEXT_TYPE = Symbol.for('react.context')
const REACT_SERVER_CONTEXT_TYPE = Symbol.for('react.server_context')
const REACT_FORWARD_REF_TYPE = Symbol.for('react.forward_ref')
const REACT_SUSPENSE_TYPE = Symbol.for('react.suspense')
const REACT_SUSPENSE_LIST_TYPE = Symbol.for('react.suspense_list')
const REACT_MEMO_TYPE = Symbol.for('react.memo')
const REACT_LAZY_TYPE = Symbol.for('react.lazy')
const REACT_OFFSCREEN_TYPE = Symbol.for('react.offscreen')
const REACT_CLIENT_REFERENCE = Symbol.for('react.client.reference')

export const ForwardRef = REACT_FORWARD_REF_TYPE
export const Memo = REACT_MEMO_TYPE

export function isValidElementType(type: any): type is ElementType {
  if (typeof type === 'string' || typeof type === 'function') {
    return true
  } // Note: typeof might be other than 'symbol' or 'number' (e.g. if it's a polyfill).

  if (
    type === REACT_FRAGMENT_TYPE ||
    type === REACT_PROFILER_TYPE ||
    type === REACT_STRICT_MODE_TYPE ||
    type === REACT_SUSPENSE_TYPE ||
    type === REACT_SUSPENSE_LIST_TYPE ||
    type === REACT_OFFSCREEN_TYPE
  ) {
    return true
  }

  if (typeof type === 'object' && type !== null) {
    if (
      type.$$typeof === REACT_LAZY_TYPE ||
      type.$$typeof === REACT_MEMO_TYPE ||
      type.$$typeof === REACT_PROVIDER_TYPE ||
      type.$$typeof === REACT_CONTEXT_TYPE ||
      type.$$typeof === REACT_FORWARD_REF_TYPE || // This needs to include all possible module reference object
      // types supported by any Flight configuration anywhere since
      // we don't know which Flight build this will end up being used
      // with.
      type.$$typeof === REACT_CLIENT_REFERENCE ||
      type.getModuleId !== undefined
    ) {
      return true
    }
  }

  return false
}

function typeOf(object: any): symbol | undefined {
  if (typeof object === 'object' && object !== null) {
    const $$typeof = object.$$typeof

    switch ($$typeof) {
      case REACT_ELEMENT_TYPE: {
        const type = object.type

        switch (type) {
          case REACT_FRAGMENT_TYPE:
          case REACT_PROFILER_TYPE:
          case REACT_STRICT_MODE_TYPE:
          case REACT_SUSPENSE_TYPE:
          case REACT_SUSPENSE_LIST_TYPE:
            return type

          default: {
            const $$typeofType = type && type.$$typeof

            switch ($$typeofType) {
              case REACT_SERVER_CONTEXT_TYPE:
              case REACT_CONTEXT_TYPE:
              case REACT_FORWARD_REF_TYPE:
              case REACT_LAZY_TYPE:
              case REACT_MEMO_TYPE:
              case REACT_PROVIDER_TYPE:
                return $$typeofType

              default:
                return $$typeof
            }
          }
        }
      }

      case REACT_PORTAL_TYPE: {
        return $$typeof
      }
    }
  }

  return undefined
}

export function isContextConsumer(object: any): object is ReactElement {
  return typeOf(object) === REACT_CONTEXT_TYPE
}

export function isMemo(object: any): object is MemoExoticComponent<any> {
  return typeOf(object) === REACT_MEMO_TYPE
}
