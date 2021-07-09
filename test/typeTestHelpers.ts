/**
 * return True if T is `any`, otherwise return False
 * taken from https://github.com/joonhocho/tsdef
 *
 * @internal
 */
export type IsAny<T, True, False = never> =
  // test if we are going the left AND right path in the condition
  true | false extends (T extends never ? true : false) ? True : False

/**
 * return True if T is `unknown`, otherwise return False
 * taken from https://github.com/joonhocho/tsdef
 *
 * @internal
 */
export type IsUnknown<T, True, False = never> = unknown extends T
  ? IsAny<T, False, True>
  : False

export function expectType<T>(t: T): T {
  return t
}

type Equals<T, U> = IsAny<
  T,
  never,
  IsAny<U, never, [T] extends [U] ? ([U] extends [T] ? any : never) : never>
>
export function expectExactType<T>(t: T) {
  return <U extends Equals<T, U>>(u: U) => {}
}

type EnsureUnknown<T extends any> = IsUnknown<T, any, never>
export function expectUnknown<T extends EnsureUnknown<T>>(t: T) {
  return t
}

type EnsureAny<T extends any> = IsAny<T, any, never>
export function expectExactAny<T extends EnsureAny<T>>(t: T) {
  return t
}

type IsNotAny<T> = IsAny<T, never, any>
export function expectNotAny<T extends IsNotAny<T>>(t: T): T {
  return t
}

expectType<string>('5' as string)
expectType<string>('5' as const)
expectType<string>('5' as any)
expectExactType('5' as const)('5' as const)
// @ts-expect-error
expectExactType('5' as string)('5' as const)
// @ts-expect-error
expectExactType('5' as any)('5' as const)
expectUnknown('5' as unknown)
// @ts-expect-error
expectUnknown('5' as const)
// @ts-expect-error
expectUnknown('5' as any)
expectExactAny('5' as any)
// @ts-expect-error
expectExactAny('5' as const)
// @ts-expect-error
expectExactAny('5' as unknown)
