import { ComponentClass, Component, StatelessComponent, ReactNode } from 'react';
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
export function connect<State, TOwnProps>(): ComponentDecorator<{ dispatch: Dispatch<State> }, TOwnProps>;

export function connect<State, TOwnProps, TStateProps>(
  mapStateToProps: MapStateToProps<State, TOwnProps, TStateProps>,
): ComponentDecorator<TStateProps & { dispatch: Dispatch<State> }, TOwnProps>;

export function connect<State, TOwnProps, TStateProps, TDispatchProps>(
  mapStateToProps: MapStateToProps<State, TOwnProps, TStateProps>,
  mapDispatchToProps: MapDispatchToPropsFunction<State, TOwnProps, TDispatchProps>|TDispatchProps
): ComponentDecorator<TStateProps & TDispatchProps, TOwnProps>;

export function connect<State, TOwnProps, TDispatchProps>(
  mapStateToProps: null,
  mapDispatchToProps: MapDispatchToPropsFunction<State, TOwnProps, TDispatchProps>|TDispatchProps
): ComponentDecorator<TDispatchProps, TOwnProps>;

export function connect<State, TOwnProps, TStateProps, TDispatchProps, TMergeProps>(
  mapStateToProps: MapStateToProps<State, TOwnProps, TStateProps>,
  mapDispatchToProps: MapDispatchToPropsFunction<State, TOwnProps, TDispatchProps>|TDispatchProps,
  mergeProps: MergeProps<TOwnProps, TStateProps, TDispatchProps, TMergeProps>,
  options?: Options
): ComponentDecorator<TStateProps & TDispatchProps, TOwnProps>;

interface MapStateToProps<State, TOwnProps, TStateProps> {
  (state: State, ownProps: TOwnProps): TStateProps;
}

interface MapDispatchToPropsFunction<State, TOwnProps, TDispatchProps> {
  (dispatch: Dispatch<State>, ownProps: TOwnProps): TDispatchProps;
}

interface MergeProps<TOwnProps, TStateProps, TDispatchProps, TMergeProps> {
  (ownProps: TOwnProps, stateProps: TStateProps, dispatchProps: TDispatchProps): TMergeProps;
}

interface Options {
  pure?: boolean;
  withRef?: boolean;
}

/**
 * Typescript does not support generic components in tsx yet in an intuïtive way which is the reason we avoid a
 * generic parameter in Store here by using any as the type
 */
export interface ProviderProps {
  store: Store<any>;
}

export class Provider extends Component<ProviderProps, {}> { }
