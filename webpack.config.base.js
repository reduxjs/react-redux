'use strict';

var webpack = require('webpack');
var webpackUMDExternal = require('webpack-umd-external');

module.exports = {
  externals: webpackUMDExternal({
    'react': 'React',
    'react-native': 'React',
    'redux': 'Redux'
  }),
  module: {
    loaders: [
      { test: /\.js$/, loaders: ['babel-loader'], exclude: /node_modules/ }
    ]
  },
  output: {
    library: 'ReactRedux',
    libraryTarget: 'umd'
  },
  resolve: {
    extensions: ['', '.js']
  }
};
