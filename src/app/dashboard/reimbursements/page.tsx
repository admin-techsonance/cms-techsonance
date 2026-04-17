'use client';

import React, { useState, useEffect, useRef } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Plus, Upload, Download, Check, X, FileText, Search, Calendar, DollarSign, Receipt, Trash2, BadgeCent, Clock, CheckCircle2 } from 'lucide-react';
import { ContentSkeleton, StatsSkeleton, TableSkeleton, PageHeaderSkeleton, MetricCardGridSkeleton, TabsSkeleton } from '@/components/ui/dashboard-skeleton';
import { toast } from 'sonner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import {
    reimbursementRequestFormSchema,
    reimbursementReviewFormSchema,
    type ReimbursementRequestFormValues,
    type ReimbursementReviewFormValues,
} from '@/lib/forms/schemas';
import { hasPermission, hasFullAccess, isEmployeeRole, UserRole } from '@/lib/permissions';
import {
  COST_CATEGORIES,
  CURRENCIES,
  DIVISIONS,
  BILLING_STATUSES,
  EXPENSE_DEFAULTS,
  createEmptyLineItem,
  getAutoDescription,
  getCurrencySymbol,
  type ClaimLineItem,
} from '@/lib/constants/expense-claims';

interface User {
    id: number;
    role: UserRole;
    firstName: string;
    lastName: string;
}

interface Employee {
    id: number;
    employeeId: string;
    userId: number;
    firstName?: string;
    lastName?: string;
}

interface Category {
    id: number;
    name: string;
    description: string | null;
    maxAmount: number | null;
    isActive: boolean;
}

interface Reimbursement {
    id: number;
    requestId: string;
    employeeId: number;
    categoryId: number;
    amount: number;
    currency: string;
    expenseDate: string;
    description: string;
    receiptUrl: string | null;
    status: string;
    submittedAt: string | null;
    reviewedBy: number | null;
    reviewedAt: string | null;
    adminComments: string | null;
    createdAt: string;
    updatedAt: string;
}

