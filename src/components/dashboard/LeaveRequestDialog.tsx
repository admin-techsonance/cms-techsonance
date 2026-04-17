'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Dialog,
  DialogContent,
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
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
  BookOpen,
  Upload,
  File,
  Trash2,
  Loader2,
} from 'lucide-react';
import { format, parseISO, isWeekend, isBefore, isAfter, addMonths, startOfMonth, differenceInYears, differenceInMonths } from 'date-fns';
import {
  calculateAccruedBalances,
  calculateDetailedLeaveDays,
  PUBLIC_HOLIDAYS_2026,
  type LeavePolicy,
  type LeaveEntitlement,
  type LeaveCalculationBreakdown,
} from '@/lib/leave-utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { leaveRequestFormSchema, leavePeriodOptions, leaveTypeOptions, type LeaveRequestFormValues } from '@/lib/forms/schemas';
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
  { id: 'annual', label: 'Annual', icon: PlaneTakeoff, color: 'text-blue-500', abbr: 'AN' },
  { id: 'sick', label: 'Sick', icon: Stethoscope, color: 'text-red-500', abbr: 'SI' },
  { id: 'family', label: 'Family Responsibility', icon: Heart, color: 'text-pink-500', abbr: 'FA' },
  { id: 'maternity', label: 'Maternity', icon: User, color: 'text-purple-500', abbr: 'MA' },
  { id: 'paternity', label: 'Paternity', icon: User, color: 'text-indigo-500', abbr: 'PA' },
  { id: 'study', label: 'Study', icon: BookOpen, color: 'text-green-500', abbr: 'ST' },
  { id: 'unpaid', label: 'Unpaid', icon: Clock, color: 'text-orange-500', abbr: 'UN' },
];

const DOCUMENT_REQUIRED_TYPES = ['sick', 'study', 'maternity', 'family'];

/** Generate hourly options from 0:15 to 8:45 in 15-min steps */
function generateHourlyOptions() {
  const options: { value: string; label: string; hours: number }[] = [];
  for (let totalMinutes = 15; totalMinutes <= 525; totalMinutes += 15) {
    const hrs = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    let label = '';
    if (hrs === 0) {
      label = `${mins} mins`;
    } else if (mins === 0) {
      label = `${hrs} hr${hrs > 1 ? 's' : ''}`;
    } else {
      label = `${hrs} hr${hrs > 1 ? 's' : ''} ${mins} mins`;
    }
    options.push({
      value: String(totalMinutes / 60),
      label,
      hours: totalMinutes / 60,
    });
  }
  return options;
}

const HOURLY_OPTIONS = generateHourlyOptions();

