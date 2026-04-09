'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardSidebar } from '@/components/dashboard/sidebar';
import { DashboardHeader } from '@/components/dashboard/header';
import { User } from '@/lib/auth';
import { Loader2 } from 'lucide-react';
import { AppErrorBoundary } from '@/components/ui/app-error-boundary';
import { clearClientSession, getStoredSessionToken } from '@/lib/client-session';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      const token = getStoredSessionToken();
      
      if (!token) {
        router.push('/login');
        return;
      }

      try {
        const response = await fetch('/api/auth/me', {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });

        if (!response.ok) {
          clearClientSession();
          router.push('/login');
          return;
        }

        const data = await response.json();
        setUser((data?.user ?? data?.data ?? null) as User | null);
      } catch (error) {
        router.push('/login');
      } finally {
        setLoading(false);
      }
    }

    checkAuth();
  }, [router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <DashboardSidebar user={user} />
      <div className="flex-1 flex flex-col min-w-0 h-full">
        <DashboardHeader user={user} />
        <main className="flex-1 p-6 overflow-y-auto">
          <AppErrorBoundary title="Dashboard module unavailable" description="We couldn't render this dashboard section.">
            {children}
          </AppErrorBoundary>
        </main>
      </div>
    </div>
  );
}
