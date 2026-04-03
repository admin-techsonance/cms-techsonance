'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, Download, Check, DollarSign, Users, Calendar, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox';

interface Employee {
    id: number;
    userId: number;
    employeeId: string;
    department: string;
    designation: string;
    salary: number;
}

interface User {
    id: number;
    firstName: string;
    lastName: string;
    email: string;
}

interface AttendanceSummary {
    employeeId: number;
    employeeName: string;
    presentDays: number;
    halfDays: number;
    leaveDays: number;
    absentDays: number;
    workPercentage: number;
    baseSalary: number;
    calculatedSalary: number;
}

interface Payroll {
    id: number;
    employeeId: number;
    month: string;
    year: number;
    baseSalary: number;
    presentDays: number;
    absentDays: number;
    halfDays: number;
    leaveDays: number;
    totalWorkingDays: number;
    calculatedSalary: number;
    deductions: number;
    bonuses: number;
    netSalary: number;
    status: string;
    generatedAt: string;
}

interface BusinessSettings {
    id?: number;
    businessName: string;
    email: string;
    phone: string;
    address: string;
    gstNo: string;
    pan: string;
    tan: string;
    registrationNo: string;
    logoUrl: string;
}

export default function PayrollPage() {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [selectedEmployeeFilter, setSelectedEmployeeFilter] = useState('all');
    const [attendanceSummary, setAttendanceSummary] = useState<AttendanceSummary[]>([]);
    const [selectedEmployees, setSelectedEmployees] = useState<number[]>([]);
    const [generatedPayrolls, setGeneratedPayrolls] = useState<Payroll[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isFetching, setIsFetching] = useState(false);
    const [totalWorkingDays, setTotalWorkingDays] = useState(0);
    const [businessSettings, setBusinessSettings] = useState<BusinessSettings | null>(null);

    useEffect(() => {
        fetchEmployees();
        fetchPayrolls();
        fetchBusinessSettings();
    }, [selectedMonth, selectedYear]);

    const fetchEmployees = async () => {
        try {
            const token = localStorage.getItem('bearer_token') || localStorage.getItem('session_token');
            const response = await fetch('/api/employees?limit=100', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const data = await response.json();
                setEmployees(data);

                const userIds = data.map((emp: Employee) => emp.userId);
                if (userIds.length > 0) {
                    const usersResponse = await fetch('/api/users?limit=100', {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });

                    if (usersResponse.ok) {
                        const usersData = await usersResponse.json();
                        setUsers(usersData);
                    }
                }
            }
        } catch (error) {
            console.error('Error fetching employees:', error);
        }
    };

    const fetchBusinessSettings = async () => {
        try {
            const token = localStorage.getItem('bearer_token') || localStorage.getItem('session_token');
            const response = await fetch('/api/business-settings', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setBusinessSettings(data);
            } else {
                console.error('Failed to fetch business settings');
            }
        } catch (error) {
            console.error('Error fetching business settings:', error);
        }
    };

    const fetchAttendanceSummary = async () => {
        setIsFetching(true);
        try {
            const token = localStorage.getItem('bearer_token') || localStorage.getItem('session_token');

            const startDate = new Date(selectedYear, selectedMonth - 1, 1).toISOString().split('T')[0];
            const endDate = new Date(selectedYear, selectedMonth, 0).toISOString().split('T')[0];

            let url = `/api/attendance?startDate=${startDate}&endDate=${endDate}&limit=1000`;
            if (selectedEmployeeFilter !== 'all') {
                url += `&employeeId=${selectedEmployeeFilter}`;
            }

            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const attendanceData = await response.json();

                // Calculate working days
                const start = new Date(startDate);
                const end = new Date(endDate);
                let workingDays = 0;

                for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                    const dayOfWeek = d.getDay();
                    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                        workingDays++;
                    }
                }
                setTotalWorkingDays(workingDays);

                // Group by employee
                const employeeMap = new Map<number, AttendanceSummary>();

                const employeesToProcess = selectedEmployeeFilter !== 'all'
                    ? employees.filter(e => e.id === parseInt(selectedEmployeeFilter))
                    : employees;

                employeesToProcess.forEach(emp => {
                    const user = users.find(u => u.id === emp.userId);
                    employeeMap.set(emp.id, {
                        employeeId: emp.id,
                        employeeName: user ? `${user.firstName} ${user.lastName}` : emp.employeeId,
                        presentDays: 0,
                        halfDays: 0,
                        leaveDays: 0,
                        absentDays: 0,
                        workPercentage: 0,
                        baseSalary: emp.salary || 0,
                        calculatedSalary: 0,
                    });
                });

                attendanceData.forEach((record: any) => {
                    const summary = employeeMap.get(record.employeeId);
                    if (summary) {
                        switch (record.status) {
                            case 'present':
                                summary.presentDays++;
                                break;
                            case 'half_day':
                                summary.halfDays++;
                                break;
                            case 'on_leave':
                            case 'leave':
                                summary.leaveDays++;
                                break;
                            case 'absent':
                                summary.absentDays++;
                                break;
                        }
                    }
                });

                // Calculate work percentage and salary
                employeeMap.forEach(summary => {
                    const effectiveDays = summary.presentDays + (summary.halfDays * 0.5) + summary.leaveDays;
                    summary.workPercentage = workingDays > 0 ? Math.round((effectiveDays / workingDays) * 100) : 0;

                    // Calculate salary: (baseSalary / totalWorkingDays) * effectiveDays
                    if (summary.baseSalary > 0 && workingDays > 0) {
                        summary.calculatedSalary = Math.round((summary.baseSalary / workingDays) * effectiveDays);
                    }
                });

                setAttendanceSummary(Array.from(employeeMap.values()));
                toast.success('Attendance summary fetched successfully');
            }
        } catch (error) {
            console.error('Error fetching attendance:', error);
            toast.error('Failed to fetch attendance summary');
        } finally {
            setIsFetching(false);
        }
    };

    const fetchPayrolls = async () => {
        try {
            const token = localStorage.getItem('bearer_token') || localStorage.getItem('session_token');
            const monthStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;

            let url = `/api/payroll?month=${monthStr}&year=${selectedYear}`;
            if (selectedEmployeeFilter !== 'all') {
                url += `&employeeId=${selectedEmployeeFilter}`;
            }

            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const data = await response.json();
                setGeneratedPayrolls(data);
            }
        } catch (error) {
            console.error('Error fetching payrolls:', error);
        }
    };

    const handleGeneratePayroll = async (forAll: boolean = false) => {
        if (!forAll && selectedEmployees.length === 0) {
            toast.error('Please select at least one employee');
            return;
        }

        setIsGenerating(true);
        try {
            const token = localStorage.getItem('bearer_token') || localStorage.getItem('session_token');
            const monthStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;

            const response = await fetch('/api/payroll/generate', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    employeeIds: forAll ? 'all' : selectedEmployees,
                    month: monthStr,
                    year: selectedYear,
                }),
            });

            const data = await response.json();

            if (response.ok) {
                toast.success(data.message);
                fetchPayrolls();
                setSelectedEmployees([]);
            } else {
                toast.error(data.error || 'Failed to generate payroll');
            }
        } catch (error) {
            console.error('Error generating payroll:', error);
            toast.error('An error occurred while generating payroll');
        } finally {
            setIsGenerating(false);
        }
    };

    const handleUpdateStatus = async (payrollId: number, newStatus: string) => {
        try {
            const token = localStorage.getItem('bearer_token') || localStorage.getItem('session_token');

            const response = await fetch(`/api/payroll`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    id: payrollId,
                    status: newStatus,
                }),
            });

            if (response.ok) {
                toast.success(`Payroll ${newStatus} successfully`);
                fetchPayrolls();
            } else {
                const error = await response.json();
                toast.error(error.error || 'Failed to update payroll');
            }
        } catch (error) {
            console.error('Error updating payroll:', error);
            toast.error('An error occurred while updating payroll');
        }
    };

    const handleDeletePayroll = async (payrollId: number) => {
        if (!confirm('Are you sure you want to delete this payroll record?')) {
            return;
        }

        try {
            const token = localStorage.getItem('bearer_token') || localStorage.getItem('session_token');

            const response = await fetch(`/api/payroll?id=${payrollId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                toast.success('Payroll deleted successfully');
                fetchPayrolls();
            } else {
                const error = await response.json();
                toast.error(error.error || 'Failed to delete payroll');
            }
        } catch (error) {
            console.error('Error deleting payroll:', error);
            toast.error('An error occurred while deleting payroll');
        }
    };

    const handleExportCSV = () => {
        const csv = [
            ['Employee', 'Month', 'Base Salary', 'Present Days', 'Half Days', 'Leave Days', 'Absent Days', 'Net Salary', 'Status'],
            ...generatedPayrolls.map(p => {
                const employee = employees.find(e => e.id === p.employeeId);
                const user = users.find(u => u.id === employee?.userId);
                const empName = user ? `${user.firstName} ${user.lastName}` : employee?.employeeId || 'Unknown';

                return [
                    empName,
                    p.month,
                    p.baseSalary,
                    p.presentDays,
                    p.halfDays,
                    p.leaveDays,
                    p.absentDays,
                    p.netSalary,
                    p.status,
                ];
            })
        ].map(row => row.join(',')).join('\n');

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `payroll_${selectedYear}_${selectedMonth}.csv`;
        a.click();
        toast.success('Payroll exported successfully');
    };

    const handleDownloadPayslip = async (payroll: Payroll) => {
        try {
            const token = localStorage.getItem('bearer_token') || localStorage.getItem('session_token');
            const response = await fetch(`/api/payroll/payslip?payrollId=${payroll.id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const htmlString = await response.text();
                
                const employee = employees.find(e => e.id === payroll.employeeId);
                const user = users.find(u => u.id === employee?.userId);
                const empName = user ? `${user.firstName} ${user.lastName}` : employee?.employeeId || 'Unknown';
                const filename = `Payslip_${empName}_${payroll.month}_${payroll.year}.pdf`;

                // Dynamic import to avoid SSR issues
                const html2pdf = (await import('html2pdf.js')).default;
                
                const opt = {
                  margin:       0.5,
                  filename:     filename,
                  image:        { type: 'jpeg' as const, quality: 0.98 },
                  html2canvas:  { scale: 2 },
                  jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' as const }
                };

                // Create a temporary container
                const tempDiv = document.createElement('div');
                // Hide it from view but keep it in normal document flow so html2canvas can render it
                tempDiv.style.position = 'absolute';
                tempDiv.style.left = '-9999px';
                tempDiv.style.top = '0';
                tempDiv.innerHTML = htmlString;
                document.body.appendChild(tempDiv);
                
                html2pdf().set(opt).from(tempDiv).save().then(() => {
                   document.body.removeChild(tempDiv);
                   toast.success('Payslip downloaded successfully');
                });
            } else {
                const errorData = await response.json();
                toast.error(errorData.error || 'Failed to download payslip');
            }
        } catch (error) {
            console.error('Error downloading payslip:', error);
            toast.error('An error occurred while downloading payslip');
        }
    };

    const handleDownloadAllPayslips = async () => {
        if (generatedPayrolls.length === 0) {
            toast.info('No payrolls to download.');
            return;
        }
        toast.info('Downloading all payslips...');
        for (const payroll of generatedPayrolls) {
            await handleDownloadPayslip(payroll);
            // Add a small delay to prevent browser from blocking multiple downloads
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        toast.success('All payslips downloaded.');
    };

    const toggleEmployeeSelection = (employeeId: number) => {
        setSelectedEmployees(prev =>
            prev.includes(employeeId)
                ? prev.filter(id => id !== employeeId)
                : [...prev, employeeId]
        );
    };

    const toggleSelectAll = () => {
        if (selectedEmployees.length === attendanceSummary.length) {
            setSelectedEmployees([]);
        } else {
            setSelectedEmployees(attendanceSummary.map(s => s.employeeId));
        }
    };

    const getEmployeeName = (employeeId: number) => {
        const employee = employees.find(e => e.id === employeeId);
        if (!employee) return 'Unknown';
        const user = users.find(u => u.id === employee.userId);
        return user ? `${user.firstName} ${user.lastName}` : employee.employeeId;
    };

    const avgAttendance = attendanceSummary.length > 0
        ? Math.round(attendanceSummary.reduce((sum, s) => sum + s.workPercentage, 0) / attendanceSummary.length)
        : 0;

    const totalDisbursement = attendanceSummary.reduce((sum, s) => sum + s.calculatedSalary, 0);

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-3xl font-bold tracking-tight">Payroll Management</h2>
                <p className="text-muted-foreground">Generate and manage employee payroll based on attendance</p>
            </div>

            {/* Filters */}
            <Card>
                <CardHeader>
                    <CardTitle>Filters</CardTitle>
                    <CardDescription>Select month, year, and employee to fetch attendance data</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="space-y-2">
                            <Label>Month</Label>
                            <Select
                                value={selectedMonth.toString()}
                                onValueChange={(value) => setSelectedMonth(parseInt(value))}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {Array.from({ length: 12 }, (_, i) => (
                                        <SelectItem key={i + 1} value={(i + 1).toString()}>
                                            {new Date(2024, i).toLocaleString('default', { month: 'long' })}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Year</Label>
                            <Select
                                value={selectedYear.toString()}
                                onValueChange={(value) => setSelectedYear(parseInt(value))}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {Array.from({ length: 5 }, (_, i) => {
                                        const year = new Date().getFullYear() - 2 + i;
                                        return (
                                            <SelectItem key={year} value={year.toString()}>
                                                {year}
                                            </SelectItem>
                                        );
                                    })}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Employee</Label>
                            <Select value={selectedEmployeeFilter} onValueChange={setSelectedEmployeeFilter}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Employees</SelectItem>
                                    {employees.map(emp => {
                                        const user = users.find(u => u.id === emp.userId);
                                        return (
                                            <SelectItem key={emp.id} value={emp.id.toString()}>
                                                {user ? `${user.firstName} ${user.lastName} (${emp.employeeId})` : emp.employeeId}
                                            </SelectItem>
                                        );
                                    })}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex items-end">
                            <Button onClick={fetchAttendanceSummary} disabled={isFetching} className="w-full">
                                {isFetching && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Fetch Attendance
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Summary Cards */}
            {attendanceSummary.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <Card>
                        <CardHeader className="pb-3">
                            <CardDescription className="flex items-center gap-2">
                                <Calendar className="h-4 w-4" />
                                Working Days
                            </CardDescription>
                            <CardTitle className="text-2xl">{totalWorkingDays}</CardTitle>
                        </CardHeader>
                    </Card>
                    <Card>
                        <CardHeader className="pb-3">
                            <CardDescription className="flex items-center gap-2">
                                <Users className="h-4 w-4" />
                                Total Employees
                            </CardDescription>
                            <CardTitle className="text-2xl">{attendanceSummary.length}</CardTitle>
                        </CardHeader>
                    </Card>
                    <Card>
                        <CardHeader className="pb-3">
                            <CardDescription className="flex items-center gap-2">
                                <TrendingUp className="h-4 w-4" />
                                Avg Attendance
                            </CardDescription>
                            <CardTitle className="text-2xl">{avgAttendance}%</CardTitle>
                        </CardHeader>
                    </Card>
                    <Card>
                        <CardHeader className="pb-3">
                            <CardDescription className="flex items-center gap-2">
                                <DollarSign className="h-4 w-4" />
                                Total Disbursement
                            </CardDescription>
                            <CardTitle className="text-2xl">₹{totalDisbursement.toLocaleString()}</CardTitle>
                        </CardHeader>
                    </Card>
                </div>
            )}

            {/* Attendance Summary Table */}
            {attendanceSummary.length > 0 && (
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle>Attendance Summary</CardTitle>
                                <CardDescription>Select employees to generate payroll</CardDescription>
                            </div>
                            <div className="flex gap-2">
                                <Button
                                    onClick={() => handleGeneratePayroll(false)}
                                    disabled={isGenerating || selectedEmployees.length === 0}
                                >
                                    {isGenerating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Generate Selected
                                </Button>
                                <Button
                                    onClick={() => handleGeneratePayroll(true)}
                                    disabled={isGenerating}
                                    variant="outline"
                                >
                                    {isGenerating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Generate All
                                </Button>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-12">
                                        <Checkbox
                                            checked={selectedEmployees.length === attendanceSummary.length}
                                            onCheckedChange={toggleSelectAll}
                                        />
                                    </TableHead>
                                    <TableHead>Employee</TableHead>
                                    <TableHead>Present</TableHead>
                                    <TableHead>Half Days</TableHead>
                                    <TableHead>Leave</TableHead>
                                    <TableHead>Absent</TableHead>
                                    <TableHead>Work %</TableHead>
                                    <TableHead>Base Salary</TableHead>
                                    <TableHead>Calculated Salary</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {attendanceSummary.map((summary) => (
                                    <TableRow key={summary.employeeId}>
                                        <TableCell>
                                            <Checkbox
                                                checked={selectedEmployees.includes(summary.employeeId)}
                                                onCheckedChange={() => toggleEmployeeSelection(summary.employeeId)}
                                            />
                                        </TableCell>
                                        <TableCell className="font-medium">{summary.employeeName}</TableCell>
                                        <TableCell>{summary.presentDays}</TableCell>
                                        <TableCell>{summary.halfDays}</TableCell>
                                        <TableCell>{summary.leaveDays}</TableCell>
                                        <TableCell>{summary.absentDays}</TableCell>
                                        <TableCell>
                                            <Badge variant={summary.workPercentage >= 80 ? 'default' : 'secondary'}>
                                                {summary.workPercentage}%
                                            </Badge>
                                        </TableCell>
                                        <TableCell>₹{summary.baseSalary.toLocaleString()}</TableCell>
                                        <TableCell className="font-semibold">₹{summary.calculatedSalary.toLocaleString()}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}

            {/* Generated Payrolls */}
            {generatedPayrolls.length > 0 && (
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle>Generated Payrolls</CardTitle>
                                <CardDescription>Manage and export payroll records</CardDescription>
                            </div>
                            <div className="flex gap-2">
                                <Button onClick={handleDownloadAllPayslips} variant="outline" disabled={generatedPayrolls.length === 0}>
                                    <Download className="mr-2 h-4 w-4" />
                                    Download All Payslips
                                </Button>
                                <Button onClick={handleExportCSV} variant="outline">
                                    <Download className="mr-2 h-4 w-4" />
                                    Export CSV
                                </Button>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Employee</TableHead>
                                    <TableHead>Month</TableHead>
                                    <TableHead>Base Salary</TableHead>
                                    <TableHead>Present Days</TableHead>
                                    <TableHead>Net Salary</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {generatedPayrolls.map((payroll) => (
                                    <TableRow key={payroll.id}>
                                        <TableCell className="font-medium">{getEmployeeName(payroll.employeeId)}</TableCell>
                                        <TableCell>{payroll.month}</TableCell>
                                        <TableCell>₹{payroll.baseSalary.toLocaleString()}</TableCell>
                                        <TableCell>{payroll.presentDays + (payroll.halfDays * 0.5)}</TableCell>
                                        <TableCell className="font-semibold">₹{payroll.netSalary.toLocaleString()}</TableCell>
                                        <TableCell>
                                            <Badge
                                                variant={
                                                    payroll.status === 'paid' ? 'default' :
                                                        payroll.status === 'approved' ? 'secondary' :
                                                            'outline'
                                                }
                                            >
                                                {payroll.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-2">
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => handleDownloadPayslip(payroll)}
                                                    title="Download Payslip"
                                                >
                                                    <Download className="h-4 w-4" />
                                                </Button>
                                                {payroll.status === 'draft' && (
                                                    <>
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={() => handleUpdateStatus(payroll.id, 'approved')}
                                                        >
                                                            <Check className="h-4 w-4" />
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={() => handleDeletePayroll(payroll.id)}
                                                        >
                                                            Delete
                                                        </Button>
                                                    </>
                                                )}
                                                {payroll.status === 'approved' && (
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => handleUpdateStatus(payroll.id, 'paid')}
                                                    >
                                                        Mark Paid
                                                    </Button>
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
