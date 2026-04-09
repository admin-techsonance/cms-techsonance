'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { 
  Calendar as CalendarIcon, 
  Clock, 
  Info, 
  RefreshCcw, 
  X, 
  FileText, 
  User, 
  CheckCircle2, 
  History,
  PlaneTakeoff,
  Stethoscope,
  Heart,
  BookOpen
} from 'lucide-react';
import { format, parseISO, isWithinInterval, addMonths, startOfMonth, subDays } from 'date-fns';
import { calculateAccruedBalances, calculateActualLeaveDays, PUBLIC_HOLIDAYS_2026 } from '@/lib/leave-utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { leaveRequestFormSchema, leavePeriodOptions, leaveTypeOptions, type LeaveRequestFormValues } from '@/lib/forms/schemas';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

interface LeaveRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeData: any;
  userRole: string;
  onSuccess: () => void;
}

const LEAVE_TYPES = [
  { id: 'annual', label: 'Annual', icon: PlaneTakeoff, color: 'text-blue-500' },
  { id: 'sick', label: 'Sick', icon: Stethoscope, color: 'text-red-500' },
  { id: 'family', label: 'Family Responsibility', icon: Heart, color: 'text-pink-500' },
  { id: 'maternity', label: 'Maternity', icon: User, color: 'text-purple-500' },
  { id: 'paternity', label: 'Paternity', icon: User, color: 'text-indigo-500' },
  { id: 'study', label: 'Study', icon: BookOpen, color: 'text-green-500' },
  { id: 'unpaid', label: 'Unpaid', icon: Clock, color: 'text-orange-500' },
];

