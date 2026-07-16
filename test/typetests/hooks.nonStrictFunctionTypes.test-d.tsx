// In addition to the regular strict compilation of `tsconfig.test.json`,
// this file is compiled by `tsconfig.test.nonStrictFunctionTypes.json` with
// `strictFunctionTypes` disabled. In that configuration, inference for
// `Selected` used to be poisoned by the second argument of `useSelector`:
// passing `shallowEqual` (typed `(objA: any, objB: any) => boolean`) made
// `Selected` collapse to `any`, and a generic equality function made it
// collapse to `unknown`.
// See https://github.com/reduxjs/react-redux/issues/2186
import { shallowEqual, useSelector } from 'react-redux'
import type { TypedUseSelectorHook } from 'react-redux'

describe('type tests', () => {
  interface Editor {
    id: string
    active: boolean
  }

  interface AppState {
    editors: Editor[]
  }

  const selectEditors = (state: AppState) => state.editors

  const useAppSelector = useSelector.withTypes<AppState>()

  test('shallowEqual does not make useSelector lose the selected type', () => {
    const editors = useSelector(selectEditors, shallowEqual)

    expectTypeOf(editors).toEqualTypeOf<Editor[]>()
  })

  test('shallowEqual does not make a pre-typed useSelector lose the selected type', () => {
    const editors = useAppSelector(selectEditors, shallowEqual)

    expectTypeOf(editors).toEqualTypeOf<Editor[]>()

    const editorsInline = useAppSelector((state) => state.editors, shallowEqual)

    expectTypeOf(editorsInline).toEqualTypeOf<Editor[]>()
  })

  test('shallowEqual as the equalityFn option does not lose the selected type', () => {
    const editors = useAppSelector(selectEditors, { equalityFn: shallowEqual })

    expectTypeOf(editors).toEqualTypeOf<Editor[]>()
  })

  test('a generic equality function does not make useSelector lose the selected type', () => {
    const genericEqual = shallowEqual as <T>(a: T, b: T) => boolean

    const editors = useAppSelector(selectEditors, genericEqual)

    expectTypeOf(editors).toEqualTypeOf<Editor[]>()
  })

  test('shallowEqual does not make TypedUseSelectorHook lose the selected type', () => {
    const useTypedSelector: TypedUseSelectorHook<AppState> = useSelector

    const editors = useTypedSelector(selectEditors, shallowEqual)

    expectTypeOf(editors).toEqualTypeOf<Editor[]>()

    const editorsViaOptions = useTypedSelector(selectEditors, {
      equalityFn: shallowEqual,
    })

    expectTypeOf(editorsViaOptions).toEqualTypeOf<Editor[]>()
  })
})
