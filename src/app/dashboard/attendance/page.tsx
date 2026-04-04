'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function AttendanceRedirect() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to the unified attendance hub in My Account
    router.replace('/dashboard/my-account?tab=all-attendance');
  }, [router]);

  return (
    <div className="flex h-[400px] flex-col items-center justify-center space-y-4">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-muted-foreground">Redirecting to Attendance Management...</p>
    </div>
  );
}
