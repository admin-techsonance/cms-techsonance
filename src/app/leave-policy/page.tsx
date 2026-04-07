'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ChevronLeft } from 'lucide-react';
import { LeavePolicyContent } from '@/components/dashboard/LeavePolicyContent';

export default function StandaloneLeavePolicyPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-white">
      {/* Standalone Navigation Bar */}
      <header className="sticky top-0 z-50 w-full border-b bg-white/80 backdrop-blur-md">
        <div className="container flex h-16 items-center px-4 max-w-7xl mx-auto">
          <Button 
            variant="ghost" 
            className="gap-2 text-slate-500 hover:text-slate-900"
            onClick={() => window.close()}
          >
            <ChevronLeft className="h-4 w-4" />
            Close Policy
          </Button>
          <div className="ml-auto flex items-center gap-4">
             <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Techsonance Official Policy</span>
          </div>
        </div>
      </header>

      {/* Content Area */}
      <main className="container px-4 pt-8 max-w-7xl mx-auto mb-12">
        <LeavePolicyContent />
      </main>
    </div>
  );
}
