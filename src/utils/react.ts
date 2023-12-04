import * as ReactOriginal from 'react'
import type * as ReactNamespace from 'react'

export const React = (
  'default' in ReactOriginal ? ReactOriginal['default'] : ReactOriginal
) as typeof ReactNamespace
