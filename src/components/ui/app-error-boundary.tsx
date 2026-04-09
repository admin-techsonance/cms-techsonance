'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { reportClientError } from '@/lib/client-logger';

type Props = {
  children: React.ReactNode;
  title?: string;
  description?: string;
};

type State = {
  hasError: boolean;
};

export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = {
    hasError: false,
  };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    reportClientError(error, { source: 'react_error_boundary' });
  }

  private handleReset = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="flex min-h-[280px] items-center justify-center rounded-lg border border-border bg-card p-8">
        <div className="space-y-3 text-center">
          <h2 className="text-xl font-semibold">{this.props.title ?? 'Something went wrong'}</h2>
          <p className="text-sm text-muted-foreground">
            {this.props.description ?? 'This section could not be loaded right now.'}
          </p>
          <Button onClick={this.handleReset} type="button" variant="outline">
            Try Again
          </Button>
        </div>
      </div>
    );
  }
}