/** Mini calendar component for date range selection with holiday highlights */
function MiniCalendar({
  month,
  year,
  selectedFrom,
  selectedTo,
  onSelectDate,
  holidays,
  companyHolidays,
}: {
  month: number;
  year: number;
  selectedFrom: string;
  selectedTo: string;
  onSelectDate: (dateStr: string) => void;
  holidays: Record<string, string>;
  companyHolidays: { date: string; reason: string }[];
}) {
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startWeekday = firstDay.getDay();

  const monthName = firstDay.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // Merge public holidays with company holidays for highlighting
  const allHolidays: Record<string, string> = { ...holidays };
  for (const ch of companyHolidays) {
    allHolidays[ch.date] = ch.reason;
  }

  const cells: React.ReactNode[] = [];
  // Empty cells for offset
  for (let i = 0; i < startWeekday; i++) {
    cells.push(<div key={`empty-${i}`} className="p-1" />);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateObj = new Date(year, month, day);
    const dateStr = format(dateObj, 'yyyy-MM-dd');
    const isHoliday = dateStr in allHolidays;
    const isWknd = isWeekend(dateObj);
    const fromDate = selectedFrom ? parseISO(selectedFrom) : null;
    const toDate = selectedTo ? parseISO(selectedTo) : null;
    const isStart = selectedFrom === dateStr;
    const isEnd = selectedTo === dateStr;
    const isInRange = fromDate && toDate && !isBefore(dateObj, fromDate) && !isAfter(dateObj, toDate);

    const dayCell = (
      <button
        key={day}
        type="button"
        onClick={() => onSelectDate(dateStr)}
        className={cn(
          'p-1 rounded text-[11px] w-full aspect-square flex items-center justify-center transition-all cursor-pointer font-medium',
          isStart && 'bg-slate-900 text-white rounded-l-md font-bold ring-1 ring-slate-900',
          isEnd && !isStart && 'bg-slate-900 text-white rounded-r-md font-bold ring-1 ring-slate-900',
          isStart && isEnd && 'rounded-md',
          isInRange && !isStart && !isEnd && 'bg-slate-800/10 text-slate-900 font-semibold',
          isHoliday && !isStart && !isEnd && !isInRange && 'bg-blue-100 text-blue-700 font-semibold',
          isHoliday && isInRange && !isStart && !isEnd && 'bg-blue-200 text-blue-800 font-semibold',
          isWknd && !isHoliday && !isStart && !isEnd && !isInRange && 'text-red-400',
          !isHoliday && !isWknd && !isStart && !isEnd && !isInRange && 'hover:bg-slate-100 text-slate-700',
        )}
      >
        {day}
      </button>
    );

    if (isHoliday && !isStart && !isEnd) {
      cells.push(
        <TooltipProvider key={day} delayDuration={100}>
          <Tooltip>
            <TooltipTrigger asChild>{dayCell}</TooltipTrigger>
            <TooltipContent side="top" className="text-xs max-w-[200px]">
              <p className="font-semibold">{allHolidays[dateStr]}</p>
              <p className="text-muted-foreground">Public Holiday</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    } else {
      cells.push(dayCell);
    }
  }

  return (
    <div className="space-y-2">
      <div className="px-2 bg-slate-900 text-white py-1.5 rounded-md text-center">
        <span className="text-[10px] font-bold uppercase tracking-wider">{monthName}</span>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-[9px] text-center font-bold text-slate-400">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => <div key={d}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells}
      </div>
    </div>
  );
}

export function LeaveRequestDialog({ open, onOpenChange, employeeData, userRole, onSuccess }: LeaveRequestDialogProps) {
  const [activeTab, setActiveTab] = useState('request');
  const [loading, setLoading] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [policies, setPolicies] = useState<LeavePolicy[]>([]);
  const [companyHolidays, setCompanyHolidays] = useState<{ date: string; reason: string }[]>([]);

  const form = useForm<LeaveRequestFormValues>({
    resolver: zodResolver(leaveRequestFormSchema),
    defaultValues: {
      period: 'full_day',
      type: 'annual',
      from: '',
      to: '',
      reason: '',
      attachmentUrl: '',
      attachmentName: '',
      actualHours: '',
    },
  });
  const leaveValues = form.watch();

  const isIntern = userRole.toLowerCase() === 'intern';

  // Fetch leave policies from DB
  useEffect(() => {
    if (!open) return;
    const fetchPolicies = async () => {
      try {
        const token = localStorage.getItem('session_token');
        const res = await fetch('/api/leave-policies', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const json = await res.json();
          const data = Array.isArray(json) ? json : json?.data ?? [];
          setPolicies(data);
        }
      } catch { /* silently use fallback */ }
    };

    const fetchHolidays = async () => {
      try {
        const token = localStorage.getItem('session_token');
        const currentYear = new Date().getFullYear();
        const res = await fetch(`/api/company-holidays?year=${currentYear}&limit=100`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const json = await res.json();
          const data = Array.isArray(json) ? json : json?.data ?? [];
          setCompanyHolidays(data.map((h: any) => ({ date: h.date, reason: h.reason })));
        }
      } catch { /* ok */ }
    };

    fetchPolicies();
    fetchHolidays();
  }, [open]);

  // Force intern to only see unpaid leave
  useEffect(() => {
    if (isIntern && leaveValues.type !== 'unpaid') {
      form.setValue('type', 'unpaid');
    }
  }, [isIntern, leaveValues.type, form]);

  // Calculate balances using policies from DB
  const balances = useMemo(() => {
    if (!employeeData?.dateOfJoining) return null;
    return calculateAccruedBalances(
      employeeData.dateOfJoining,
      userRole,
      policies.length > 0 ? policies : undefined
    );
  }, [employeeData?.dateOfJoining, userRole, policies]);

  // Merge company holidays into the holidays map
  const allHolidaysMap = useMemo(() => {
    const merged = { ...PUBLIC_HOLIDAYS_2026 };
    for (const ch of companyHolidays) {
      merged[ch.date] = ch.reason;
    }
    return merged;
  }, [companyHolidays]);

  // Get detailed leave calculation
  const leaveBreakdown: LeaveCalculationBreakdown = useMemo(() => {
    const hoursFraction = leaveValues.actualHours ? parseFloat(leaveValues.actualHours) : undefined;
    return calculateDetailedLeaveDays(
      leaveValues.from,
      leaveValues.to,
      leaveValues.period as 'full_day' | 'half_day' | 'hourly',
      hoursFraction,
      allHolidaysMap
    );
  }, [leaveValues.from, leaveValues.to, leaveValues.period, leaveValues.actualHours, allHolidaysMap]);

  // Check if current leave type requires a document
  const currentTypePolicy = useMemo(() => {
    return policies.find(p => p.leaveType === leaveValues.type);
  }, [policies, leaveValues.type]);

  const requiresDocument = currentTypePolicy
    ? currentTypePolicy.requiresDocument
    : DOCUMENT_REQUIRED_TYPES.includes(leaveValues.type);

  // Available leave types (filtered for interns)
  const availableLeaveTypes = useMemo(() => {
    if (isIntern) {
      return LEAVE_TYPES.filter(t => t.id === 'unpaid');
    }
    if (policies.length > 0) {
      const activeTypes = policies.filter(p => p.isActive).map(p => p.leaveType);
      return LEAVE_TYPES.filter(t => activeTypes.includes(t.id));
    }
    return LEAVE_TYPES;
  }, [isIntern, policies]);

  // Calendar months to show (current + next)
  const calendarMonths = useMemo(() => {
    const now = new Date();
    return [
      { month: now.getMonth(), year: now.getFullYear() },
      { month: (now.getMonth() + 1) % 12, year: now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear() },
    ];
  }, []);

  // Handle calendar date selection
  const handleDateSelect = useCallback((dateStr: string) => {
    const currentFrom = leaveValues.from;
    const currentTo = leaveValues.to;

    if (!currentFrom || (currentFrom && currentTo)) {
      // Start fresh selection
      form.setValue('from', dateStr, { shouldValidate: true });
      form.setValue('to', dateStr, { shouldValidate: true });
    } else {
      // Set end date
      if (new Date(dateStr) >= new Date(currentFrom)) {
        form.setValue('to', dateStr, { shouldValidate: true });
      } else {
        form.setValue('from', dateStr, { shouldValidate: true });
        form.setValue('to', currentFrom, { shouldValidate: true });
      }
    }
  }, [leaveValues.from, leaveValues.to, form]);

  // Document upload handler
  const handleDocumentUpload = async (file: File) => {
    setUploadingDoc(true);
    try {
      const token = localStorage.getItem('session_token');
      const formData = new FormData();
      formData.append('file', file);
      formData.append('kind', 'leave_document');

      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Upload failed');
      }

      const json = await res.json();
      const data = json?.data ?? json;
      form.setValue('attachmentUrl', data.url || data.storagePath);
      form.setValue('attachmentName', file.name);
      toast.success('Document uploaded successfully');
    } catch (err: any) {
      toast.error(err.message || 'Failed to upload document');
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleClear = () => {
    form.reset({
      period: 'full_day',
      type: isIntern ? 'unpaid' : 'annual',
      from: '',
      to: '',
      reason: '',
      attachmentUrl: '',
      attachmentName: '',
      actualHours: '',
    });
  };

  const handleSubmit = async (values: LeaveRequestFormValues) => {
    // Validate document requirement
    if (requiresDocument && !values.attachmentUrl) {
      toast.error(`A supporting document is required for ${leaveValues.type} leave`);
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem('session_token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;

      const response = await fetch('/api/leave-requests', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          employeeId: employeeData.id,
          leaveType: values.type,
          startDate: values.from,
          endDate: values.to,
          reason: values.reason,
          leavePeriod: values.period,
          actualDays: leaveBreakdown.actualLeaveDays,
          attachmentUrl: values.attachmentUrl || null,
          attachmentName: values.attachmentName || null,
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

  // Tenure info for profile tab
  const tenureInfo = useMemo(() => {
    if (!employeeData?.dateOfJoining) return null;
    const start = parseISO(employeeData.dateOfJoining);
    const now = new Date();
    return {
      years: differenceInYears(now, start),
      months: differenceInMonths(now, start),
      joiningDate: employeeData.dateOfJoining,
    };
  }, [employeeData?.dateOfJoining]);

  // Get current balance for selected leave type
  const currentTypeBalance = balances?.[leaveValues.type as keyof LeaveEntitlement] ?? 0;
  const balanceAfterRequest = currentTypeBalance - leaveBreakdown.actualLeaveDays;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] lg:max-w-[1300px] w-full p-0 overflow-hidden bg-white max-h-[95vh] h-[880px] flex flex-col">
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
                <CalendarIcon className="mr-2 h-4 w-4" /> Request
              </TabsTrigger>
              <TabsTrigger
                value="summary"
                className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none px-0 py-2 font-semibold"
              >
                <FileText className="mr-2 h-4 w-4" /> Summary
              </TabsTrigger>
              <TabsTrigger
                value="profile"
                className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none px-0 py-2 font-semibold"
              >
                <User className="mr-2 h-4 w-4" /> My Leave Profile
              </TabsTrigger>
            </TabsList>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50 min-h-0">
            {/* ═══════════════ REQUEST TAB ═══════════════ */}
            <TabsContent value="request" className="mt-0 outline-none">
              <div className="flex flex-col xl:flex-row gap-6">
                {/* Left Column: Form */}
                <div className="flex-1 space-y-5 min-w-0">
                  {/* Employee Info Card */}
                  <div className="flex items-center gap-4 p-4 bg-white rounded-xl border border-slate-100 shadow-sm">
                    <Avatar className="h-12 w-12 border-2 border-slate-50">
                      <AvatarImage src={employeeData?.avatarUrl} />
                      <AvatarFallback className="bg-primary/5 text-primary text-sm">
                        {employeeData?.firstName?.[0]}{employeeData?.lastName?.[0]}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <h3 className="font-bold text-slate-900">{employeeData?.firstName} {employeeData?.lastName}</h3>
                      <p className="text-xs text-slate-500">{employeeData?.designation ?? 'Employee'} • {employeeData?.department ?? ''}</p>
                    </div>
                    {isIntern && (
                      <Badge className="bg-amber-100 text-amber-700 border-amber-200">Intern</Badge>
                    )}
                  </div>

                  {/* Period + Type */}
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
                          {availableLeaveTypes.map(type => (
                            <SelectItem key={type.id} value={type.id}>
                              <span className="flex items-center gap-2">
                                {type.label}
                                <span className="text-muted-foreground text-[10px]">
                                  ({(balances?.[type.id as keyof LeaveEntitlement] ?? 0).toFixed(2)})
                                </span>
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {form.formState.errors.type && <p className="text-xs text-destructive">{form.formState.errors.type.message}</p>}
                    </div>
                  </div>

                  {/* Hourly Duration (conditional) */}
                  {leaveValues.period === 'hourly' && (
                    <div className="space-y-1.5">
                      <Label className="text-slate-600 font-semibold text-xs">Actual Hours Requested</Label>
                      <Select value={leaveValues.actualHours || ''} onValueChange={(v) => void form.setValue('actualHours', v)}>
                        <SelectTrigger className="bg-white border-slate-200">
                          <SelectValue placeholder="Select duration" />
                        </SelectTrigger>
                        <SelectContent className="max-h-[280px]">
                          {HOURLY_OPTIONS.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Date Inputs */}
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

                  {/* Actual Days + Clear */}
                  <div className="flex flex-col sm:flex-row gap-4 items-end">
                    <div className="flex-1 w-full space-y-1.5">
                      <Label className="text-slate-600 font-semibold text-xs">Actual Days Requested</Label>
                      <Input
                        readOnly
                        value={leaveBreakdown.actualLeaveDays.toFixed(2)}
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

                  {/* Document Upload (conditional) */}
                  {requiresDocument && (
                    <div className="space-y-2 p-4 bg-amber-50/70 rounded-xl border border-amber-200/60">
                      <div className="flex items-center gap-2">
                        <Upload className="h-4 w-4 text-amber-600" />
                        <Label className="text-amber-800 font-semibold text-xs">Supporting Document Required</Label>
                      </div>
                      <p className="text-[11px] text-amber-600">
                        {leaveValues.type === 'sick' && 'Please upload a medical certificate or doctor\'s note.'}
                        {leaveValues.type === 'study' && 'Please upload your exam schedule or course registration.'}
                        {leaveValues.type === 'maternity' && 'Please upload the relevant medical documentation.'}
                        {leaveValues.type === 'family' && 'Please upload relevant supporting documentation.'}
                      </p>

                      {leaveValues.attachmentUrl ? (
                        <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-slate-200">
                          <File className="h-5 w-5 text-emerald-600 shrink-0" />
                          <span className="text-sm text-slate-700 truncate flex-1">{leaveValues.attachmentName || 'Document uploaded'}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                            onClick={() => {
                              form.setValue('attachmentUrl', '');
                              form.setValue('attachmentName', '');
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <div className="relative">
                          <input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleDocumentUpload(file);
                              e.target.value = '';
                            }}
                            disabled={uploadingDoc}
                          />
                          <Button
                            variant="outline"
                            className="w-full gap-2 border-dashed border-amber-300 text-amber-700 bg-white hover:bg-amber-50"
                            disabled={uploadingDoc}
                          >
                            {uploadingDoc ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Upload className="h-4 w-4" />
                            )}
                            {uploadingDoc ? 'Uploading...' : 'Choose File (PDF, JPG, PNG)'}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Reason/Comments */}
                  <div className="space-y-1.5">
                    <Label className="text-slate-600 font-semibold text-xs">Comments</Label>
                    <Textarea
                      placeholder="Add leave request comments here (minimum 10 characters)"
                      className="min-h-[90px] bg-white border-slate-200 text-sm"
                      value={leaveValues.reason}
                      onChange={(e) => void form.setValue('reason', e.target.value, { shouldValidate: true })}
                    />
                    {form.formState.errors.reason && <p className="text-xs text-destructive">{form.formState.errors.reason.message}</p>}
                  </div>
                </div>

                {/* Middle Column: Calendar */}
                <div className="w-full xl:w-[300px] shrink-0 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Select start & end date</h4>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3.5 w-3.5 text-red-500 cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">Click a date to set start, click another to set end. Blue dates are public holidays.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>

                  <div className="p-4 bg-white rounded-xl border border-slate-100 shadow-sm space-y-5">
                    {calendarMonths.map((cal, idx) => (
                      <MiniCalendar
                        key={idx}
                        month={cal.month}
                        year={cal.year}
                        selectedFrom={leaveValues.from}
                        selectedTo={leaveValues.to}
                        onSelectDate={handleDateSelect}
                        holidays={PUBLIC_HOLIDAYS_2026}
                        companyHolidays={companyHolidays}
                      />
                    ))}
                  </div>
                </div>

                {/* Right Column: Leave Calculation */}
                <div className="w-full xl:w-[260px] shrink-0 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Leave Calculation</h4>
                    <History className="h-3.5 w-3.5 text-red-500" />
                  </div>

                  <div className="flex flex-col gap-3">
                    {/* Public Holidays in Range */}
                    {leaveBreakdown.publicHolidayDetails.length > 0 && (
                      <div className="p-3 bg-blue-50 border-l-3 border-blue-500 rounded-r-lg space-y-1">
                        <p className="text-[11px] font-bold text-blue-900">Public Holidays in Period</p>
                        {leaveBreakdown.publicHolidayDetails.map((ph, i) => (
                          <p key={i} className="text-[10px] text-blue-700">
                            {format(parseISO(ph.date), 'dd MMM')} — {ph.reason}
                          </p>
                        ))}
                      </div>
                    )}

                    {leaveBreakdown.publicHolidayDetails.length === 0 && (
                      <div className="p-3 bg-blue-50 border-l-3 border-primary rounded-r-lg">
                        <p className="text-[11px] font-bold text-blue-900">Public Holidays in Period</p>
                        <p className="text-[10px] text-blue-600">None in selected range</p>
                      </div>
                    )}

                    {/* Stats Card */}
                    <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 space-y-3">
                      {[
                        { label: 'Total Work Days', value: leaveBreakdown.workDays },
                        { label: 'Total Weekend Days', value: leaveBreakdown.weekendDays },
                        { label: 'Total Public Holidays', value: leaveBreakdown.publicHolidays },
                        { label: 'Total Leave Days Requested', value: leaveBreakdown.workDays },
                        { label: 'Actual Leave Days Requested', value: leaveBreakdown.actualLeaveDays.toFixed(2) },
                      ].map((item, i) => (
                        <div key={i} className="flex justify-between border-b border-slate-50 pb-2 last:border-0">
                          <span className="text-[11px] text-slate-500 font-medium">{item.label} =</span>
                          <span className="text-[11px] font-bold text-slate-900">{item.value}</span>
                        </div>
                      ))}
                    </div>

                    {/* Balance Forward */}
                    <div className={cn(
                      "p-4 rounded-xl shadow-lg text-center text-white",
                      balanceAfterRequest >= 0 ? 'bg-emerald-600 shadow-emerald-200/50' : 'bg-red-500 shadow-red-200/50'
                    )}>
                      <p className="text-[10px] font-bold uppercase tracking-wider opacity-80">Balance Carried Forward</p>
                      <p className="text-2xl font-black mt-1">{balanceAfterRequest.toFixed(2)}</p>
                      <p className="text-[9px] mt-1 opacity-70">days remaining after this request</p>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* ═══════════════ SUMMARY TAB ═══════════════ */}
            <TabsContent value="summary" className="mt-0 outline-none">
              <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden divide-y divide-slate-50">
                {availableLeaveTypes.map(type => {
                  const balance = balances?.[type.id as keyof LeaveEntitlement] ?? 0;
                  return (
                    <div key={type.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-full bg-slate-800 flex items-center justify-center text-white font-bold text-xs">
                          {type.abbr}
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-900 text-sm">{type.label}</h4>
                          <p className="text-[10px] text-slate-500">Leave balances (days)</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 sm:gap-8">
                        <div className="text-center">
                          <span className="text-[9px] uppercase font-bold text-slate-400 block mb-1">Current</span>
                          <Badge className="bg-blue-600 hover:bg-blue-700 min-w-[50px] justify-center text-[10px]">
                            {balance.toFixed(3)}
                          </Badge>
                        </div>
                        <div className="text-center">
                          <span className="text-[9px] uppercase font-bold text-slate-400 block mb-1">Pending</span>
                          <Badge variant="destructive" className="min-w-[50px] justify-center text-[10px]">
                            0.000
                          </Badge>
                        </div>
                        <div className="text-center">
                          <span className="text-[9px] uppercase font-bold text-slate-400 block mb-1">Expected</span>
                          <Badge className="bg-emerald-600 hover:bg-emerald-700 min-w-[50px] justify-center text-[10px]">
                            0
                          </Badge>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </TabsContent>

            {/* ═══════════════ PROFILE TAB ═══════════════ */}
            <TabsContent value="profile" className="mt-0 outline-none space-y-6 pb-6">
              {/* Profile Details */}
              <section className="space-y-2">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-200 pb-2 px-1">Leave Profile Details</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    { label: 'Leave Profile Name', value: tenureInfo ? `Techsonance (${tenureInfo.years}-${tenureInfo.years + 2} years)` : 'N/A' },
                    { label: 'Staff Start Date', value: tenureInfo?.joiningDate ? format(parseISO(tenureInfo.joiningDate), 'dd MMM yyyy') : 'N/A' },
                    { label: 'Leave Profile Start Date', value: tenureInfo?.joiningDate ? format(parseISO(tenureInfo.joiningDate), 'dd MMM yyyy') : 'N/A' },
                    { label: 'Leave Profile End Date', value: tenureInfo ? format(addMonths(parseISO(tenureInfo.joiningDate), 60), 'dd MMM yyyy') : 'N/A' },
                  ].map((item, i) => (
                    <div key={i} className="p-3 bg-white rounded-lg border border-slate-100 shadow-sm">
                      <p className="text-[10px] text-slate-400 font-semibold mb-1">{item.label}</p>
                      <p className="text-sm font-bold text-slate-700">{item.value}</p>
                    </div>
                  ))}
                </div>
              </section>

              {/* Annual Leave */}
              <section className="space-y-2">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-200 pb-2 px-1">Annual Leave</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {(() => {
                    const annualPolicy = policies.find(p => p.leaveType === 'annual');
                    const entitlement = tenureInfo
                      ? (tenureInfo.years >= 10
                        ? (annualPolicy?.tenure10PlusDays ?? 23)
                        : tenureInfo.years >= 5
                          ? (annualPolicy?.tenure510Days ?? 20)
                          : tenureInfo.years >= 2
                            ? (annualPolicy?.tenure25Days ?? 18)
                            : (annualPolicy?.tenure02Days ?? 12))
                      : 0;
                    return [
                      { label: 'Annual Leave Cycle', value: `${tenureInfo?.years ?? 0}` },
                      { label: 'Total Annual Leave Days', value: `${entitlement.toFixed(3)} day(s)` },
                      { label: 'Leave Expire', value: '' },
                      { label: 'Leave Expire In Days', value: '' },
                    ];
                  })().map((item, i) => (
                    <div key={i} className="p-3 bg-white rounded-lg border border-slate-100 shadow-sm">
                      <p className="text-[10px] text-slate-400 font-semibold mb-1">{item.label}</p>
                      <p className="text-sm font-bold text-slate-700">{item.value || '-'}</p>
                    </div>
                  ))}
                </div>
              </section>

              {/* Sick Leave */}
              <section className="space-y-2">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-200 pb-2 px-1">Sick Leave</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    { label: 'Sick Leave Cycle Start Date', value: tenureInfo?.joiningDate ? format(parseISO(tenureInfo.joiningDate), 'dd MMM yyyy') : 'N/A' },
                    { label: 'Sick Leave Cycle End Date', value: tenureInfo ? format(addMonths(parseISO(tenureInfo.joiningDate), 60), 'dd MMM yyyy') : 'N/A' },
                    { label: 'Sick Leave Cycle No.', value: `${tenureInfo?.years ?? 0}` },
                    { label: 'Total Sick Leave Days', value: `${(policies.find(p => p.leaveType === 'sick')?.fixedDaysPerYear ?? 8).toFixed(3)} day(s)` },
                  ].map((item, i) => (
                    <div key={i} className="p-3 bg-white rounded-lg border border-slate-100 shadow-sm">
                      <p className="text-[10px] text-slate-400 font-semibold mb-1">{item.label}</p>
                      <p className="text-sm font-bold text-slate-700">{item.value}</p>
                    </div>
                  ))}
                </div>
              </section>

              {/* Other Leave */}
              <section className="space-y-2">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-200 pb-2 px-1">Other Leave</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    { label: 'Total Family Leave Days', value: `${(policies.find(p => p.leaveType === 'family')?.fixedDaysPerYear ?? 3).toFixed(3)} day(s)` },
                    { label: 'Total Study Leave Days', value: `${(policies.find(p => p.leaveType === 'study')?.fixedDaysPerYear ?? 8).toFixed(3)} day(s)` },
                    { label: 'Total Maternity Leave Days', value: `${(policies.find(p => p.leaveType === 'maternity')?.fixedDaysPerYear ?? 182).toFixed(3)} day(s)` },
                    { label: 'Total Paternity Leave Days', value: `${(policies.find(p => p.leaveType === 'paternity')?.fixedDaysPerYear ?? 15).toFixed(3)} day(s)` },
                  ].map((item, i) => (
                    <div key={i} className="p-3 bg-white rounded-lg border border-slate-100 shadow-sm">
                      <p className="text-[10px] text-slate-400 font-semibold mb-1">{item.label}</p>
                      <p className="text-sm font-bold text-slate-700">{item.value}</p>
                    </div>
                  ))}
                </div>
              </section>

              {/* Approvers */}
              <section className="space-y-2">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-200 pb-2 px-1">Approvers</h4>
                <div className="p-4 bg-white rounded-lg border border-slate-100 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">1st</div>
                    <div>
                      <p className="text-xs font-bold text-slate-700">HR Manager / Admin</p>
                      <p className="text-[10px] text-slate-400">Primary Approver</p>
                    </div>
                  </div>
                </div>
              </section>
            </TabsContent>
          </div>
        </Tabs>

        {/* Footer Actions */}
        <DialogFooter className="p-6 pt-3 border-t bg-white shrink-0 flex flex-col sm:flex-row items-center justify-between gap-4 mt-auto">
          <Button
            variant="ghost"
            className="text-primary gap-2 hover:bg-primary/5 font-bold uppercase tracking-wider text-[10px] p-0 h-auto"
            onClick={() => window.open('/leave-policy', '_blank')}
          >
            <FileText className="h-3.5 w-3.5" />
            View Leave Policy
          </Button>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button
              className="flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-700 font-bold uppercase tracking-wider text-xs gap-2 py-5"
              onClick={() => void form.handleSubmit(handleSubmit, () => toast.error('Please fix the leave request details'))()}
              disabled={loading}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Request Leave
            </Button>
            <Button
              variant="outline"
              className="flex-1 sm:flex-none font-bold uppercase tracking-wider text-xs gap-2 py-5"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
              Close
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
