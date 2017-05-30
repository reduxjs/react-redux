

declare module "react-redux" {
	import { ComponentClass, Component, StatelessComponent, ReactNode } from 'react';
	import { Store, Dispatch, ActionCreator } from 'redux';

	interface ComponentDecorator<TOriginalProps, TOwnProps> {
		(component: ComponentClass<TOriginalProps>|StatelessComponent<TOriginalProps>): ComponentClass<TOwnProps>;
	}

	/**
	 * Decorator that infers the type from the original component
	 *
	 * Can't use the above decorator because it would default the type to {}
	 */
	export interface InferableComponentDecorator {
		<P, TComponentConstruct extends (ComponentClass<P>|StatelessComponent<P>)>(component: TComponentConstruct): TComponentConstruct;
	}

	/**
	 * Following 3 functions cover all possible ways connect could be invoked
	 *
	 * - State: Redux state interface (the same one used by Store<S>)
	 * - TStateProps: Result of MapStateToProps
	 * - TDispatchProps: Result of MapDispatchToProps
	 * - TOwnProps: Props passed to the wrapping component
	 */
	export function connect(): InferableComponentDecorator;

	export function connect<State, TStateProps, TDispatchProps, TOwnProps>(
		mapStateToProps: MapStateToProps<State, TStateProps, TOwnProps>,
		mapDispatchToProps?: MapDispatchToPropsFunction<State, TDispatchProps, TOwnProps>|MapDispatchToPropsObject
	): ComponentDecorator<TStateProps & TDispatchProps, TOwnProps>;

	export function connect<State, TStateProps, TDispatchProps, TOwnProps>(
		mapStateToProps: MapStateToProps<State, TStateProps, TOwnProps>,
		mapDispatchToProps: MapDispatchToPropsFunction<State, TDispatchProps, TOwnProps>|MapDispatchToPropsObject,
		mergeProps: MergeProps<TStateProps, TDispatchProps, TOwnProps>,
		options?: Options
	): ComponentDecorator<TStateProps & TDispatchProps, TOwnProps>;

	interface MapStateToProps<State, TStateProps, TOwnProps> {
		(state: State, ownProps?: TOwnProps): TStateProps;
	}

	/**
	 * State is not actually used here but included for consistency with Redux typings and MapStateToProps.
	 */
	interface MapDispatchToPropsFunction<State, TDispatchProps, TOwnProps> {
		(dispatch: Dispatch<State>, ownProps?: TOwnProps): TDispatchProps;
	}

	/**
	 * Any since not every ActionCreator returns the same Action
	 */
	interface MapDispatchToPropsObject {
		[name: string]: ActionCreator<any>;
	}

	interface MergeProps<TStateProps, TDispatchProps, TOwnProps> {
		(stateProps: TStateProps, dispatchProps: TDispatchProps, ownProps: TOwnProps): TStateProps & TDispatchProps;
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
		store?: Store<any>;
		children?: ReactNode;
	}

	export class Provider extends Component<ProviderProps, {}> { }
}