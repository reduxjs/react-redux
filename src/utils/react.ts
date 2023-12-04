import * as ReactOriginal from 'react'
import type * as ReactNamespace from 'react'

export const React: typeof ReactNamespace =
  // prettier-ignore
  // @ts-ignore
  'default' in ReactOriginal ? ReactOriginal['default'] : ReactOriginal as any
