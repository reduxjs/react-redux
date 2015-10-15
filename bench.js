var suite = new Benchmark.Suite;

var benchRes = document.getElementById('res');

function reducer(state, action) {
  if (!state) state = {toggle: false};
  switch (action.type) {
      case 'TOGGLE':
          return {toggle: !state.toggle};
      case 'RESET':
          return {toggle: false};
      default:
          return state;
  }
}

var store = Redux.createStore(reducer);

var Toggle = React.createClass({

  render: function() {
    return React.createElement('div', null, [this.props.yes ? 'yes' : 'no']);
  },

});

Toggle = ReactRedux.connect(function(state) {
  return {yes: state.toggle};
})(Toggle);


ReactDOM.render(
  React.createElement(
    ReactRedux.Provider,
    {store: store},
    React.createElement(
      "div",
      null,
      Array.apply(null, {length: 333}).map(function(_, i) {
        return React.createElement(Toggle, {key: i})
      })
    )
  ), document.getElementById('app')
);


suite
.add('dispatch', function() {
  store.dispatch({type: 'TOGGLE'});
})
.add('dispatch batched', function() {
  ReactDOM.unstable_batchedUpdates(function() {
    store.dispatch({type: 'TOGGLE'});
  });
})
.on('cycle', function(event) {
  benchRes.innerHTML += String(event.target) + "\n";
})
.on('complete', function(e) {
  benchRes.innerHTML += '\n';
  benchRes.innerHTML += 'All done!\n\nFastest was: ' + this.filter('fastest').pluck('name');
  benchRes.innerHTML += '\n';
})
.on('start', function() {
  benchRes.innerHTML = 'Executing the benchmark...\n\n';
})
// run async
.run({ 'async': true });

