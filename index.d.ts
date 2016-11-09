import { ComponentClass, Component, StatelessComponent } from 'react';
import { Store, Dispatch, ActionCreator } from 'redux';

interface ComponentDecorator<TOriginalProps, TOwnProps> {
  (component: StatelessComponent<TOriginalProps>|ComponentClass<TOriginalProps>): ComponentClass<TOwnProps>;
}

/**
 * Following 5 functions cover all possible ways connect could be invoked
 *
 * - State: Redux state interface (the same one used by Store<S>)
 * - TOwnProps: Props passed to the wrapping component
 * - TStateProps: Result of MapStateToProps
 * - TDispatchProps: Result of MapDispatchToProps
 */
function connect<State, TOwnProps>(): ComponentDecorator<{ dispatch: Dispatch<State> } & TOwnProps, TOwnProps>;

function connect<State, TOwnProps, TStateProps>(
  mapStateToProps: FuncOrSelf<MapStateToProps<State, TOwnProps, TStateProps>>,
): ComponentDecorator<TStateProps & { dispatch: Dispatch<State> } & TOwnProps, TOwnProps>;

function connect<State, TOwnProps, TStateProps, TDispatchProps>(
  mapStateToProps: FuncOrSelf<MapStateToProps<State, TOwnProps, TStateProps>>,
  mapDispatchToProps: FuncOrSelf<MapDispatchToPropsFunction<State, TOwnProps, TDispatchProps> | MapDispatchToPropsObject & TDispatchProps>
): ComponentDecorator<TStateProps & TDispatchProps & TOwnProps, TOwnProps>;

function connect<State, TOwnProps, TDispatchProps>(
  mapStateToProps: null,
  mapDispatchToProps: FuncOrSelf<MapDispatchToPropsFunction<State, TOwnProps, TDispatchProps> | MapDispatchToPropsObject & TDispatchProps>
): ComponentDecorator<TDispatchProps & TOwnProps, TOwnProps>;

function connect<State, TOwnProps, TStateProps, TDispatchProps, TMergeProps>(
  mapStateToProps: FuncOrSelf<MapStateToProps<State, TOwnProps, TStateProps>>,
  mapDispatchToProps: FuncOrSelf<MapDispatchToPropsFunction<State, TOwnProps, TDispatchProps>| MapDispatchToPropsObject & TDispatchProps>,
  mergeProps: MergeProps<TOwnProps, TStateProps, TDispatchProps, TMergeProps>,
  options?: Options
): ComponentDecorator<TMergeProps, TOwnProps>;

interface MapDispatchToPropsObject {
  [name: string]: ActionCreator<any>;
}

interface MapStateToProps<State, TOwnProps, TStateProps> {
  (state: State, ownProps: TOwnProps): TStateProps;
}

interface MapDispatchToPropsFunction<State, TOwnProps, TDispatchProps> {
  (dispatch: Dispatch<State>, ownProps: TOwnProps): TDispatchProps;
}

interface MergeProps<TOwnProps, TStateProps, TDispatchProps, TMergeProps> {
  (stateProps: TStateProps, dispatchProps: TDispatchProps, ownProps: TOwnProps): TMergeProps;
}

interface Options {
  pure?: boolean;
  withRef?: boolean;
}

type FuncOrSelf<T> = T | (() => T);

/**
 * Typescript does not support generic components in tsx yet in an intuïtive way which is the reason we avoid a
 * generic parameter in Store here by using any as the type
 */
export interface ProviderProps {
  store: Store<any>;
}

export class Provider extends Component<ProviderProps, {}> { }