export function LeaveRequestDialog({ open, onOpenChange, employeeData, userRole, onSuccess }: LeaveRequestDialogProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('request');
  const [loading, setLoading] = useState(false);
  const form = useForm<LeaveRequestFormValues>({
    resolver: zodResolver(leaveRequestFormSchema),
    defaultValues: {
      period: 'full_day',
      type: 'annual',
      from: '',
      to: '',
      reason: '',
    },
  });
  const leaveValues = form.watch();

  const balances = useMemo(() => {
    if (!employeeData?.dateOfJoining) return null;
    return calculateAccruedBalances(employeeData.dateOfJoining, userRole);
  }, [employeeData?.dateOfJoining, userRole]);

  const actualDays = useMemo(() => {
    return calculateActualLeaveDays(leaveValues.from, leaveValues.to);
  }, [leaveValues.from, leaveValues.to]);

  const handleClear = () => {
    form.reset({
      period: 'full_day',
      type: 'annual',
      from: '',
      to: '',
      reason: '',
    });
  };

  const handleSubmit = async (values: LeaveRequestFormValues) => {
    setLoading(true);
    try {
      const response = await fetch('/api/leave-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          employeeId: employeeData.id,
          leaveType: values.type,
          startDate: values.from,
          endDate: values.to,
          reason: values.reason,
          leavePeriod: values.period,
          actualDays: actualDays,
        }),
      });

      if (response.ok) {
        onSuccess();
        onOpenChange(false);
        handleClear();
        toast.success('Leave request submitted successfully');
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to submit leave request');
      }
    } catch {
      toast.error('Failed to submit leave request');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] lg:max-w-[1250px] w-full p-0 overflow-hidden bg-white max-h-[95vh] h-[850px] flex flex-col">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex-1 flex flex-col overflow-hidden">
          <DialogHeader className="p-6 pb-0 border-b bg-white shrink-0">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-xl font-bold">Create New Leave Request</DialogTitle>
            </div>
            <TabsList className="bg-transparent h-auto p-0 gap-8 mt-4">
              <TabsTrigger 
                value="request" 
                className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none px-0 py-2 font-semibold"
              >
                Request
              </TabsTrigger>
              <TabsTrigger 
                value="summary" 
                className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none px-0 py-2 font-semibold"
              >
                Summary
              </TabsTrigger>
              <TabsTrigger 
                value="profile" 
                className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none px-0 py-2 font-semibold"
              >
                My Leave Profile
              </TabsTrigger>
            </TabsList>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-6 bg-white min-h-0">
            <TabsContent value="request" className="mt-0 outline-none">
              <div className="flex flex-col xl:flex-row gap-8">
                {/* Left Column: Form Details (Flexible) */}
                <div className="flex-1 space-y-6 min-w-0">
                  <div className="flex items-center gap-4 p-4 bg-white rounded-xl border border-slate-100 shadow-sm">
                    <Avatar className="h-12 w-12 border-2 border-slate-50">
                      <AvatarImage src={employeeData?.avatarUrl} />
                      <AvatarFallback className="bg-primary/5 text-primary text-sm">
                        {employeeData?.firstName?.[0]}{employeeData?.lastName?.[0]}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <h3 className="font-bold text-slate-900">{employeeData?.firstName} {employeeData?.lastName}</h3>
                      <p className="text-xs text-slate-500">Employee Profile</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-slate-600 font-semibold text-xs">Leave Period</Label>
                      <Select value={leaveValues.period} onValueChange={(v) => void form.setValue('period', v as LeaveRequestFormValues['period'], { shouldValidate: true })}>
                        <SelectTrigger className="bg-white border-slate-200">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {leavePeriodOptions.map((period) => (
                            <SelectItem key={period} value={period}>
                              {period === 'full_day' ? 'Full Day' : period === 'half_day' ? 'Half Day' : 'Hourly'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {form.formState.errors.period && <p className="text-xs text-destructive">{form.formState.errors.period.message}</p>}
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-slate-600 font-semibold text-xs">Leave Type</Label>
                      <Select value={leaveValues.type} onValueChange={(v) => void form.setValue('type', v as LeaveRequestFormValues['type'], { shouldValidate: true })}>
                        <SelectTrigger className="bg-white border-slate-200">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {LEAVE_TYPES.filter((type) => leaveTypeOptions.includes(type.id as (typeof leaveTypeOptions)[number])).map(type => (
                            <SelectItem key={type.id} value={type.id}>
                              {type.label} ({balances?.[type.id as keyof typeof balances] ?? '0.00'})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {form.formState.errors.type && <p className="text-xs text-destructive">{form.formState.errors.type.message}</p>}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-slate-600 font-semibold text-xs">Take Leave From</Label>
                      <Input 
                        type="date" 
                        className="bg-white border-slate-200"
                        value={leaveValues.from}
                        onChange={(e) => void form.setValue('from', e.target.value, { shouldValidate: true })}
                      />
                      {form.formState.errors.from && <p className="text-xs text-destructive">{form.formState.errors.from.message}</p>}
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-slate-600 font-semibold text-xs">...up to and including</Label>
                      <Input 
                        type="date" 
                        className="bg-white border-slate-200"
                        value={leaveValues.to}
                        onChange={(e) => void form.setValue('to', e.target.value, { shouldValidate: true })}
                      />
                      {form.formState.errors.to && <p className="text-xs text-destructive">{form.formState.errors.to.message}</p>}
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-4 items-end">
                    <div className="flex-1 w-full space-y-1.5">
                      <Label className="text-slate-600 font-semibold text-xs">Actual Days Requested</Label>
                      <Input 
                        readOnly 
                        value={actualDays}
                        placeholder="0"
                        className="bg-slate-50 border-slate-200 font-bold text-slate-700"
                      />
                    </div>
                    <Button 
                      variant="outline" 
                      className="w-full sm:w-auto gap-2 text-primary border-primary hover:bg-primary/5 uppercase font-bold tracking-wider text-[10px]"
                      onClick={handleClear}
                    >
                      <RefreshCcw className="h-3.5 w-3.5" />
                      Clear Selection
                    </Button>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-slate-600 font-semibold text-xs">Comments</Label>
                    <Textarea 
                      placeholder="Add leave request Comments here"
                      className="min-h-[100px] bg-white border-slate-200 text-sm"
                      value={leaveValues.reason}
                      onChange={(e) => void form.setValue('reason', e.target.value, { shouldValidate: true })}
                    />
                    {form.formState.errors.reason && <p className="text-xs text-destructive">{form.formState.errors.reason.message}</p>}
                  </div>
                </div>

                {/* Middle Column: Calendar (Fixed width on desktop) */}
                <div className="w-full xl:w-[320px] shrink-0 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Select Date Range</h4>
                    <Info className="h-3.5 w-3.5 text-primary/50" />
                  </div>
                  
                  <div className="p-4 bg-white rounded-xl border border-slate-100 shadow-sm space-y-6">
                    {/* Simplified Calendar Preview */}
                    {[
                      { month: 'April 2026', days: 30 },
                      { month: 'May 2026', days: 31 }
                    ].map((cal, idx) => (
                      <div key={idx} className="space-y-3">
                        <div className="px-2 bg-slate-900 text-white py-1.5 rounded-md text-center">
                           <span className="text-[10px] font-bold uppercase tracking-wider">{cal.month}</span>
                        </div>
                        <div className="grid grid-cols-7 gap-1 text-[9px] text-center font-bold text-slate-400">
                          {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d=><div key={d}>{d}</div>)}
                        </div>
                        <div className="grid grid-cols-7 gap-1 text-[10px] text-center">
                           {Array.from({length: cal.days}).map((_, i) => (
                             <div key={i} className="p-1 rounded hover:bg-slate-50 cursor-pointer">{i+1}</div>
                           ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right Column: Calculation Sidebar */}
                <div className="w-full xl:w-[280px] shrink-0 space-y-4">
                  <div className="flex items-center justify-between">
                     <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Calculation</h4>
                     <History className="h-3.5 w-3.5 text-primary/50" />
                  </div>
                  
                  <div className="flex flex-col gap-3">
                    <div className="p-3 bg-blue-50 border-l-2 border-primary rounded-r-lg">
                      <p className="text-[11px] font-bold text-blue-900">Summary Information</p>
                    </div>

                    <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 space-y-3">
                       {[
                         { label: 'Total Work Days', value: actualDays },
                         { label: 'Weekend Days', value: 0 },
                         { label: 'Public Holidays', value: 0 },
                         { label: 'Policy Days', value: actualDays },
                       ].map((item, i) => (
                         <div key={i} className="flex justify-between border-b border-slate-50 pb-2 last:border-0">
                            <span className="text-[11px] text-slate-500 font-medium">{item.label}</span>
                            <span className="text-[11px] font-bold text-slate-900">{item.value}</span>
                         </div>
                       ))}
                    </div>

                    <div className="bg-emerald-600 p-4 rounded-xl shadow-lg shadow-emerald-200/50 text-center text-white">
                      <p className="text-[10px] font-bold uppercase tracking-wider opacity-80">Final Balance</p>
                      <p className="text-2xl font-black mt-1">
                        {((balances?.[leaveValues.type as keyof typeof balances] || 0) - actualDays).toFixed(2)}
                      </p>
                      <p className="text-[9px] mt-1 opacity-70">Estimated days remaining</p>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="summary" className="mt-0 outline-none">
              <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden divide-y divide-slate-50">
                {LEAVE_TYPES.filter(t => t.id !== 'unpaid').map(type => (
                  <div key={type.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-full bg-slate-900 flex items-center justify-center text-white font-bold text-xs">
                        {type.label.split(' ').map(s=>s[0]).join('')}
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 text-sm">{type.label}</h4>
                        <p className="text-[10px] text-slate-500">Leave balances (days)</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 sm:gap-8">
                      <div className="text-center">
                        <span className="text-[9px] uppercase font-bold text-slate-400 block mb-1">Current</span>
                        <Badge className="bg-blue-600 hover:bg-blue-700 min-w-[50px] justify-center text-[10px]">{balances?.[type.id as keyof typeof balances]?.toFixed(2) || '0.00'}</Badge>
                      </div>
                      <div className="text-center">
                        <span className="text-[9px] uppercase font-bold text-slate-400 block mb-1">Pending</span>
                        <Badge variant="destructive" className="min-w-[50px] justify-center text-[10px]">0.00</Badge>
                      </div>
                      <div className="text-center">
                        <span className="text-[9px] uppercase font-bold text-slate-400 block mb-1">Total</span>
                        <Badge className="bg-emerald-600 hover:bg-emerald-700 min-w-[50px] justify-center text-[10px]">{balances?.[type.id as keyof typeof balances]?.toFixed(2) || '0.00'}</Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="profile" className="mt-0 outline-none space-y-6 pb-6">
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <section className="space-y-2">
                     <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1">Profile Details</h4>
                     <div className="p-4 bg-white rounded-xl border border-slate-100 shadow-sm space-y-4">
                        {[
                          { label: 'Policy Name', value: 'BBD INDIA Standard' },
                          { label: 'Staff Start Date', value: employeeData?.dateOfJoining || 'N/A' },
                          { label: 'Cycle End Date', value: '31 Mar 2027' },
                        ].map((item, i) => (
                          <div key={i} className="flex justify-between items-center border-b border-slate-50 pb-2 last:border-0 last:pb-0">
                             <Label className="text-xs text-slate-500">{item.label}</Label>
                             <span className="text-xs font-bold text-slate-700">{item.value}</span>
                          </div>
                        ))}
                     </div>
                  </section>

                  <section className="space-y-2">
                     <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1">Approvers</h4>
                     <div className="p-4 bg-white rounded-xl border border-slate-100 shadow-sm">
                        <div className="flex items-center gap-3">
                           <div className="h-8 w-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">SP</div>
                           <div>
                              <p className="text-xs font-bold text-slate-700">Sreenivasulu Parla</p>
                              <p className="text-[10px] text-slate-400">Primary Approver</p>
                           </div>
                        </div>
                     </div>
                  </section>
               </div>

               <section className="space-y-2">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1">Entitlement Overview</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                     {[
                       { label: 'Annual Leave', value: '20 Days/Year', sub: '1.67 per month' },
                       { label: 'Sick Leave', value: '10 Days/Year', sub: 'Standard cycle' },
                       { label: 'Family Leave', value: '3 Days/Year', sub: 'Fixed' },
                       { label: 'Study Leave', value: '8 Days/Year', sub: 'Fixed' },
                     ].map((item, i) => (
                       <div key={i} className="p-4 bg-white rounded-xl border border-slate-100 shadow-sm text-center">
                          <p className="text-[10px] text-slate-400 uppercase font-bold mb-1">{item.label}</p>
                          <p className="text-sm font-bold text-slate-700">{item.value}</p>
                          <p className="text-[9px] text-slate-400 mt-1">{item.sub}</p>
                       </div>
                     ))}
                  </div>
               </section>
            </TabsContent>
          </div>
        </Tabs>

        <DialogFooter className="p-6 pt-2 border-t bg-white shrink-0 flex flex-col sm:flex-row items-center justify-between gap-4 mt-auto">
          <Button 
            variant="ghost" 
            className="text-primary gap-2 hover:bg-primary/5 font-bold uppercase tracking-wider text-[10px] p-0 h-auto"
            onClick={() => window.open('/leave-policy', '_blank')}
          >
            <RefreshCcw className="h-3.5 w-3.5" />
            View Full Leave Policy
          </Button>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button 
              className="flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-700 font-bold uppercase tracking-wider text-xs gap-2 py-5"
              onClick={() => void form.handleSubmit(handleSubmit, () => toast.error('Please fix the leave request details'))()}
              disabled={loading}
            >
              <RefreshCcw className={cn("h-4 w-4", loading && "animate-spin")} />
              Submit Request
            </Button>
            <Button 
              variant="outline" 
              className="flex-1 sm:flex-none font-bold uppercase tracking-wider text-xs gap-2 py-5"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
              Cancel
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
