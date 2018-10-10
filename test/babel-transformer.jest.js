const path = require('path')
const { createTransformer } = require('babel-jest')

module.exports = createTransformer({
  configFile: path.resolve(__dirname, '../.babelrc.js'),
})
