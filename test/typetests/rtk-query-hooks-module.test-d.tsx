import {
  buildCreateApi,
  coreModule,
  reactHooksModule,
} from '@reduxjs/toolkit/query/react'
import { useDispatch, useSelector, useStore } from '../../src/index'
import type { UseSelector } from '../../src/index'
import { createSignalSelectorHook, useSignalSelector } from '../../src/signals'
import type { UseSignalSelector } from '../../src/signals'

type ModuleHooks = NonNullable<
  NonNullable<Parameters<typeof reactHooksModule>[0]>['hooks']
>

describe('type tests', () => {
  test('useSignalSelector satisfies reactHooksModule hooks.useSelector', () => {
    expectTypeOf(useSignalSelector).toMatchTypeOf<ModuleHooks['useSelector']>()
    expectTypeOf(useSignalSelector).toMatchTypeOf<UseSelector>()
    expectTypeOf<UseSignalSelector<{ a: number }>>().toMatchTypeOf<
      UseSelector<{ a: number }>
    >()
    expectTypeOf(createSignalSelectorHook()).toMatchTypeOf<
      ModuleHooks['useSelector']
    >()
  })

  test('reactHooksModule accepts useSignalSelector alongside stock hooks', () => {
    const createApi = buildCreateApi(
      coreModule(),
      reactHooksModule({
        hooks: { useDispatch, useSelector: useSignalSelector, useStore },
      }),
    )
    expectTypeOf(createApi).toEqualTypeOf(
      buildCreateApi(
        coreModule(),
        reactHooksModule({ hooks: { useDispatch, useSelector, useStore } }),
      ),
    )
  })
})
