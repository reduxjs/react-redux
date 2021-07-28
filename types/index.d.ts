/* eslint-disable no-unused-vars */

declare module 'react-native' {
  export function unstable_batchedUpdates<A, B>(
    callback: (a: A, b: B) => any,
    a: A,
    b: B
  ): void
  export function unstable_batchedUpdates<A>(
    callback: (a: A) => any,
    a: A
  ): void
  export function unstable_batchedUpdates(callback: () => any): void
}

declare module 'react-is' {
  import * as React from 'react'
  export function isContextConsumer(value: any): value is React.ReactElement
  export function isValidElementType(value: any): value is React.ElementType
}
