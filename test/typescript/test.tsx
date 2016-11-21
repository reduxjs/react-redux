import {Dispatch, Store} from "redux";
import {connect, Provider} from "../../index";


function testNoArgs() {
  const Connected = connect()(props => {
    // typings:expect-error
    props.foo;

    return <button onClick={() => props.dispatch({type: 'CLICKED'})}/>;
  });

  // typings:expect-error
  const c = <Connected foo="foo"/>;

  const ConnectedWithProps = connect<{}, {foo: string}>()(props => {
    props.foo;
    return <button onClick={() => props.dispatch({type: 'CLICKED'})}/>;
  });

  const cp = <ConnectedWithProps foo="foo"/>;

  const connectorWithProps = connect<{}, {foo: string}>();

  // typings:expect-error
  connectorWithProps((props: {bar: string}) => <div/>);
}


function testMapState() {
  type MyState = {foo: string, bar: number};

  // typings:expect-error
  connect<MyState, {}, {}>((state: {baz: boolean}) => ({}));

  const Connected = connect(
    (state: MyState, props: {baz: boolean}) => {
      return {
        foo: state.foo,
        fizz: props.baz,
      };
    },
  )(props => {
    const foo: string = props.foo;
    const baz: boolean = props.baz;
    const fizz: boolean = props.fizz;

    // typings:expect-error
    props.bar;

    props.dispatch({type: 'ACTION'});

    return <div/>;
  });

  // typings:expect-error
  <Connected/>;

  <Connected baz/>;

  // typings:expect-error
  <Connected baz="baz"/>;

  const Connected2 = connect<MyState, {baz: boolean}, {foo: string, fizz: boolean}>(
    () => (state: MyState, props: {baz: boolean}) => {
      return {
        foo: state.foo,
        fizz: props.baz,
      };
    }
  )(props => {
    const foo: string = props.foo;
    const baz: boolean = props.baz;
    const fizz: boolean = props.fizz;

    // typings:expect-error
    props.bar;

    props.dispatch({type: 'ACTION'});

    return <div/>;
  });

  // typings:expect-error
  <Connected2/>;

  <Connected2 baz/>;

  // typings:expect-error
  <Connected2 baz="baz"/>;
}


function testMapDispatch() {
  type MyState = {foo: string};

  const Connected = connect(
    (state: MyState) => {
      return {
        foo: state.foo,
      };
    },
    (dispatch) => {
      return {
        handleClick() {
          dispatch({type: 'CLICKED'});
        },
      };
    },
  )(props => {
    const foo: string = props.foo;
    // typings:expect-error
    props.bar;

    // typings:expect-error
    props.dispatch({type: 'TYPE'});

    return <button onClick={props.handleClick}/>;
  });

  <Connected/>;
  // typings:expect-error
  <Connected bar={42}/>;

  type Props = {bar: number};
  const ConnectedWithProps = connect(
    (state: MyState) => {
      return {foo: state.foo};
    },
    (dispatch, props: Props) => {
      return {
        handleClick() {
          dispatch({type: 'CLICKED', bar: props.bar});
        },
      };
    },
  )(props => {
    const foo: string = props.foo;
    const bar: number = props.bar;

    // typings:expect-error
    props.dispatch({type: 'TYPE'});

    return <button onClick={props.handleClick}/>;
  });

  // typings:expect-error
  <ConnectedWithProps/>;

  <ConnectedWithProps bar={42}/>;

  const ConnectedWithDispatchObject = connect(
    (state: MyState) => {
      return {foo: state.foo};
    },
    {
      handleClick() {
        return {type: 'CLICKED'};
      },
    },
  )(props => {
    const foo: string = props.foo;
    // typings:expect-error
    props.bar;

    // typings:expect-error
    props.dispatch({type: 'TYPE'});

    return <button onClick={props.handleClick}/>;
  });

  // typings:expect-error
  connect(
    null,
    {
      handleClick: () => 'not-an-action',
    },
  );

  connect(
    null,
    {
      handleClick: () => (dispatch: Dispatch<MyState>) => {
        dispatch({type: 'SOME_ACTION'});
      },
    },
  );
}


function testMergeProps() {
  type MyState = {foo: string};

  const connector = connect(
    (state: MyState) => {
      return {foo: state.foo};
    },
    (dispatch) => {
      return {
        handleClick() {
          dispatch({type: 'CLICKED'});
        },
      };
    },
    (stateProps, dispatchProps) => {
      // typings:expect-error
      stateProps.bar;
      // typings:expect-error
      dispatchProps.foo;

      return {stateProps, dispatchProps};
    }
  );

  // typings:expect-error
  connector((props: {bar: number}) => <div/>);

  const Connected = connector(props => {
    // typings:expect-error
    props.foo;
    // typings:expect-error
    props.handleClick;

    const foo: string = props.stateProps.foo;

    return <button onClick={props.dispatchProps.handleClick}/>;
  });

  // typings:expect-error
  <Connected foo="fizz"/>;

  <Connected/>;

  type MyProps = {bar: number};

  const Connected2 = connect(
    (state: MyState, props: MyProps) => {
      return {
        foo: state.foo,
        baz: props.bar,
      };
    },
    (dispatch, props: MyProps) => {
      // typings:expect-error
      props.foo;

      return {
        handleClick() {
          dispatch({type: 'CLICKED', bar: props.bar});
        },
      };
    },
    (stateProps, dispatchProps, ownProps) => {
      // typings:expect-error
      stateProps.bar;
      // typings:expect-error
      dispatchProps.bar;
      // typings:expect-error
      ownProps.foo;

      return {
        fizz: stateProps.foo,
        bazz: stateProps.baz,
        buzz: ownProps.bar,
        clickHandler: dispatchProps.handleClick,
      }
    }
  )(props => {
    // typings:expect-error
    props.foo;
    // typings:expect-error
    props.baz;
    // typings:expect-error
    props.bar;
    // typings:expect-error
    props.handleClick;

    const fizz: string = props.fizz;
    const bazz: number = props.bazz;
    const buzz: number = props.buzz;

    return <button onClick={props.clickHandler}/>;
  });

  // typings:expect-error
  <Connected2 foo="foo"/>;
  // typings:expect-error
  <Connected2 handleClick={() => {}}/>;
  // typings:expect-error
  <Connected2/>;

  <Connected2 bar={1}/>;
}

function testOptions() {
  // typings:expect-error
  connect(null, null, null, {pure: 1});
  // typings:expect-error
  connect(null, null, null, {withRef: 1});

  connect(null, null, null, {pure: true});
  connect(null, null, null, {withRef: true});
  connect(null, null, null, {pure: true, withRef: true});

  connect(
    (state: {foo: string}) => ({foo: state.foo}),
    null,
    null,
    {pure: true}
  );
}

function testProvider() {
  // typings:expect-error
  <Provider/>;
  // typings:expect-error
  <Provider store=""/>;

  let store: Store<{}>;
  <Provider store={store}/>;
}
