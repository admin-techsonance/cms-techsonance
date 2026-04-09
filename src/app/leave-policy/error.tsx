'use client';

import { Button } from '@/components/ui/button';

export default function LeavePolicyError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="space-y-3 text-center">
        <h2 className="text-2xl font-semibold">Leave policy failed to load</h2>
        <p className="text-sm text-muted-foreground">
          {process.env.NODE_ENV === 'development' ? error.message : 'Please try again.'}
        </p>
        <Button onClick={reset} type="button" variant="outline">
          Retry
        </Button>
      </div>
    </div>
  );
}
