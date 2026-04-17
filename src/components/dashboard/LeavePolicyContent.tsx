'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { 
  Calendar, 
  Info, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  UserCheck, 
  Globe, 
  BookOpen,
  Heart,
  Stethoscope,
  PlaneTakeoff,
  Loader2,
  User,
} from 'lucide-react';

interface LeavePolicy {
  id: number;
  leaveType: string;
  tenure02Days: number;
  tenure25Days: number;
  tenure510Days: number;
  tenure10PlusDays: number;
  fixedDaysPerYear: number;
  maxCarryForward: number;
  requiresDocument: boolean;
  internEligible: boolean;
  isActive: boolean;
}

interface CompanyHoliday {
  id: number;
  date: string;
  reason: string;
  year: number;
}

const LEAVE_TYPE_META: Record<string, { label: string; description: string; icon: React.ElementType; color: string }> = {
  annual: { label: 'Annual Leave (Paid)', description: 'Tenure-based accrual for planned time off', icon: PlaneTakeoff, color: 'text-blue-600' },
  sick: { label: 'Sick Leave', description: 'Provided for medical issues & recovery', icon: Stethoscope, color: 'text-red-500' },
  family: { label: 'Family Responsibility', description: 'For care and family-related emergencies', icon: Heart, color: 'text-pink-500' },
  study: { label: 'Study Leave', description: 'For approved exams and certifications', icon: BookOpen, color: 'text-emerald-500' },
  maternity: { label: 'Maternity Leave', description: 'As per Employee Legislation', icon: User, color: 'text-purple-500' },
  paternity: { label: 'Paternity Leave', description: 'As per Employee Legislation', icon: User, color: 'text-indigo-500' },
  unpaid: { label: 'Unpaid Leave', description: 'No salary deduction for this leave type', icon: Clock, color: 'text-orange-500' },
};

function formatHolidayDate(dateStr: string) {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
}

