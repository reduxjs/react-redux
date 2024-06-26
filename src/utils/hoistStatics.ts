// Copied directly from:
// https://github.com/mridgway/hoist-non-react-statics/blob/main/src/index.js
// https://unpkg.com/browse/@types/hoist-non-react-statics@3.3.1/index.d.ts

/**
 * Copyright 2015, Yahoo! Inc.
 * Copyrights licensed under the New BSD License. See the accompanying LICENSE file for terms.
 */
import type {
  ComponentType,
  ForwardRefExoticComponent,
  MemoExoticComponent,
} from 'react'
import { ForwardRef, Memo, isMemo } from '../utils/react-is'

const REACT_STATICS = {
  childContextTypes: true,
  contextType: true,
  contextTypes: true,
  defaultProps: true,
  displayName: true,
  getDefaultProps: true,
  getDerivedStateFromError: true,
  getDerivedStateFromProps: true,
  mixins: true,
  propTypes: true,
  type: true,
} as const

const KNOWN_STATICS = {
  name: true,
  length: true,
  prototype: true,
  caller: true,
  callee: true,
  arguments: true,
  arity: true,
} as const

const FORWARD_REF_STATICS = {
  $$typeof: true,
  render: true,
  defaultProps: true,
  displayName: true,
  propTypes: true,
} as const

const MEMO_STATICS = {
  $$typeof: true,
  compare: true,
  defaultProps: true,
  displayName: true,
  propTypes: true,
  type: true,
} as const

const TYPE_STATICS = {
  [ForwardRef]: FORWARD_REF_STATICS,
  [Memo]: MEMO_STATICS,
} as const

function getStatics(component: any) {
  // React v16.11 and below
  if (isMemo(component)) {
    return MEMO_STATICS
  }

  // React v16.12 and above
  return TYPE_STATICS[component['$$typeof']] || REACT_STATICS
}

export type NonReactStatics<
  S extends ComponentType<any>,
  C extends {
    [key: string]: true
  } = {},
> = {
  [key in Exclude<
    keyof S,
    S extends MemoExoticComponent<any>
      ? keyof typeof MEMO_STATICS | keyof C
      : S extends ForwardRefExoticComponent<any>
        ? keyof typeof FORWARD_REF_STATICS | keyof C
        : keyof typeof REACT_STATICS | keyof typeof KNOWN_STATICS | keyof C
  >]: S[key]
}

const defineProperty = Object.defineProperty
const getOwnPropertyNames = Object.getOwnPropertyNames
const getOwnPropertySymbols = Object.getOwnPropertySymbols
const getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor
const getPrototypeOf = Object.getPrototypeOf
const objectPrototype = Object.prototype

export default function hoistNonReactStatics<
  T extends ComponentType<any>,
  S extends ComponentType<any>,
  C extends {
    [key: string]: true
  } = {},
>(targetComponent: T, sourceComponent: S): T & NonReactStatics<S, C> {
  if (typeof sourceComponent !== 'string') {
    // don't hoist over string (html) components

    if (objectPrototype) {
      const inheritedComponent = getPrototypeOf(sourceComponent)
      if (inheritedComponent && inheritedComponent !== objectPrototype) {
        hoistNonReactStatics(targetComponent, inheritedComponent)
      }
    }

    let keys: (string | symbol)[] = getOwnPropertyNames(sourceComponent)

    if (getOwnPropertySymbols) {
      keys = keys.concat(getOwnPropertySymbols(sourceComponent))
    }

    const targetStatics = getStatics(targetComponent)
    const sourceStatics = getStatics(sourceComponent)

    for (let i = 0; i < keys.length; ++i) {
      const key = keys[i]
      if (
        !KNOWN_STATICS[key as keyof typeof KNOWN_STATICS] &&
        !(sourceStatics && sourceStatics[key as keyof typeof sourceStatics]) &&
        !(targetStatics && targetStatics[key as keyof typeof targetStatics])
      ) {
        const descriptor = getOwnPropertyDescriptor(sourceComponent, key)
        try {
          // Avoid failures from read-only properties
          defineProperty(targetComponent, key, descriptor!)
        } catch (e) {
          // ignore
        }
      }
    }
  }

  return targetComponent as any
}
