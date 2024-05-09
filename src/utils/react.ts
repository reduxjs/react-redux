import type * as ReactNamespace from 'react'
import * as ReactOriginal from 'react'

export const React: typeof ReactNamespace =
  // prettier-ignore
  'default' in ReactOriginal ? ReactOriginal['default'] : ReactOriginal as any
