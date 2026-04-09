'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Mail, Lock, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import Image from 'next/image';
import { Checkbox } from '@/components/ui/checkbox';
import { persistClientSession } from '@/lib/client-session';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, rememberMe }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Login failed');
        setLoading(false);
        return;
      }

      if (data.accessToken || data.token) {
        persistClientSession({
          accessToken: data.accessToken || data.token,
          user: data.user,
          rememberMe,
        });
      }

      // Redirect to dashboard
      router.push('/dashboard');
      router.refresh();
    } catch (err) {
      setError('An error occurred. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden font-sans">
      {/* Left Column: Visuals & Branding */}
      <div className="hidden lg:flex lg:w-1/2 relative flex-col justify-center items-center p-12 bg-[#F8FAFC] dark:bg-[#0A1A2F] gap-12">
        <div className="relative z-10 w-full flex flex-col items-center">
          <div className="flex flex-col items-center gap-4 mb-2 animate-in slide-in-from-top duration-700">
            <div className="relative h-12 w-12">
              <Image
                src="/logo-icon.png"
                alt="TechSonance Logo"
                fill
                className="object-contain"
                priority
              />
            </div>
            <span className="text-2xl font-bold text-[#0A1A2F] dark:text-white tracking-tight">
              TechSonance InfoTech LLP
            </span>
          </div>
          
          <p className="text-base font-medium text-muted-foreground whitespace-nowrap animate-in fade-in duration-1000 delay-300">
            Empowering Businesses with Scalable Tech Solutions
          </p>
        </div>

        <div className="relative w-full aspect-square max-w-[450px] animate-in zoom-in duration-1000 delay-500">
           <Image
             src="/login-illustration.png"
             alt="CMS Portal Illustration"
             fill
             className="object-contain"
             priority
           />
        </div>

        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2 text-xs text-muted-foreground opacity-60">
          <span>&copy; {new Date().getFullYear()} TechSonance InfoTech LLP. All rights reserved.</span>
        </div>
        
        {/* Subtle Decorative Element */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -mr-32 -mt-32" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-primary/5 rounded-full blur-3xl -ml-48 -mb-48" />
      </div>

      {/* Right Column: Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center bg-white dark:bg-[#0A1A2F] p-8 lg:p-12 relative overflow-y-auto">
        <div className="w-full max-w-md space-y-8 animate-in fade-in slide-in-from-right duration-500">
          {/* Mobile Logo */}
          <div className="lg:hidden flex justify-center mb-8">
            <div className="relative h-16 w-16">
              <Image
                src="/logo-icon.png"
                alt="TechSonance InfoTech"
                fill
                className="object-contain"
              />
            </div>
          </div>

          <div className="space-y-2 text-center lg:text-left">
            <h1 className="text-4xl lg:text-5xl font-extrabold tracking-tight text-[#0A1A2F] dark:text-white">
              CMS Portal
            </h1>
            <p className="text-muted-foreground text-sm">
              Login to manage your business seamlessly
            </p>
          </div>

          <div className="mt-8">
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <Alert variant="destructive" className="animate-in head-shake duration-300">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email / Username</Label>
                <div className="relative group">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="Enter your email or username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10 h-11 border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900 focus-visible:ring-primary h-12"
                    required
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                </div>
                <div className="relative group">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 pr-10 h-11 border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900 focus-visible:ring-primary h-12"
                    required
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between py-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="remember"
                    checked={rememberMe}
                    onCheckedChange={(checked) => setRememberMe(Boolean(checked))}
                    className="data-[state=checked]:bg-primary flex h-4 w-4 items-center justify-center rounded-sm border border-primary shrink-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <label
                    htmlFor="remember"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                  >
                    Keep me logged in
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => router.push('/forgot-password')}
                  className="text-sm font-medium text-primary hover:underline underline-offset-4"
                >
                  Forgot password?
                </button>
              </div>

              <Button
                type="submit"
                className="w-full h-12 text-base font-semibold shadow-xl shadow-primary/20 bg-primary hover:bg-primary/90 transition-all active:scale-[0.98]"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Authenticating...
                  </>
                ) : (
                  'Login'
                )}
              </Button>
            </form>

            <div className="mt-8 text-center sm:hidden">
               <p className="text-xs text-muted-foreground">
                  Powered by <span className="font-semibold text-primary">TechSonance InfoTech LLP</span>
               </p>
            </div>
            

          </div>
        </div>
      </div>
    </div>
  );
}
