import React from 'react';
import ReactDOM from 'react-dom';

const name = process.env.NAME || window.location.pathname.slice(1) || 'react-redux';
document.title = name;

// eslint-disable-next-line import/no-dynamic-require
const App = require(`./${name}`).default;

// concurrent mode
const root = ReactDOM.createRoot(document.getElementById('app'));
root.render(<App />);

// sync mode
// ReactDOM.render(<App />, document.getElementById('app'));
