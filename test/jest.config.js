module.exports = {
  testURL: 'http://localhost',
  collectCoverage: true,
  coverageDirectory: '<rootDir>/coverage',
  transform: {
    '.js$': __dirname + '/babel-transformer.jest.js',
  },
}
