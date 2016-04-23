import invariant from 'invariant'


function mapValues(obj, fn) {
  return Object.keys(obj).reduce((result, key) => {
    result[key] = fn(obj[key], key)
    return result
  }, {})
}

export default function wrapMapStateObject(mapStateToProps) {

  const needsProps = Object.keys(mapStateToProps)
    .reduce((useProps, key) => {
      const type = typeof mapStateToProps[key]
      invariant(
        type === 'function',
        'mapStateToProps object key %s expected to be a function, instead saw %s',
        key,
        type
      )
      return useProps || mapStateToProps[key].length !== 1
    }, false)

  return needsProps
    ? (state, props) => mapValues(mapStateToProps, fn => fn(state, props))
    : state => mapValues(mapStateToProps, fn => fn(state)
  )
}
