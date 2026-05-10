import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { error: Error | null };

export class RootErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[Foretrace]', error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="p-4 font-sans text-zinc-900">
          <h1 className="text-lg font-semibold">This page hit a React error</h1>
          <pre className="mt-3 max-h-[50vh] overflow-auto whitespace-pre-wrap rounded-lg bg-zinc-100 p-3 text-sm">
            {this.state.error.stack ?? this.state.error.message}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}