export default function ReimbursementsPage() {
    const router = useRouter();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [employee, setEmployee] = useState<Employee | null>(null);
    const [categories, setCategories] = useState<Category[]>([]);
    const [reimbursements, setReimbursements] = useState<Reimbursement[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [uploading, setUploading] = useState(false);

    // Form state
    const [showDialog, setShowDialog] = useState(false);
    const reimbursementForm = useForm<ReimbursementRequestFormValues>({
        resolver: zodResolver(reimbursementRequestFormSchema),
        defaultValues: {
            categoryId: '',
            amount: '',
            expenseDate: '',
            description: '',
            receiptUrl: '',
        },
    });
    const reviewForm = useForm<ReimbursementReviewFormValues>({
        resolver: zodResolver(reimbursementReviewFormSchema),
        defaultValues: {
            adminComments: '',
        },
    });

    // Filters
    const [statusFilter, setStatusFilter] = useState('all');
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [searchFilter, setSearchFilter] = useState('');

    // Admin view
    const [selectedReimbursement, setSelectedReimbursement] = useState<Reimbursement | null>(null);
    const [currentPage, setCurrentPage] = useState(0);
    const pageSize = 10;

    // Expense Claims state
    const [claimMode, setClaimMode] = useState<'single' | 'multiple'>('single');
    const [singleClaim, setSingleClaim] = useState<ClaimLineItem>(createEmptyLineItem());
    const [multipleItems, setMultipleItems] = useState<ClaimLineItem[]>([createEmptyLineItem()]);
    const [selectedMultipleRows, setSelectedMultipleRows] = useState<string[]>([]);

    useEffect(() => {
        fetchCurrentUser();
    }, []);

    useEffect(() => {
        if (currentUser) {
            const isAdmin = currentUser && hasFullAccess(currentUser.role);
            fetchCategories();
            if (isAdmin) {
                fetchEmployees();
                fetchUsers();
            }
        }
    }, [currentUser]);

    // Automated filtering
    useEffect(() => {
        if (!currentUser) return;
        
        const timer = setTimeout(() => {
            fetchReimbursements();
            setCurrentPage(0); // Reset to first page when any filter changes
        }, 300);

        return () => clearTimeout(timer);
    }, [statusFilter, categoryFilter, startDate, endDate, searchFilter, currentUser]);

    const fetchCurrentUser = async () => {
        try {
            const token = localStorage.getItem('session_token');

            if (!token) {
                router.push('/login');
                return;
            }

            const response = await fetch('/api/auth/me', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const data = await response.json();
                setCurrentUser(data.user);

                // Fetch employee record
                const empResponse = await fetch('/api/employees', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (empResponse.ok) {
                    const empData = await empResponse.json();
                    const employeesData = Array.isArray(empData) ? empData : empData.data ?? [];
                    const userEmployee = employeesData.find((e: Employee) => e.userId === data.user.id);
                    setEmployee(userEmployee || null);
                }
            } else {
                router.push('/login');
            }
        } catch {
            toast.error('Failed to load user profile');
            router.push('/login');
        } finally {
            setLoading(false);
        }
    };

    const fetchCategories = async () => {
        try {
            const token = localStorage.getItem('session_token');
            const response = await fetch('/api/reimbursement-categories', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const data = await response.json();
                setCategories(Array.isArray(data) ? data : data.data ?? []);
            }
        } catch {
            toast.error('Failed to load categories');
        }
    };

    const fetchReimbursements = async () => {
        try {
            const token = localStorage.getItem('session_token');
            let url = '/api/reimbursements?';

            if (statusFilter !== 'all') url += `status=${statusFilter}&`;
            if (categoryFilter !== 'all') url += `categoryId=${categoryFilter}&`;
            if (startDate) url += `startDate=${startDate}&`;
            if (endDate) url += `endDate=${endDate}&`;
            if (searchFilter) url += `search=${encodeURIComponent(searchFilter)}&`;

            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const data = await response.json();
                setReimbursements(Array.isArray(data) ? data : data.data ?? []);
            }
        } catch {
            toast.error('Failed to load reimbursements');
        }
    };

    const fetchEmployees = async () => {
        try {
            const token = localStorage.getItem('session_token');
            const response = await fetch('/api/employees', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const data = await response.json();
                setEmployees(Array.isArray(data) ? data : data.data ?? []);
            }
        } catch {
            toast.error('Failed to load employees');
        }
    };

    const fetchUsers = async () => {
        try {
            const token = localStorage.getItem('session_token');
            const response = await fetch('/api/users', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const data = await response.json();
                setUsers(Array.isArray(data) ? data : data.data ?? []);
            }
        } catch {
            toast.error('Failed to load users');
        }
    };

    const uploadFileToServer = async (file: File): Promise<string | null> => {
        // Validate file type
        const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
        if (!allowedTypes.includes(file.type)) {
            toast.error('Only PDF, JPG, and PNG files are allowed');
            return null;
        }

        // Validate file size (10MB as requested)
        if (file.size > 10 * 1024 * 1024) {
            toast.error('File size must be less than 10MB');
            return null;
        }

        setUploading(true);
        try {
            const token = localStorage.getItem('session_token');
            const formData = new FormData();
            formData.append('file', file);
            formData.append('kind', 'expense');

            const response = await fetch('/api/upload', {
                method: 'POST',
                headers: {
                    'Authorization': token ? `Bearer ${token}` : '',
                },
                body: formData,
            });

            if (response.ok) {
                const data = await response.json();
                // data.url from /api/upload is already formatted for proxy access
                return data.url;
            } else {
                const error = await response.json();
                toast.error(error.error || 'Failed to upload receipt');
                return null;
            }
        } catch (error) {
            console.error('Error uploading receipt:', error);
            toast.error('Error uploading receipt to server');
            return null;
        } finally {
            setUploading(false);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const url = await uploadFileToServer(file);
        if (url) {
            reimbursementForm.setValue('receiptUrl', url, { shouldValidate: true });
            toast.success('Receipt uploaded successfully');
        }
    };

    const handleSubmitReimbursement = async (values: ReimbursementRequestFormValues, isDraft: boolean = false) => {
        setSubmitting(true);
        try {
            const token = localStorage.getItem('session_token');

            const response = await fetch('/api/reimbursements', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    categoryId: values.categoryId,
                    amount: Math.round(parseFloat(values.amount) * 100),
                    expenseDate: values.expenseDate,
                    description: values.description.trim(),
                    receiptUrl: values.receiptUrl || null,
                    status: isDraft ? 'draft' : 'submitted',
                }),
            });

            if (response.ok) {
                toast.success(isDraft ? 'Saved as draft' : 'Reimbursement submitted successfully!');
                setShowDialog(false);
                reimbursementForm.reset({
                    categoryId: '',
                    amount: '',
                    expenseDate: '',
                    description: '',
                    receiptUrl: '',
                });
                fetchReimbursements();
            } else {
                const error = await response.json();
                toast.error(error.error || 'Failed to submit reimbursement');
            }
        } catch {
            toast.error('An error occurred while submitting');
        } finally {
            setSubmitting(false);
        }
    };

    const handleApproveReject = async (reimbursement: Reimbursement, newStatus: string) => {
        try {
            const token = localStorage.getItem('session_token');

            const response = await fetch(`/api/reimbursements?id=${reimbursement.id}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    status: newStatus,
                    adminComments: reviewForm.getValues('adminComments') || null,
                }),
            });

            if (response.ok) {
                toast.success(`Reimbursement ${newStatus}`);
                setSelectedReimbursement(null);
                reviewForm.reset({ adminComments: '' });
                fetchReimbursements();
            } else {
                const error = await response.json();
                toast.error(error.error || 'Failed to update reimbursement');
            }
        } catch {
            toast.error('An error occurred');
        }
    };

    // ─── Expense Claims Handlers ───
    
    // Standardized server-side upload helper for expense claims
    const uploadExpenseReceipt = async (file: File): Promise<string | null> => {
        return await uploadFileToServer(file);
    };

    const updateMultipleItem = (index: number, field: keyof ClaimLineItem, value: any) => {
        const newItems = [...multipleItems];
        newItems[index] = { ...newItems[index], [field]: value };
        setMultipleItems(newItems);
    };

    const handleExpenseSubmit = async (isDraft: boolean) => {
        const itemsToProcess = claimMode === 'single' ? [singleClaim] : multipleItems;
        
        // Validation
        for (const item of itemsToProcess) {
            if (!item.costCategory) return toast.error('Please select a Cost Category for all items');
            if (!item.description.trim()) return toast.error('Description is required for all items');
            if (item.qty < 1) return toast.error('Quantity must be at least 1');
            if (item.unitCost <= 0) return toast.error('Unit Cost must be greater than 0');
            if (!isDraft && !item.receiptFile && !item.receiptUrl) return toast.error('Receipt is required to submit a claim');
        }

        setSubmitting(true);
        try {
            const token = localStorage.getItem('session_token');
            if (!token) throw new Error('No session');

            const uploadedItems = [];

            // Process uploads and prepare payload
            for (const item of itemsToProcess) {
                let finalReceiptUrl = item.receiptUrl;
                if (item.receiptFile) {
                    const url = await uploadExpenseReceipt(item.receiptFile);
                    if (!url) throw new Error('Upload failed');
                    finalReceiptUrl = url;
                }

                // If no receipt yet and submitting for real, fail. If draft, allow.
                if (!isDraft && !finalReceiptUrl) throw new Error('Receipt URL missing');

                uploadedItems.push({
                    categoryId: 1, // Fallback/default logic for old required field. We should ideally lookup or modify backend schema to make optional. Let's send 1 for now if needed by Zod, or handle it server side. Assuming we need a valid ID, let's hardcode 1 or get first category.
                    amount: Math.round(item.totalCost * 100),
                    expenseDate: item.claimDate,
                    description: item.description,
                    receiptUrl: finalReceiptUrl,
                    status: isDraft ? 'draft' : 'submitted',
                    billingStatus: item.billingStatus,
                    costCategory: item.costCategory,
                    currency: item.currency,
                    qty: item.qty,
                    unitCost: item.unitCost,
                    project: item.project,
                    forCompany: item.forCompany,
                    division: item.division,
                    reasonForClaim: item.reasonForClaim
                });
            }

            // We need a categoryId because the API technically still requires it for backwards compatibility with the old categories table.
            const defaultCatId = categories.length > 0 ? categories[0].id : 1;
            uploadedItems.forEach(i => i.categoryId = defaultCatId);

            // Submit items. API currently takes one at a time, so we loop.
            // A bulk endpoint would be better, but we can call it in a loop for now.
            for (const payload of uploadedItems) {
                const response = await fetch('/api/reimbursements', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(payload),
                });

                if (!response.ok) {
                    const err = await response.json();
                    throw new Error(err.error || 'Failed to submit one or more claims');
                }
            }

            toast.success(isDraft ? 'Claims saved as draft' : 'Claims submitted successfully!');
            setShowDialog(false);
            setSingleClaim(createEmptyLineItem());
            setMultipleItems([createEmptyLineItem()]);
            fetchReimbursements();

        } catch (error: any) {
            toast.error(error.message || 'An error occurred while submitting');
        } finally {
            setSubmitting(false);
        }
    };

    const getStatusBadge = (status: string) => {
        const statusColors: Record<string, string> = {
            'draft': 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300',
            'submitted': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
            'approved': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
            'rejected': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
            'returned': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
        };

        return (
            <Badge className={statusColors[status] || ''}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
            </Badge>
        );
    };

    const getCategoryName = (categoryId: number) => {
        const category = categories.find(c => c.id === categoryId);
        return category?.name || 'Unknown';
    };

    const getEmployeeName = (employeeId: number) => {
        const emp = employees.find(e => e.id === employeeId);
        if (!emp) return 'Unknown';

        const user = users.find(u => u.id === emp.userId);
        return user ? `${user.firstName} ${user.lastName}` : emp.employeeId;
    };

    const formatAmount = (amount: number) => {
        return `₹${(amount / 100).toFixed(2)}`;
    };

    const exportToCSV = () => {
        const headers = ['Request ID', 'Employee', 'Project', 'Category', 'Cost Category', 'Amount', 'Currency', 'Expense Date', 'Status', 'Submitted Date', 'Billing Status', 'Qty', 'Unit Cost'];
        const rows = reimbursements.map(r => [
            r.requestId,
            isAdmin ? getEmployeeName(r.employeeId) : 'Me',
            r.project || 'N/A',
            getCategoryName(r.categoryId),
            COST_CATEGORIES.find(c => c.value === r.costCategory)?.label || r.costCategory || 'N/A',
            (r.amount / 100).toFixed(2),
            r.currency || 'INR',
            new Date(r.expenseDate).toLocaleDateString(),
            r.status,
            r.submittedAt ? new Date(r.submittedAt).toLocaleDateString() : 'N/A',
            r.billingStatus || 'N/A',
            r.qty || 1,
            r.unitCost || 0
        ]);

        const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `reimbursements-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
    };

    const isAdmin = currentUser && hasFullAccess(currentUser.role as UserRole);
    const canCreate = currentUser && (
        hasPermission(currentUser.role, 'reimbursements', 'canCreate') ||
        (isEmployeeRole(currentUser.role as UserRole) && currentUser.role !== 'client' as any)
    );

    const stats = {
        total: reimbursements.length,
        pending: reimbursements.filter(r => r.status === 'submitted').length,
        approved: reimbursements.filter(r => r.status === 'approved').length,
        totalAmount: reimbursements.filter(r => r.status === 'approved').reduce((sum, r) => sum + r.amount, 0),
    };

    if (loading || !currentUser) {
        return (
            <div className="space-y-6">
                <PageHeaderSkeleton />
                <MetricCardGridSkeleton count={4} />
                <div className="mt-8">
                    <TabsSkeleton count={isAdmin ? 2 : 1} />
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <header className="flex justify-between items-center">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">
                        {isAdmin ? 'Reimbursement Management' : 'My Reimbursements'}
                    </h2>
                    <p className="text-muted-foreground">
                        {isAdmin ? 'Review and manage all employee reimbursement requests' : 'Submit and track your reimbursement requests'}
                    </p>
                </div>

            </header>

            {/* Statistics Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card className="border-none shadow-sm bg-gradient-to-br from-indigo-500 to-blue-600 text-white">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium opacity-90">Total Approved Amount</CardTitle>
                        <BadgeCent className="h-4 w-4 opacity-70" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatAmount(stats.totalAmount)}</div>
                        <p className="text-xs opacity-70">Paid out to date</p>
                    </CardContent>
                </Card>

                <Card className="border-none shadow-sm bg-gradient-to-br from-amber-500 to-orange-600 text-white">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium opacity-90">Pending Approval</CardTitle>
                        <Clock className="h-4 w-4 opacity-70" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.pending}</div>
                        <p className="text-xs opacity-70">Requests awaiting review</p>
                    </CardContent>
                </Card>

                <Card className="border-none shadow-sm bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium opacity-90">Approved Requests</CardTitle>
                        <CheckCircle2 className="h-4 w-4 opacity-70" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.approved}</div>
                        <p className="text-xs opacity-70">Successfully processed</p>
                    </CardContent>
                </Card>

                <Card className="border-none shadow-sm bg-gradient-to-br from-rose-500 to-pink-600 text-white">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium opacity-90">Total Submissions</CardTitle>
                        <Receipt className="h-4 w-4 opacity-70" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.total}</div>
                        <p className="text-xs opacity-70">Cumulative claims</p>
                    </CardContent>
                </Card>
            </div>


            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>Reimbursement Requests</CardTitle>
                            <CardDescription>
                                {isAdmin ? 'All employee reimbursement requests' : 'Your reimbursement history'}
                            </CardDescription>
                        </div>
                        <div className="flex gap-2">
                            {isAdmin && (
                                <Button variant="outline" onClick={exportToCSV}>
                                    <Download className="mr-2 h-4 w-4" />
                                    Export CSV
                                </Button>
                            )}
                            {canCreate && (
                                <Dialog open={showDialog} onOpenChange={(open) => { setShowDialog(open); if (!open) { setSingleClaim(createEmptyLineItem()); setMultipleItems([createEmptyLineItem()]); setClaimMode('single'); } }}>
                                    <DialogTrigger asChild>
                                        <Button>
                                            <Plus className="mr-2 h-4 w-4" />
                                            Add New Expense Claim
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent className="sm:max-w-[95vw] md:max-w-[1200px] max-h-[95vh] overflow-hidden flex flex-col p-0">
                                        <DialogHeader className="px-6 pt-6 pb-4 border-b">
                                            <DialogTitle className="text-xl">Add New Expense Claims</DialogTitle>
                                            <DialogDescription>
                                                Submit single or multiple expense claims for reimbursement approval.
                                            </DialogDescription>
                                        </DialogHeader>

                                        {/* Tabs: Single / Multiple */}
                                        <div className="flex-1 overflow-y-auto px-6 py-4">
                                          <Tabs value={claimMode} onValueChange={(v) => setClaimMode(v as 'single' | 'multiple')}>
                                            <TabsList className="mb-6">
                                              <TabsTrigger value="single">Single</TabsTrigger>
                                              <TabsTrigger value="multiple">
                                                <Receipt className="w-4 h-4 mr-1" />
                                                Multiple
                                              </TabsTrigger>
                                            </TabsList>

                                            {/* ─── SINGLE MODE ─── */}
                                            <TabsContent value="single" className="space-y-6 mt-0">
                                              {/* Top Row: Employee Card + Status + Claim Date */}
                                              <div className="flex flex-col md:flex-row gap-6 items-start">
                                                <div className="border rounded-lg p-4 flex items-center gap-3 min-w-[250px] bg-muted/30">
                                                  <img src="https://ui-avatars.com/api/?name=Sajeshkumar+Adeya&background=random" alt="Avatar" className="w-12 h-12 rounded-full ring-2 ring-primary/20" />
                                                  <div>
                                                    <p className="font-semibold text-lg">{currentUser?.firstName || 'Sajeshkumar'} {currentUser?.lastName || 'Adeya'}</p>
                                                    <p className="text-xs text-muted-foreground">Select staff if needed</p>
                                                  </div>
                                                </div>
                                                <div className="flex-1 flex justify-center pt-4">
                                                  <Badge variant="secondary" className="bg-zinc-800 text-white hover:bg-zinc-700 py-1.5 px-6 rounded-full text-sm">Not Submitted</Badge>
                                                </div>
                                                <div className="space-y-1 min-w-[200px]">
                                                  <Label className="text-sm font-medium">Actual Claim Date <span className="text-destructive">*</span></Label>
                                                  <Input type="date" value={singleClaim.claimDate} onChange={(e) => setSingleClaim({...singleClaim, claimDate: e.target.value})} max={new Date().toISOString().split('T')[0]} className="h-10 rounded-xl" />
                                                </div>
                                              </div>

                                              {/* Division / Business Unit / For Company */}
                                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                <div className="space-y-1">
                                                  <Label className="text-sm">Division <span className="text-destructive">*</span></Label>
                                                  <Select value={singleClaim.division || EXPENSE_DEFAULTS.division} onValueChange={(v) => setSingleClaim({...singleClaim, division: v})}>
                                                    <SelectTrigger className="bg-muted/30 border-none h-11"><SelectValue /></SelectTrigger>
                                                    <SelectContent>
                                                      {DIVISIONS.map(d => <SelectItem key={d.value} value={d.value}>{d.value}</SelectItem>)}
                                                    </SelectContent>
                                                  </Select>
                                                </div>
                                                <div className="space-y-1">
                                                  <Label className="text-sm">Business Unit <span className="text-destructive">*</span></Label>
                                                  <Select value="VODOin" disabled>
                                                    <SelectTrigger className="bg-muted/30 border-none h-11"><SelectValue placeholder="VODOin" /></SelectTrigger>
                                                  </Select>
                                                </div>
                                                <div className="space-y-1">
                                                  <Label className="text-sm">For Company <span className="text-destructive">*</span></Label>
                                                  <Input value={singleClaim.forCompany} onChange={(e) => setSingleClaim({...singleClaim, forCompany: e.target.value})} placeholder="Search Company" className="bg-muted/30 border-none h-11" />
                                                </div>
                                              </div>

                                              {/* Project */}
                                              <div className="grid grid-cols-1 gap-4">
                                                <div className="space-y-1">
                                                  <Label className="text-sm">Project <span className="text-destructive">*</span></Label>
                                                  <Input value={singleClaim.project} onChange={(e) => setSingleClaim({...singleClaim, project: e.target.value})} placeholder="Search Project" className="bg-muted/30 border-none h-11" />
                                                </div>
                                              </div>

                                              {/* Reason + Billing/Cost/Currency */}
                                              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                                <div className="space-y-1">
                                                  <Label className="text-sm">Reason for Claim <span className="text-destructive">*</span></Label>
                                                  <Textarea value={singleClaim.reasonForClaim} onChange={(e) => setSingleClaim({...singleClaim, reasonForClaim: e.target.value})} placeholder="" className="bg-white border text-sm min-h-[200px]" />
                                                </div>
                                                
                                                <div className="space-y-4 border rounded-2xl p-6 bg-muted/5 shadow-sm">
                                                  <div className="space-y-4">
                                                    <div className="flex items-center justify-between gap-4">
                                                      <Label className="text-sm font-medium min-w-[120px]">Billing Status</Label>
                                                      <Select value={singleClaim.billingStatus} onValueChange={(v) => setSingleClaim({...singleClaim, billingStatus: v as any})}>
                                                        <SelectTrigger className="bg-white border rounded-full h-10 w-full"><SelectValue /></SelectTrigger>
                                                        <SelectContent>
                                                          {BILLING_STATUSES.map(b => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}
                                                        </SelectContent>
                                                      </Select>
                                                    </div>

                                                    <div className="flex items-center justify-between gap-4">
                                                      <Label className="text-sm font-medium min-w-[120px]">Cost Category <span className="text-destructive">*</span></Label>
                                                      <Select value={singleClaim.costCategory || undefined} onValueChange={(v) => setSingleClaim({...singleClaim, costCategory: v as any, description: getAutoDescription(v)})}>
                                                        <SelectTrigger className="bg-white border rounded-full h-10 w-full"><SelectValue placeholder="Select Cost Category" /></SelectTrigger>
                                                        <SelectContent>
                                                          {COST_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                                                        </SelectContent>
                                                      </Select>
                                                    </div>

                                                    <div className="flex items-center justify-between gap-4">
                                                      <Label className="text-sm font-medium min-w-[120px]">Description <span className="text-destructive">*</span></Label>
                                                      <Input value={singleClaim.description} onChange={(e) => setSingleClaim({...singleClaim, description: e.target.value})} className="bg-white border rounded-full h-10 w-full" />
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-4">
                                                      <div className="flex items-center gap-2">
                                                        <Label className="text-sm font-medium min-w-[80px]">Currency <span className="text-destructive">*</span></Label>
                                                        <Select value={singleClaim.currency} onValueChange={(v) => setSingleClaim({...singleClaim, currency: v as any})}>
                                                          <SelectTrigger className="bg-white border rounded-full h-10"><SelectValue /></SelectTrigger>
                                                          <SelectContent>
                                                            {CURRENCIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                                                          </SelectContent>
                                                        </Select>
                                                      </div>
                                                      <div className="flex items-center gap-2">
                                                        <Label className="text-sm font-medium">QTY <span className="text-destructive">*</span></Label>
                                                        <Input type="number" min={1} value={singleClaim.qty} onChange={(e) => { const q = parseInt(e.target.value) || 1; setSingleClaim({...singleClaim, qty: q, totalCost: q * singleClaim.unitCost}); }} className="bg-white border rounded-full h-10" />
                                                      </div>
                                                    </div>

                                                    <div className="flex items-center justify-between gap-4">
                                                      <Label className="text-sm font-medium min-w-[120px]">Unit Cost (Inc Vat) <span className="text-destructive">*</span></Label>
                                                      <Input type="number" step="0.01" min={0} value={singleClaim.unitCost || ''} onChange={(e) => { const u = parseFloat(e.target.value) || 0; setSingleClaim({...singleClaim, unitCost: u, totalCost: singleClaim.qty * u}); }} placeholder="0.00" className="bg-white border rounded-full h-10 w-full" />
                                                    </div>

                                                    <div className="flex items-center justify-between gap-4">
                                                      <Label className="text-sm font-bold min-w-[120px] text-destructive">Total Cost <span className="text-destructive">*</span></Label>
                                                      <div className="h-10 px-6 py-2 rounded-full border bg-muted/20 flex items-center font-bold w-full">
                                                        {getCurrencySymbol(singleClaim.currency)} {singleClaim.totalCost.toFixed(2)}
                                                      </div>
                                                    </div>
                                                  </div>
                                                </div>
                                              </div>

                                              <div className="flex items-center gap-4">
                                                <Label className="text-sm font-medium">Document <span className="text-destructive">*</span></Label>
                                                <label className="text-sm text-muted-foreground cursor-pointer hover:text-primary transition-colors flex items-center gap-2">
                                                  <Input type="file" className="hidden" onChange={(e) => {
                                                    const file = e.target.files?.[0];
                                                    if (!file) return;
                                                    setSingleClaim({...singleClaim, receiptFile: file});
                                                  }} />
                                                  <Upload className="w-4 h-4" />
                                                  {singleClaim.receiptFile ? singleClaim.receiptFile.name : 'Upload a file'}
                                                </label>
                                              </div>
                                            </TabsContent>

                                            {/* ─── MULTIPLE MODE ─── */}
                                            <TabsContent value="multiple" className="space-y-6 mt-0">
                                              <div className="flex flex-col md:flex-row gap-6 items-start">
                                                <div className="border rounded-lg p-4 flex items-center gap-3 min-w-[250px] bg-muted/30">
                                                  <img src="https://ui-avatars.com/api/?name=Sajeshkumar+Adeya&background=random" alt="Avatar" className="w-10 h-10 rounded-full" />
                                                  <div>
                                                    <p className="font-semibold">{currentUser?.firstName || 'Sajeshkumar'} {currentUser?.lastName || 'Adeya'}</p>
                                                    <p className="text-[10px] text-muted-foreground">Select staff if needed</p>
                                                  </div>
                                                </div>
                                                <div className="flex-1 grid grid-cols-4 gap-4 w-full">
                                                  <div className="space-y-1">
                                                    <Label className="text-[10px]">Division <span className="text-destructive">*</span></Label>
                                                    <Select 
                                                      value={multipleItems[0]?.division || EXPENSE_DEFAULTS.division} 
                                                      onValueChange={(v) => {
                                                        multipleItems.forEach((_, i) => updateMultipleItem(i, 'division', v));
                                                      }}
                                                    >
                                                      <SelectTrigger className="bg-muted/30 border-none h-9 text-xs"><SelectValue /></SelectTrigger>
                                                      <SelectContent>{DIVISIONS.map(d => <SelectItem key={d.value} value={d.value}>{d.value}</SelectItem>)}</SelectContent>
                                                    </Select>
                                                  </div>
                                                  <div className="space-y-1">
                                                    <Label className="text-[10px]">Business Unit <span className="text-destructive">*</span></Label>
                                                    <Select value="VODOin" disabled><SelectTrigger className="bg-muted/30 border-none h-9 text-xs"><SelectValue placeholder="VODOin" /></SelectTrigger></Select>
                                                  </div>
                                                  <div className="space-y-1">
                                                    <Label className="text-[10px]">Currency <span className="text-destructive">*</span></Label>
                                                    <Select 
                                                      value={multipleItems[0]?.currency || EXPENSE_DEFAULTS.currency} 
                                                      onValueChange={(v) => {
                                                        multipleItems.forEach((_, i) => updateMultipleItem(i, 'currency', v as any));
                                                      }}
                                                    >
                                                      <SelectTrigger className="bg-muted/30 border-none h-9 text-xs"><SelectValue /></SelectTrigger>
                                                      <SelectContent>{CURRENCIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                                                    </Select>
                                                  </div>
                                                  <div className="flex flex-col justify-end items-end gap-1">
                                                    <Badge variant="secondary" className="bg-zinc-800 text-white py-1 px-4 rounded-full text-[10px]">Not Submitted</Badge>
                                                    <p className="font-bold text-xl leading-none">Total: {multipleItems.reduce((s, i) => s + i.totalCost, 0).toFixed(2).toLocaleString()}</p>
                                                  </div>
                                                </div>
                                              </div>

                                              <div className="border rounded-lg max-h-[400px] overflow-y-auto">
                                                <Table>
                                                  <TableBody>
                                                    {multipleItems.map((item, idx) => (
                                                      <React.Fragment key={item.id}>
                                                        <TableRow className={`${selectedMultipleRows.includes(item.id) ? 'bg-primary/5' : 'bg-muted/10'} border-t-2`}>
                                                          <TableCell className="p-2 w-10">
                                                            <input 
                                                              type="checkbox" 
                                                              checked={selectedMultipleRows.includes(item.id)}
                                                              onChange={() => {
                                                                if (selectedMultipleRows.includes(item.id)) {
                                                                  setSelectedMultipleRows(selectedMultipleRows.filter(id => id !== item.id));
                                                                } else {
                                                                  setSelectedMultipleRows([...selectedMultipleRows, item.id]);
                                                                }
                                                              }}
                                                              className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                                                            />
                                                          </TableCell>
                                                          <TableCell className="p-1"><Input value={item.forCompany} onChange={(e) => updateMultipleItem(idx, 'forCompany', e.target.value)} placeholder="Search Company" className="h-8 text-xs bg-white" /></TableCell>
                                                          <TableCell className="p-1"><Input value={item.project} onChange={(e) => updateMultipleItem(idx, 'project', e.target.value)} placeholder="Search Project" className="h-8 text-xs bg-white" /></TableCell>
                                                          <TableCell className="p-1 w-32"><Input type="date" value={item.claimDate} onChange={(e) => updateMultipleItem(idx, 'claimDate', e.target.value)} className="h-8 text-[10px] bg-white" max={new Date().toISOString().split('T')[0]} /></TableCell>
                                                          <TableCell className="p-1">
                                                            <Select value={item.costCategory || undefined} onValueChange={(v) => { updateMultipleItem(idx, 'costCategory', v); updateMultipleItem(idx, 'description', getAutoDescription(v)); }}>
                                                              <SelectTrigger className="h-8 text-xs bg-white"><SelectValue placeholder="Select Cost Category" /></SelectTrigger>
                                                              <SelectContent>{COST_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                                                            </Select>
                                                          </TableCell>
                                                          <TableCell className="p-1 w-16"><Input type="number" min={1} value={item.qty} onChange={(e) => { const q = parseInt(e.target.value) || 1; updateMultipleItem(idx, 'qty', q); updateMultipleItem(idx, 'totalCost', q * item.unitCost); }} className="h-8 text-xs" /></TableCell>
                                                          <TableCell className="p-1 w-32"><Input type="number" step="0.01" min={0} value={item.unitCost || ''} onChange={(e) => { const u = parseFloat(e.target.value) || 0; updateMultipleItem(idx, 'unitCost', u); updateMultipleItem(idx, 'totalCost', item.qty * u); }} className="h-8 text-xs" placeholder="Unit Cost Inc. VAT" /></TableCell>
                                                          <TableCell className="p-1 w-24"><div className="h-8 flex items-center justify-end text-xs font-bold text-muted-foreground bg-muted/20 rounded px-2">{item.totalCost.toFixed(2)}</div></TableCell>
                                                        </TableRow>
                                                        <TableRow className={`${selectedMultipleRows.includes(item.id) ? 'bg-primary/5' : 'bg-white'} border-b-2`}>
                                                          <TableCell className="p-1"></TableCell>
                                                          <TableCell colSpan={4} className="p-1"><Input value={item.reasonForClaim} onChange={(e) => updateMultipleItem(idx, 'reasonForClaim', e.target.value)} placeholder="Reason For Claim" className="h-8 text-xs border-none bg-transparent shadow-none" /></TableCell>
                                                          <TableCell colSpan={2} className="p-1 text-right">
                                                            <Select value={item.billingStatus} onValueChange={(v) => updateMultipleItem(idx, 'billingStatus', v)}>
                                                              <SelectTrigger className="h-8 text-xs border-none bg-transparent shadow-none w-fit ml-auto"><SelectValue /></SelectTrigger>
                                                              <SelectContent>{BILLING_STATUSES.map(b => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}</SelectContent>
                                                            </Select>
                                                          </TableCell>
                                                          <TableCell className="p-1">
                                                            <label className="text-[10px] text-muted-foreground cursor-pointer flex items-center justify-end gap-1">
                                                              <Input type="file" className="hidden" onChange={(e) => updateMultipleItem(idx, 'receiptFile', e.target.files?.[0] || null)} />
                                                              <span className={item.receiptFile ? "text-green-600 font-bold" : ""}>{item.receiptFile ? "File Added" : "Upload a file *"}</span>
                                                            </label>
                                                          </TableCell>
                                                        </TableRow>
                                                      </React.Fragment>
                                                    ))}
                                                  </TableBody>
                                                </Table>
                                              </div>

                                              {/* Bottom controls: Add / Delete / Select */}
                                              <div className="flex items-center gap-2">
                                                <Button size="sm" variant="default" className="bg-green-600 hover:bg-green-700" onClick={() => setMultipleItems([...multipleItems, createEmptyLineItem()])}>
                                                  <Plus className="h-3 w-3 mr-1" /> ADD
                                                </Button>
                                                <Button size="sm" variant="destructive" onClick={() => { if (selectedMultipleRows.length === 0) { toast.error('Select rows to delete'); return; } setMultipleItems(multipleItems.filter(i => !selectedMultipleRows.includes(i.id))); setSelectedMultipleRows([]); }} disabled={multipleItems.length <= 1}>
                                                  <X className="h-3 w-3 mr-1" /> DELETE
                                                </Button>
                                                <Button size="sm" variant="outline" onClick={() => { if (selectedMultipleRows.length === multipleItems.length) setSelectedMultipleRows([]); else setSelectedMultipleRows(multipleItems.map(i => i.id)); }}>
                                                  <Check className="h-3 w-3 mr-1" /> {selectedMultipleRows.length === multipleItems.length ? 'DESELECT' : 'SELECT ALL'}
                                                </Button>
                                              </div>
                                            </TabsContent>
                                          </Tabs>
                                        </div>

                                        {/* Footer: Save / Upload & Submit / Close */}
                                        <div className="px-6 py-4 border-t flex items-center justify-end gap-3 bg-muted/20">
                                          <Button variant="default" className="bg-green-600 hover:bg-green-700" onClick={() => handleExpenseSubmit(true)} disabled={submitting}>
                                            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                            <Check className="mr-1 h-4 w-4" /> SAVE
                                          </Button>
                                          <Button onClick={() => handleExpenseSubmit(false)} disabled={submitting}>
                                            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                            <Upload className="mr-1 h-4 w-4" /> UPLOAD & SUBMIT
                                          </Button>
                                          <Button variant="outline" onClick={() => setShowDialog(false)}>
                                            <X className="mr-1 h-4 w-4" /> CLOSE
                                          </Button>
                                        </div>
                                    </DialogContent>
                                </Dialog>
                            )}
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Filters */}
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                        <div className="space-y-2">
                            <Label>Search</Label>
                            <div className="relative">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Request ID or Description"
                                    className="pl-8"
                                    value={searchFilter}
                                    onChange={(e) => setSearchFilter(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>Status</Label>
                            <Select value={statusFilter} onValueChange={setStatusFilter}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Status</SelectItem>
                                    <SelectItem value="draft">Draft</SelectItem>
                                    <SelectItem value="submitted">Submitted</SelectItem>
                                    <SelectItem value="approved">Approved</SelectItem>
                                    <SelectItem value="rejected">Rejected</SelectItem>
                                    <SelectItem value="returned">Returned</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>Category</Label>
                            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Categories</SelectItem>
                                    {categories.map((cat) => (
                                        <SelectItem key={cat.id} value={cat.id.toString()}>
                                            {cat.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>Start Date</Label>
                            <Input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>End Date</Label>
                            <Input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Table */}
                    <div className="max-h-[500px] overflow-y-auto">
                        <Table>
                            <TableHeader className="sticky top-0 bg-background z-10">
                                <TableRow>
                                    <TableHead>Request ID</TableHead>
                                    {isAdmin && <TableHead>Employee</TableHead>}
                                    <TableHead>Project</TableHead>
                                    <TableHead>Cost Category</TableHead>
                                    <TableHead>Amount</TableHead>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableSkeleton columns={isAdmin ? 8 : 7} rows={10} />
                                ) : reimbursements.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={isAdmin ? 8 : 7} className="text-center py-8 text-muted-foreground">
                                            No reimbursement requests found
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    reimbursements.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map((reimbursement) => (
                                        <TableRow key={reimbursement.id}>
                                            <TableCell className="font-medium">{reimbursement.requestId}</TableCell>
                                            {isAdmin && <TableCell>{getEmployeeName(reimbursement.employeeId)}</TableCell>}
                                            <TableCell>{reimbursement.project || 'TechSonance'}</TableCell>
                                            <TableCell>{COST_CATEGORIES.find(c => c.value === reimbursement.costCategory)?.label || '—'}</TableCell>
                                            <TableCell>{getCurrencySymbol(reimbursement.currency)} {(reimbursement.amount / 100).toFixed(2)}</TableCell>
                                            <TableCell>{new Date(reimbursement.expenseDate).toLocaleDateString()}</TableCell>
                                            <TableCell>{getStatusBadge(reimbursement.status)}</TableCell>
                                            <TableCell>
                                                {reimbursement.submittedAt ? new Date(reimbursement.submittedAt).toLocaleDateString() : '—'}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex justify-end gap-2">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => setSelectedReimbursement(reimbursement)}
                                                    >
                                                        View
                                                    </Button>
                                                    {isAdmin && reimbursement.status === 'submitted' && (
                                                        <>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => {
                                                                    setSelectedReimbursement(reimbursement);
                                                                    reviewForm.reset({ adminComments: '' });
                                                                }}
                                                            >
                                                                <Check className="h-4 w-4 text-green-600" />
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => {
                                                                    setSelectedReimbursement(reimbursement);
                                                                    reviewForm.reset({ adminComments: '' });
                                                                }}
                                                            >
                                                                <X className="h-4 w-4 text-red-600" />
                                                            </Button>
                                                        </>
                                                    )}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                    <div className="flex items-center justify-end space-x-2 pt-4">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
                            disabled={currentPage === 0}
                        >
                            Previous
                        </Button>
                        <div className="text-sm font-medium">
                            Page {currentPage + 1} of {Math.ceil(reimbursements.length / pageSize) || 1}
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(Math.min(Math.ceil(reimbursements.length / pageSize) - 1, currentPage + 1))}
                            disabled={currentPage >= Math.ceil(reimbursements.length / pageSize) - 1}
                        >
                            Next
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* View/Approve Dialog */}
            <Dialog open={!!selectedReimbursement} onOpenChange={() => setSelectedReimbursement(null)}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Reimbursement Details</DialogTitle>
                        <DialogDescription>
                            Request ID: {selectedReimbursement?.requestId}
                        </DialogDescription>
                    </DialogHeader>

                    {selectedReimbursement && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                                <div>
                                    <Label className="text-muted-foreground">Request ID</Label>
                                    <p className="font-medium">{selectedReimbursement.requestId}</p>
                                </div>
                                {isAdmin && (
                                  <div>
                                      <Label className="text-muted-foreground">Employee</Label>
                                      <p className="font-medium">{getEmployeeName(selectedReimbursement.employeeId)}</p>
                                  </div>
                                )}
                                <div>
                                    <Label className="text-muted-foreground">Date Submitted</Label>
                                    <p className="font-medium">{selectedReimbursement.submittedAt ? new Date(selectedReimbursement.submittedAt).toLocaleDateString() : '—'}</p>
                                </div>
                                <div className="col-span-full border-t my-2" />
                                <div>
                                    <Label className="text-muted-foreground">Division</Label>
                                    <p className="font-medium">{selectedReimbursement.division}</p>
                                </div>
                                <div>
                                    <Label className="text-muted-foreground">Project</Label>
                                    <p className="font-medium">{selectedReimbursement.project}</p>
                                </div>
                                <div>
                                    <Label className="text-muted-foreground">Actual Claim Date</Label>
                                    <p className="font-medium">{new Date(selectedReimbursement.expenseDate).toLocaleDateString()}</p>
                                </div>
                                <div>
                                    <Label className="text-muted-foreground">Reason for Claim</Label>
                                    <p className="font-medium">{selectedReimbursement.reasonForClaim || '—'}</p>
                                </div>
                                <div>
                                    <Label className="text-muted-foreground">Cost Category</Label>
                                    <p className="font-medium">{COST_CATEGORIES.find(c => c.value === selectedReimbursement.costCategory)?.label || selectedReimbursement.costCategory || '—'}</p>
                                </div>
                                <div>
                                    <Label className="text-muted-foreground">Billing Status</Label>
                                    <p className="font-medium">
                                      {BILLING_STATUSES.find(b => b.value === selectedReimbursement.billingStatus)?.label || selectedReimbursement.billingStatus}
                                    </p>
                                </div>
                                <div>
                                    <Label className="text-muted-foreground">Quantity & Unit Cost</Label>
                                    <p className="font-medium">{selectedReimbursement.qty} x {getCurrencySymbol(selectedReimbursement.currency)}{selectedReimbursement.unitCost}</p>
                                </div>
                                <div>
                                    <Label className="text-muted-foreground">Total Cost</Label>
                                    <p className="font-bold text-lg">{getCurrencySymbol(selectedReimbursement.currency)} {(selectedReimbursement.amount / 100).toFixed(2)}</p>
                                </div>
                                <div>
                                    <Label className="text-muted-foreground">Status</Label>
                                    <div className="mt-1">{getStatusBadge(selectedReimbursement.status)}</div>
                                </div>
                            </div>

                            <div>
                                <Label className="text-muted-foreground">Description</Label>
                                <p className="mt-1">{selectedReimbursement.description}</p>
                            </div>

                            {selectedReimbursement.receiptUrl && (
                                <div>
                                    <Label className="text-muted-foreground">Receipt</Label>
                                    <div className="mt-1">
                                        <a
                                            href="#"
                                            onClick={async (e) => {
                                                e.preventDefault();
                                                const url = selectedReimbursement.receiptUrl;
                                                if (!url) return;
                                                
                                                if (url.startsWith('/uploads/')) {
                                                    window.open(url, '_blank');
                                                    return;
                                                }

                                                try {
                                                    const token = localStorage.getItem('session_token');
                                                    const res = await fetch(url, {
                                                        headers: {
                                                            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
                                                            'Accept': 'application/json'
                                                        }
                                                    });
                                                    
                                                    if (res.ok) {
                                                        const data = await res.json();
                                                        const finalUrl = data.data?.url || data.url;
                                                        if (finalUrl) {
                                                            window.open(finalUrl, '_blank');
                                                        } else {
                                                            toast.error("Failed to parse secure receipt URL");
                                                        }
                                                    } else {
                                                        toast.error("Failed to load receipt");
                                                    }
                                                } catch (err) {
                                                    console.error("Error opening receipt:", err);
                                                    toast.error("Failed to open receipt");
                                                }
                                            }}
                                            className="text-blue-600 hover:underline flex items-center group cursor-pointer"
                                        >
                                            <FileText className="mr-2 h-4 w-4" />
                                            <span>View Receipt</span>
                                            {selectedReimbursement.receiptUrl.startsWith('/uploads/') && (
                                                <Badge variant="outline" className="ml-2 text-[10px] py-0 h-4 border-amber-200 bg-amber-50 text-amber-700">
                                                    Legacy File
                                                </Badge>
                                            )}
                                        </a>
                                        {selectedReimbursement.receiptUrl.startsWith('/uploads/') && (
                                            <p className="text-[10px] text-muted-foreground mt-1 italic">
                                                Note: This is a legacy receipt. If it fails to load, the original file may be missing from the server.
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )}

                            {selectedReimbursement.adminComments && (
                                <div>
                                    <Label className="text-muted-foreground">Admin Comments</Label>
                                    <p className="mt-1">{selectedReimbursement.adminComments}</p>
                                </div>
                            )}

                            {isAdmin && selectedReimbursement.status === 'submitted' && (
                                <Form {...reviewForm}>
                                <FormField
                                    control={reviewForm.control}
                                    name="adminComments"
                                    render={({ field }) => (
                                <FormItem className="space-y-2">
                                    <Label>Comments (Optional)</Label>
                                    <FormControl>
                                    <Textarea
                                        {...field}
                                        placeholder="Add comments or reason for rejection..."
                                        rows={3}
                                    />
                                    </FormControl>
                                    <FormMessage className="text-xs" />
                                </FormItem>
                                    )}
                                />
                                </Form>
                            )}
                        </div>
                    )}

                    <DialogFooter>
                        {isAdmin && selectedReimbursement?.status === 'submitted' ? (
                            <>
                                <Button
                                    variant="outline"
                                    onClick={() => handleApproveReject(selectedReimbursement, 'returned')}
                                >
                                    Return for Changes
                                </Button>
                                <Button
                                    variant="destructive"
                                    onClick={() => handleApproveReject(selectedReimbursement, 'rejected')}
                                >
                                    Reject
                                </Button>
                                <Button
                                    onClick={() => handleApproveReject(selectedReimbursement, 'approved')}
                                >
                                    Approve
                                </Button>
                            </>
                        ) : (
                            <Button variant="outline" onClick={() => setSelectedReimbursement(null)}>
                                Close
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
