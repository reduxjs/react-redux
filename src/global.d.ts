declare module 'react-dom' {
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