export function LeavePolicyContent() {
  const [policies, setPolicies] = useState<LeavePolicy[]>([]);
  const [holidays, setHolidays] = useState<CompanyHoliday[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem('session_token');
        const headers: Record<string, string> = {};
        if (token) headers.Authorization = `Bearer ${token}`;

        // Fetch leave policies
        const policyRes = await fetch('/api/leave-policies', { headers });
        if (policyRes.ok) {
          const json = await policyRes.json();
          setPolicies(Array.isArray(json) ? json : json?.data ?? []);
        }

        // Fetch company holidays for current year
        const currentYear = new Date().getFullYear();
        const holidayRes = await fetch(`/api/company-holidays?year=${currentYear}&limit=100`, { headers });
        if (holidayRes.ok) {
          const json = await holidayRes.json();
          setHolidays(Array.isArray(json) ? json : json?.data ?? []);
        }
      } catch {
        // silently fail, show whatever loaded
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const annualPolicy = policies.find(p => p.leaveType === 'annual');
  const sickPolicy = policies.find(p => p.leaveType === 'sick');
  const familyPolicy = policies.find(p => p.leaveType === 'family');
  const studyPolicy = policies.find(p => p.leaveType === 'study');
  const maternityPolicy = policies.find(p => p.leaveType === 'maternity');
  const paternityPolicy = policies.find(p => p.leaveType === 'paternity');

  // Build annual leave rates table from DB
  const annualLeaveRates = annualPolicy
    ? [
        { tenure: '0 - 2 Years', monthly: `${(annualPolicy.tenure02Days / 12).toFixed(2)} days`, annual: `${annualPolicy.tenure02Days} Days` },
        { tenure: '2 - 5 Years', monthly: `${(annualPolicy.tenure25Days / 12).toFixed(2)} days`, annual: `${annualPolicy.tenure25Days} Days` },
        { tenure: '5 - 10 Years', monthly: `${(annualPolicy.tenure510Days / 12).toFixed(2)} days`, annual: `${annualPolicy.tenure510Days} Days` },
        { tenure: '10+ Years', monthly: `${(annualPolicy.tenure10PlusDays / 12).toFixed(2)} days`, annual: `${annualPolicy.tenure10PlusDays} Days` },
      ]
    : [
        { tenure: '0 - 2 Years', monthly: '1.00 days', annual: '12 Days' },
        { tenure: '2 - 5 Years', monthly: '1.50 days', annual: '18 Days' },
        { tenure: '5 - 10 Years', monthly: '1.67 days', annual: '20 Days' },
        { tenure: '10+ Years', monthly: '1.92 days', annual: '23 Days' },
      ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-12">
      {/* Header Section */}
      <section className="text-center space-y-4 py-8 bg-slate-900 text-white rounded-3xl shadow-xl overflow-hidden relative">
        <div className="absolute top-0 right-0 p-4 opacity-10">
          <Globe className="h-40 w-40" />
        </div>
        <div className="relative z-10">
          <Badge className="bg-emerald-500 hover:bg-emerald-600 mb-2">Internal Document</Badge>
          <h1 className="text-4xl font-black tracking-tight">Techsonance Leave Policy</h1>
          <p className="text-slate-400 text-lg">Guidelines for the 2026/27 Financial Year (Effective April 1st, 2026)</p>
        </div>
      </section>

      {/* Core Principles */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-none shadow-sm bg-blue-50">
          <CardHeader className="pb-2">
            <Clock className="h-6 w-6 text-blue-600 mb-2" />
            <CardTitle className="text-sm uppercase tracking-wider text-blue-900">Leave Cycle</CardTitle>
          </CardHeader>
          <CardContent>
             <p className="text-sm font-medium text-blue-800">April 1st to March 31st annually. All non-annual leave balances are forfeit at the end of the cycle.</p>
          </CardContent>
        </Card>
        
        <Card className="border-none shadow-sm bg-emerald-50">
          <CardHeader className="pb-2">
            <UserCheck className="h-6 w-6 text-emerald-600 mb-2" />
            <CardTitle className="text-sm uppercase tracking-wider text-emerald-900">Eligibility</CardTitle>
          </CardHeader>
          <CardContent>
             <p className="text-sm font-medium text-emerald-800">Permanent employees are eligible for full benefits. Interns do not accrue paid leave during their internship tenure.</p>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-amber-50">
          <CardHeader className="pb-2">
            <Info className="h-6 w-6 text-amber-600 mb-2" />
            <CardTitle className="text-sm uppercase tracking-wider text-amber-900">Calculation</CardTitle>
          </CardHeader>
          <CardContent>
             <p className="text-sm font-medium text-amber-800">Leave is calculated on working days only. Public holidays and weekends are excluded from the leave count.</p>
          </CardContent>
        </Card>
      </div>

      {/* Annual Leave Section — Data from DB */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <PlaneTakeoff className="h-6 w-6 text-primary" />
          <h2 className="text-2xl font-bold text-slate-900">Annual Leave (Paid)</h2>
        </div>
        <Card className="border-slate-100 shadow-lg overflow-hidden">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead className="font-bold">Staff Seniority (Years)</TableHead>
                <TableHead className="font-bold">Accrual Rate (Monthly)</TableHead>
                <TableHead className="font-bold">Annual Entitlement</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {annualLeaveRates.map((rate) => (
                <TableRow key={rate.tenure} className="hover:bg-slate-50/50">
                  <TableCell className="font-semibold">{rate.tenure}</TableCell>
                  <TableCell>{rate.monthly}</TableCell>
                  <TableCell className="text-primary font-bold">{rate.annual}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
           <h4 className="font-bold text-slate-900 mb-2 flex items-center gap-2">
             <AlertCircle className="h-4 w-4 text-amber-500" />
             Forfeiture & Carry Forward Rule
           </h4>
           <ul className="text-sm text-slate-600 space-y-2 list-disc pl-5">
             <li>A maximum of <strong>{annualPolicy?.maxCarryForward ?? 5} days</strong> of Annual Leave can be carried forward to the next cycle.</li>
             <li>Accumulation beyond the tenure-aligned annual entitlement on March 31st will be forfeited.</li>
             <li>Interns are provided with 0 days of paid annual leave.</li>
           </ul>
        </div>
      </section>

      {/* Other Leave Section — Data from DB */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <Stethoscope className="h-6 w-6 text-red-500" />
            <h2 className="text-xl font-bold text-slate-900">Health & Wellbeing</h2>
          </div>
          <Card className="border-slate-100 shadow-sm">
            <CardContent className="pt-6 space-y-4">
               <div className="flex justify-between items-start">
                 <div>
                   <h4 className="font-bold">Sick Leave</h4>
                   <p className="text-xs text-slate-500">Provided for medical issues & recovery</p>
                 </div>
                 <Badge variant="outline">{sickPolicy?.fixedDaysPerYear ?? 8} Days / Cycle</Badge>
               </div>
               <div className="flex justify-between items-start">
                 <div>
                   <h4 className="font-bold">Family Responsibility</h4>
                   <p className="text-xs text-slate-500">For care and family-related emergencies</p>
                 </div>
                 <Badge variant="outline">{familyPolicy?.fixedDaysPerYear ?? 3} Days / Cycle</Badge>
               </div>
               {sickPolicy?.requiresDocument && (
                 <p className="text-[11px] text-amber-600 bg-amber-50 p-2 rounded flex items-center gap-1">
                   <AlertCircle className="h-3 w-3" /> Supporting documentation required for sick leave requests.
                 </p>
               )}
               <p className="text-[11px] text-slate-400 bg-slate-50 p-2 rounded">Note: Balance forfeits on March 31st and does not carry forward.</p>
            </CardContent>
          </Card>
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <BookOpen className="h-6 w-6 text-emerald-500" />
            <h2 className="text-xl font-bold text-slate-900">Career & Life</h2>
          </div>
          <Card className="border-slate-100 shadow-sm">
            <CardContent className="pt-6 space-y-4">
               <div className="flex justify-between items-start">
                 <div>
                   <h4 className="font-bold">Study Leave</h4>
                   <p className="text-xs text-slate-500">For approved exams and certifications</p>
                 </div>
                 <Badge variant="outline">{studyPolicy?.fixedDaysPerYear ?? 8} Days / Max</Badge>
               </div>
               <div className="flex justify-between items-start">
                 <div>
                   <h4 className="font-bold">Maternity Leave</h4>
                   <p className="text-xs text-slate-500">As per Employee Legislation</p>
                 </div>
                 <Badge variant="outline">{maternityPolicy?.fixedDaysPerYear ?? 182} Days</Badge>
               </div>
               <div className="flex justify-between items-start">
                 <div>
                   <h4 className="font-bold">Paternity Leave</h4>
                   <p className="text-xs text-slate-500">As per Employee Legislation</p>
                 </div>
                 <Badge variant="outline">{paternityPolicy?.fixedDaysPerYear ?? 15} Days</Badge>
               </div>
               {studyPolicy?.requiresDocument && (
                 <p className="text-[11px] text-amber-600 bg-amber-50 p-2 rounded flex items-center gap-1">
                   <AlertCircle className="h-3 w-3" /> Documentation required for study & maternity leave requests.
                 </p>
               )}
               <p className="text-[11px] text-slate-400 bg-slate-50 p-2 rounded">Subject to manager approval and relevant documentation.</p>
            </CardContent>
          </Card>
        </section>
      </div>

      {/* All Active Leave Types Summary — from DB */}
      {policies.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <Info className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-bold text-slate-900">Complete Leave Entitlement Summary</h2>
          </div>
          <Card className="border-slate-100 shadow-lg overflow-hidden">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead className="font-bold">Leave Type</TableHead>
                  <TableHead className="font-bold">Fixed Days/Year</TableHead>
                  <TableHead className="font-bold">Carry Forward</TableHead>
                  <TableHead className="font-bold">Document Required</TableHead>
                  <TableHead className="font-bold">Intern Eligible</TableHead>
                  <TableHead className="font-bold">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {policies.filter(p => p.leaveType !== 'annual').map((policy) => {
                  const meta = LEAVE_TYPE_META[policy.leaveType];
                  return (
                    <TableRow key={policy.id} className="hover:bg-slate-50/50">
                      <TableCell className="font-semibold">{meta?.label ?? policy.leaveType}</TableCell>
                      <TableCell className="text-primary font-bold">{policy.fixedDaysPerYear} Days</TableCell>
                      <TableCell>{policy.maxCarryForward > 0 ? `${policy.maxCarryForward} Days` : 'None'}</TableCell>
                      <TableCell>{policy.requiresDocument ? <Badge className="bg-amber-100 text-amber-700 text-[10px]">Required</Badge> : <span className="text-slate-400">No</span>}</TableCell>
                      <TableCell>{policy.internEligible ? <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">Yes</Badge> : <span className="text-slate-400">No</span>}</TableCell>
                      <TableCell>{policy.isActive ? <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">Active</Badge> : <Badge variant="destructive" className="text-[10px]">Inactive</Badge>}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </section>
      )}

      {/* Public Holidays — from DB */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <Calendar className="h-6 w-6 text-slate-600" />
          <h2 className="text-2xl font-bold text-slate-900">Public Holidays Schedule {new Date().getFullYear()}</h2>
        </div>
        {holidays.length > 0 ? (
          <Card className="border-slate-100 shadow-lg overflow-hidden grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-0 border-collapse">
            {holidays.map((holiday) => {
              const formatted = formatHolidayDate(holiday.date);
              const parts = formatted.split(' ');
              return (
                <div key={holiday.id} className="p-4 border border-slate-50 flex items-center gap-4 hover:bg-slate-50 transition-colors">
                   <div className="h-10 w-10 rounded-full bg-slate-100 flex flex-col items-center justify-center shrink-0">
                      <span className="text-[8px] font-bold text-slate-400 uppercase">{parts[0]}</span>
                      <span className="text-sm font-black text-slate-900">{parts[1]?.replace(',', '')}</span>
                   </div>
                   <div className="min-w-0">
                      <h4 className="text-sm font-bold truncate text-slate-900">{holiday.reason}</h4>
                      <p className="text-[10px] uppercase tracking-tighter text-slate-400 font-bold">Public Holiday</p>
                   </div>
                   <div className="ml-auto flex items-center justify-center h-5 w-5 rounded-full bg-emerald-100 text-emerald-600">
                     <CheckCircle2 className="h-3 w-3" />
                   </div>
                </div>
              );
            })}
          </Card>
        ) : (
          <Card className="border-slate-100 shadow-sm">
            <CardContent className="py-8 text-center text-muted-foreground">
              No company holidays found for {new Date().getFullYear()}. Please add them from the admin panel.
            </CardContent>
          </Card>
        )}
      </section>

      {/* Policy Disclaimer */}
      <footer className="text-center pt-12 pb-6 border-t border-slate-100">
         <p className="text-slate-400 text-xs">
           &copy; {new Date().getFullYear()} Techsonance Infotech LLP. Confidential - For Internal Use Only.
           <br />
           Rules and regulations are subject to update as per management discretion.
         </p>
      </footer>
    </div>
  );
}
