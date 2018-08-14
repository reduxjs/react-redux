module.exports = function(wallaby) {
  return {
    files: [
      { pattern: 'test/**/*.spec.js', ignore: true },
      'src/**/*.js*',
      'test/getTestDeps.js'
    ],
    tests: [
      { pattern: 'node_modules/*', ignore: true, instrument: false },
      { pattern: 'test/react/**/*.spec.js', ignore: true, instrument: false },
      'test/**/*.spec.js*',
    ],
    compilers: {
      '**/*.js': wallaby.compilers.babel({
        babel: require('babel-core'),
      }),
    },
    env: {
      type: 'node'
    },
    testFramework: 'jest'
  }
}
