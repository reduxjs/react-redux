/* eslint-disable no-unused-vars */

declare module 'react-is' {
  import * as React from 'react'
  export function isContextConsumer(value: any): value is React.ReactElement
  export function isValidElementType(value: any): value is React.ElementType
}
