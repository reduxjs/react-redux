import * as React from 'react'
import is from '../utils/shallowEqual'
import { useSyncExternalStore } from 'use-sync-external-store'

// Intentionally not using named imports because Rollup uses dynamic dispatch
// for CommonJS interop.
const { useRef, useEffect, useMemo, useDebugValue } = React
// Same as useSyncExternalStore, but supports selector and isEqual arguments.
export function useSyncExternalStoreWithSelector<Snapshot, Selection>(
  subscribe: (onStoreChange: () => void) => () => void,
  getSnapshot: () => Snapshot,
  getServerSnapshot: void | null | (() => Snapshot),
  selector: (snapshot: Snapshot) => Selection,
  isEqual?: (a: Selection, b: Selection) => boolean,
): Selection {
  // Use this to track the rendered snapshot.
  const instRef = useRef<
    | {
        hasValue: true
        value: Selection
      }
    | {
        hasValue: false
        value: null
      }
    | null
  >(null)
  let inst

  if (instRef.current === null) {
    inst = {
      hasValue: false,
      value: null,
    }
    // @ts-ignore
    instRef.current = inst
  } else {
    inst = instRef.current
  }

  const [getSelection, getServerSelection] = useMemo(() => {
    // Track the memoized state using closure variables that are local to this
    // memoized instance of a getSnapshot function. Intentionally not using a
    // useRef hook, because that state would be shared across all concurrent
    // copies of the hook/component.
    let hasMemo = false
    let memoizedSnapshot: Snapshot
    let memoizedSelection: Selection
    let lastUsedProps: string[] = []
    let hasAccessed = false
    const accessedProps: string[] = []

    const memoizedSelector = (nextSnapshot: Snapshot) => {
      const getProxy = (): Snapshot => {
        if (
          !(typeof nextSnapshot === 'object') ||
          typeof Proxy === 'undefined'
        ) {
          return nextSnapshot
        }

        const handler = {
          get: (target: Snapshot, prop: string, receiver: any) => {
            const propertyName = prop.toString()

            if (accessedProps.indexOf(propertyName) === -1) {
              accessedProps.push(propertyName)
            }

            const value = Reflect.get(target as any, prop, receiver)
            return value
          },
        }
        return new Proxy(nextSnapshot as any, handler) as any
      }

      if (!hasMemo) {
        // The first time the hook is called, there is no memoized result.
        hasMemo = true
        memoizedSnapshot = nextSnapshot
        const nextSelection = selector(getProxy())
        lastUsedProps = accessedProps
        hasAccessed = true

        if (isEqual !== undefined) {
          // Even if the selector has changed, the currently rendered selection
          // may be equal to the new selection. We should attempt to reuse the
          // current value if possible, to preserve downstream memoizations.
          if (inst.hasValue) {
            const currentSelection = inst.value

            if (isEqual(currentSelection as Selection, nextSelection)) {
              memoizedSelection = currentSelection as Selection
              return currentSelection
            }
          }
        }

        memoizedSelection = nextSelection
        return nextSelection
      }

      // We may be able to reuse the previous invocation's result.
      const prevSnapshot = memoizedSnapshot
      const prevSelection = memoizedSelection

      const getChangedSegments = (): string[] | void => {
        if (
          prevSnapshot === undefined ||
          !hasAccessed ||
          lastUsedProps.length === 0
        ) {
          return undefined
        }

        const result: string[] = []

        if (
          nextSnapshot !== null &&
          typeof nextSnapshot === 'object' &&
          prevSnapshot !== null &&
          typeof prevSnapshot === 'object'
        ) {
          for (let i = 0; i < lastUsedProps.length; i++) {
            const segmentName = lastUsedProps[i]

            if (
              (nextSnapshot as Record<string, unknown>)[segmentName] !==
              (prevSnapshot as Record<string, unknown>)[segmentName]
            ) {
              result.push(segmentName)
            }
          }
        }

        return result
      }

      if (is(prevSnapshot, nextSnapshot)) {
        // The snapshot is the same as last time. Reuse the previous selection.
        return prevSelection
      }

      // The snapshot has changed, so we need to compute a new selection.
      const changedSegments = getChangedSegments()

      if (changedSegments === undefined || changedSegments.length > 0) {
        const nextSelection = selector(getProxy())
        lastUsedProps = accessedProps
        hasAccessed = true

        // If a custom isEqual function is provided, use that to check if the data
        // has changed. If it hasn't, return the previous selection. That signals
        // to React that the selections are conceptually equal, and we can bail
        // out of rendering.
        if (isEqual !== undefined && isEqual(prevSelection, nextSelection)) {
          return prevSelection
        }

        memoizedSnapshot = nextSnapshot
        memoizedSelection = nextSelection
        return nextSelection
      } else {
        return prevSelection
      }
    }

    // Assigning this to a constant so that Flow knows it can't change.
    const maybeGetServerSnapshot =
      getServerSnapshot === undefined ? null : getServerSnapshot

    const getSnapshotWithSelector = () => memoizedSelector(getSnapshot())

    const getServerSnapshotWithSelector =
      maybeGetServerSnapshot === null
        ? undefined
        : () => memoizedSelector(maybeGetServerSnapshot())
    return [getSnapshotWithSelector, getServerSnapshotWithSelector]
  }, [getSnapshot, getServerSnapshot, selector, isEqual])
  const value = useSyncExternalStore(
    subscribe,
    getSelection,
    getServerSelection,
  )
  useEffect(() => {
    // $FlowFixMe[incompatible-type] changing the variant using mutation isn't supported
    inst.hasValue = true
    // $FlowFixMe[incompatible-type]
    inst.value = value
  }, [value])
  useDebugValue(value)
  return value as Selection
}
