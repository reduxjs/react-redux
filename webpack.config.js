'use strict'

var webpack = require('webpack')
var env = process.env.NODE_ENV

var reactExternal = {
  root: 'React',
  commonjs2: 'react',
  commonjs: 'react',
  amd: 'react'
}

var reduxExternal = {
  root: 'Redux',
  commonjs2: 'redux',
  commonjs: 'redux',
  amd: 'redux'
}

function applyGlobalVar(compiler) {
  compiler.plugin('compilation', function(compilation, params) {
    params.normalModuleFactory.plugin('parser', function(parser) {
      parser.plugin('expression global', function expressionGlobalPlugin() {
        this.state.module.addVariable(
          'global', 
          "(function() { return this; }()) || Function('return this')()")
        return false
      })
    })
  })
}

var config = {
  externals: {
    'react': reactExternal,
    'redux': reduxExternal
  },
  module: {
    rules: [
      { test: /\.js$/, loaders: ['babel-loader'], exclude: /node_modules/ }
    ]
  },
  output: {
    library: 'ReactRedux',
    libraryTarget: 'umd'
  },
  plugins: [
    { apply: applyGlobalVar }, 
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify(env)
    })
  ]
}

if (env === 'production') {
  config.plugins.push(
    new webpack.optimize.UglifyJsPlugin({
      compressor: {
        pure_getters: true,
        unsafe: true,
        unsafe_comps: true,
        screw_ie8: true,
        warnings: false
      }
    })
  )
}

module.exports = config
