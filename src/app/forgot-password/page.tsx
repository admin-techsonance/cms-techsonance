'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Label } from '@/components/ui/label';
import { Loader2, Mail, KeyRound, Lock } from 'lucide-react';
import { toast } from 'sonner';

type ResetStep = 1 | 2 | 3;

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<ResetStep>(1);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const stepItems = useMemo(() => ([
    { id: 1, icon: Mail, label: 'Email' },
    { id: 2, icon: KeyRound, label: 'Verify' },
    { id: 3, icon: Lock, label: 'Reset' },
  ]), []);

  const handleRequestOtp = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);

    try {
      const response = await fetch('/api/auth/forgot-password/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        toast.error('Unable to send the verification code right now. Please try again.');
        return;
      }

      toast.success('If the email exists, a verification code has been sent.');
      setStep(2);
    } catch {
      toast.error('Unable to send the verification code right now. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);

    try {
      const response = await fetch('/api/auth/forgot-password/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp }),
      });

      const data = await response.json();

      if (!response.ok) {
        toast.error('Unable to verify the code. Please try again.');
        return;
      }

      toast.success('Verification code accepted.');
      setStep(3);
    } catch {
      toast.error('Unable to verify the code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);

    try {
      const response = await fetch('/api/auth/forgot-password/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          otp,
          newPassword,
          confirmPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        toast.error('Unable to reset your password right now. Please try again.');
        return;
      }

      toast.success('Password reset successful. Redirecting to login...');
      setTimeout(() => {
        router.push('/login');
      }, 1200);
    } catch {
      toast.error('Unable to reset your password right now. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden font-sans">
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
            Secure account recovery for your CMS workspace
          </p>
        </div>

        <div className="relative w-full aspect-square max-w-[450px] animate-in zoom-in duration-1000 delay-500">
          <Image
            src="/login-illustration.png"
            alt="Forgot password illustration"
            fill
            className="object-contain"
            priority
          />
        </div>

        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2 text-xs text-muted-foreground opacity-60">
          <span>&copy; {new Date().getFullYear()} TechSonance InfoTech LLP. All rights reserved.</span>
        </div>

        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -mr-32 -mt-32" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-primary/5 rounded-full blur-3xl -ml-48 -mb-48" />
      </div>

      <div className="w-full lg:w-1/2 flex items-center justify-center bg-white dark:bg-[#0A1A2F] p-8 lg:p-12 relative overflow-y-auto">
        <div className="w-full max-w-md space-y-8 animate-in fade-in slide-in-from-right duration-500">
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
              Forgot Password
            </h1>
            <p className="text-muted-foreground text-sm">
              Verify your email, confirm the OTP, and set a new password
            </p>
          </div>

          <div className="flex items-center justify-between gap-4">
            {stepItems.map((item, index) => {
              const isActive = step >= item.id;
              const Icon = item.icon;

              return (
                <div key={item.id} className="flex items-center flex-1 last:flex-none">
                  <div className="flex flex-col items-center gap-2">
                    <div className={`flex h-12 w-12 items-center justify-center rounded-full border-2 transition-colors ${isActive ? 'border-primary bg-primary text-primary-foreground' : 'border-zinc-300 text-zinc-400 dark:border-zinc-700 dark:text-zinc-500'}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className={`text-xs font-medium ${isActive ? 'text-primary' : 'text-muted-foreground'}`}>
                      {item.label}
                    </span>
                  </div>
                  {index < stepItems.length - 1 ? (
                    <div className={`mx-3 h-1 flex-1 rounded-full ${step > item.id ? 'bg-primary' : 'bg-zinc-200 dark:bg-zinc-800'}`} />
                  ) : null}
                </div>
              );
            })}
          </div>

          {step === 1 ? (
            <form onSubmit={handleRequestOtp} className="space-y-5" autoComplete="off">
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <div className="relative group">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="Enter your registered email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="pl-10 h-12 border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900 focus-visible:ring-primary"
                    autoComplete="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    required
                    disabled={loading}
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-12 text-base font-semibold shadow-xl shadow-primary/20 bg-primary hover:bg-primary/90 transition-all active:scale-[0.98]"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Sending OTP...
                  </>
                ) : 'Send OTP'}
              </Button>
            </form>
          ) : null}

          {step === 2 ? (
            <form onSubmit={handleVerifyOtp} className="space-y-5" autoComplete="off">
              <div className="space-y-2">
                <Label>Enter 6-digit OTP</Label>
                <InputOTP
                  maxLength={6}
                  value={otp}
                  onChange={setOtp}
                  containerClassName="justify-between"
                >
                  <InputOTPGroup className="w-full justify-between gap-2">
                    {Array.from({ length: 6 }).map((_, index) => (
                      <InputOTPSlot
                        key={index}
                        index={index}
                        className="h-12 w-12 rounded-md border text-base"
                      />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
                <p className="text-xs text-muted-foreground">
                  We sent the OTP to <span className="font-medium text-foreground">{email}</span>
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-12"
                  onClick={() => {
                    setStep(1);
                    setOtp('');
                  }}
                  disabled={loading}
                >
                  Change Email
                </Button>
                <Button
                  type="submit"
                  className="h-12 text-base font-semibold shadow-xl shadow-primary/20 bg-primary hover:bg-primary/90 transition-all active:scale-[0.98]"
                  disabled={loading || otp.length !== 6}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Verifying...
                    </>
                  ) : 'Verify OTP'}
                </Button>
              </div>
            </form>
          ) : null}

          {step === 3 ? (
            <form onSubmit={handleResetPassword} className="space-y-5" autoComplete="off">
              <div className="space-y-2">
                <Label htmlFor="new-password">New Password</Label>
                <div className="relative group">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  <Input
                    id="new-password"
                    type="password"
                    placeholder="Enter your new password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    className="pl-10 h-12 border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900 focus-visible:ring-primary"
                    autoComplete="new-password"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    data-lpignore="true"
                    data-1p-ignore="true"
                    minLength={12}
                    required
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm Password</Label>
                <div className="relative group">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  <Input
                    id="confirm-password"
                    type="password"
                    placeholder="Confirm your new password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    className="pl-10 h-12 border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900 focus-visible:ring-primary"
                    autoComplete="new-password"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    data-lpignore="true"
                    data-1p-ignore="true"
                    minLength={12}
                    required
                    disabled={loading}
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-12 text-base font-semibold shadow-xl shadow-primary/20 bg-primary hover:bg-primary/90 transition-all active:scale-[0.98]"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Updating Password...
                  </>
                ) : 'Reset Password'}
              </Button>
            </form>
          ) : null}

          <div className="text-center text-sm text-muted-foreground">
            Remember your password?{' '}
            <Link href="/login" className="font-semibold text-primary hover:underline underline-offset-4">
              Back to Login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
