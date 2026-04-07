'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
  PlaneTakeoff
} from 'lucide-react';
import { PUBLIC_HOLIDAYS_2026 } from '@/lib/leave-utils';

export function LeavePolicyContent() {
  const annualLeaveRates = [
    { tenure: '0 - 2 Years', monthly: '1.50 days', annual: '18 Days' },
    { tenure: '2 - 5 Years', monthly: '1.67 days', annual: '20 Days' },
    { tenure: '5 - 10 Years', monthly: '1.83 days', annual: '22 Days' },
    { tenure: '10+ Years', monthly: '2.08 days', annual: '25 Days' },
  ];

  const holidays = [
    { date: 'Jan 01, 2026', name: 'New Year\'s Day', type: 'Public Holiday' },
    { date: 'Jan 26, 2026', name: 'Republic Day', type: 'National Holiday' },
    { date: 'Mar 04, 2026', name: 'Holi', type: 'Public Holiday' },
    { date: 'Mar 19, 2026', name: 'Gudi Padwa', type: 'Public Holiday' },
    { date: 'May 01, 2026', name: 'Labour Day', type: 'Public Holiday' },
    { date: 'Sep 14, 2026', name: 'Ganesh Chaturthi', type: 'Public Holiday' },
    { date: 'Oct 02, 2026', name: 'Gandhi Jayanti', type: 'National Holiday' },
    { date: 'Oct 20, 2026', name: 'Dusshera', type: 'Public Holiday' },
    { date: 'Nov 09, 2026', name: 'Diwali', type: 'Public Holiday' },
    { date: 'Dec 25, 2026', name: 'Christmas', type: 'Public Holiday' },
  ];

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

      {/* Annual Leave Section */}
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
             <li>A maximum of **5 days** of Annual Leave can be carried forward to the next cycle.</li>
             <li>Accumulation beyond the tenure-aligned annual entitlement on March 31st will be forfeited.</li>
             <li>Interns are provided with 0 days of paid annual leave.</li>
           </ul>
        </div>
      </section>

      {/* Other Leave Section */}
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
                 <Badge variant="outline">10 Days / Cycle</Badge>
               </div>
               <div className="flex justify-between items-start">
                 <div>
                   <h4 className="font-bold">Family Responsibility</h4>
                   <p className="text-xs text-slate-500">For care and family-related emergencies</p>
                 </div>
                 <Badge variant="outline">3 Days / Cycle</Badge>
               </div>
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
                 <Badge variant="outline">8 Days / Max</Badge>
               </div>
               <div className="flex justify-between items-start">
                 <div>
                   <h4 className="font-bold">Maternity/Paternity</h4>
                   <p className="text-xs text-slate-500">As per Employee Legislation</p>
                 </div>
                 <Badge variant="outline">Statutory</Badge>
               </div>
               <p className="text-[11px] text-slate-400 bg-slate-50 p-2 rounded">Subject to manager approval and relevant documentation.</p>
            </CardContent>
          </Card>
        </section>
      </div>

      {/* Public Holidays */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <Calendar className="h-6 w-6 text-slate-600" />
          <h2 className="text-2xl font-bold text-slate-900">Public Holidays Schedule 2026</h2>
        </div>
        <Card className="border-slate-100 shadow-lg overflow-hidden grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-0 border-collapse">
          {holidays.map((holiday, idx) => (
            <div key={idx} className="p-4 border border-slate-50 flex items-center gap-4 hover:bg-slate-50 transition-colors">
               <div className="h-10 w-10 rounded-full bg-slate-100 flex flex-col items-center justify-center shrink-0">
                  <span className="text-[8px] font-bold text-slate-400 uppercase">{holiday.date.split(' ')[0]}</span>
                  <span className="text-sm font-black text-slate-900">{holiday.date.split(' ')[1].replace(',','')}</span>
               </div>
               <div className="min-w-0">
                  <h4 className="text-sm font-bold truncate text-slate-900">{holiday.name}</h4>
                  <p className="text-[10px] uppercase tracking-tighter text-slate-400 font-bold">{holiday.type}</p>
               </div>
               {holiday.type === 'National Holiday' && <div className="ml-auto flex items-center justify-center h-5 w-5 rounded-full bg-emerald-100 text-emerald-600"><CheckCircle2 className="h-3 w-3" /></div>}
            </div>
          ))}
        </Card>
      </section>

      {/* Policy Disclaimer */}
      <footer className="text-center pt-12 pb-6 border-t border-slate-100">
         <p className="text-slate-400 text-xs">
           &copy; 2026 Techsonance Infotech LLP. Confidential - For Internal Use Only.
           <br />
           Rules and regulations are subject to update as per management discretion.
         </p>
      </footer>
    </div>
  );
}
