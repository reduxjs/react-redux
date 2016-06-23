export default function createMatchingSelector(factories, options) {
  for (let i = factories.length - 1; i >= 0; i--) {
    const selector = factories[i](options)
    if (selector) return selector
  }

  return undefined
}
