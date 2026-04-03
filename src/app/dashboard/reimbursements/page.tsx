'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Plus, Upload, Download, Check, X, FileText, Filter, Calendar, DollarSign, Receipt } from 'lucide-react';
import { ContentSkeleton } from '@/components/ui/dashboard-skeleton';
import { toast } from 'sonner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { hasPermission, hasFullAccess, UserRole } from '@/lib/permissions';

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
    const [reimbursementForm, setReimbursementForm] = useState({
        categoryId: '',
        amount: '',
        expenseDate: '',
        description: '',
        receiptUrl: '',
    });

    // Filters
    const [statusFilter, setStatusFilter] = useState('all');
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    // Admin view
    const [selectedReimbursement, setSelectedReimbursement] = useState<Reimbursement | null>(null);
    const [adminComments, setAdminComments] = useState('');

    useEffect(() => {
        fetchCurrentUser();
    }, []);

    useEffect(() => {
        if (currentUser) {
            const isAdmin = currentUser && hasFullAccess(currentUser.role);
            fetchCategories();
            fetchReimbursements();
            if (isAdmin) {
                fetchEmployees();
                fetchUsers();
            }
        }
    }, [currentUser]);

    const fetchCurrentUser = async () => {
        try {
            const token = localStorage.getItem('bearer_token') || localStorage.getItem('session_token');

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
                    const userEmployee = empData.find((e: Employee) => e.userId === data.user.id);
                    setEmployee(userEmployee || null);
                }
            } else {
                router.push('/login');
            }
        } catch (error) {
            console.error('Error fetching current user:', error);
            router.push('/login');
        } finally {
            setLoading(false);
        }
    };

    const fetchCategories = async () => {
        try {
            const token = localStorage.getItem('bearer_token') || localStorage.getItem('session_token');
            const response = await fetch('/api/reimbursement-categories', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const data = await response.json();
                setCategories(data);
            }
        } catch (error) {
            console.error('Error fetching categories:', error);
        }
    };

    const fetchReimbursements = async () => {
        try {
            const token = localStorage.getItem('bearer_token') || localStorage.getItem('session_token');
            let url = '/api/reimbursements?';

            if (statusFilter !== 'all') url += `status=${statusFilter}&`;
            if (categoryFilter !== 'all') url += `categoryId=${categoryFilter}&`;
            if (startDate) url += `startDate=${startDate}&`;
            if (endDate) url += `endDate=${endDate}&`;

            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const data = await response.json();
                setReimbursements(data);
            }
        } catch (error) {
            console.error('Error fetching reimbursements:', error);
            toast.error('Failed to load reimbursements');
        }
    };

    const fetchEmployees = async () => {
        try {
            const token = localStorage.getItem('bearer_token') || localStorage.getItem('session_token');
            const response = await fetch('/api/employees', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const data = await response.json();
                setEmployees(data);
            }
        } catch (error) {
            console.error('Error fetching employees:', error);
        }
    };

    const fetchUsers = async () => {
        try {
            const token = localStorage.getItem('bearer_token') || localStorage.getItem('session_token');
            const response = await fetch('/api/users', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const data = await response.json();
                setUsers(data);
            }
        } catch (error) {
            console.error('Error fetching users:', error);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate file type
        const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
        if (!allowedTypes.includes(file.type)) {
            toast.error('Only PDF, JPG, and PNG files are allowed');
            return;
        }

        // Validate file size (5MB)
        if (file.size > 5 * 1024 * 1024) {
            toast.error('File size must be less than 5MB');
            return;
        }

        setUploading(true);
        try {
            const token = localStorage.getItem('bearer_token') || localStorage.getItem('session_token');
            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch('/api/upload', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
                body: formData,
            });

            if (response.ok) {
                const data = await response.json();
                setReimbursementForm({ ...reimbursementForm, receiptUrl: data.url });
                toast.success('Receipt uploaded successfully');
            } else {
                toast.error('Failed to upload receipt');
            }
        } catch (error) {
            console.error('Error uploading file:', error);
            toast.error('Error uploading receipt');
        } finally {
            setUploading(false);
        }
    };

    const handleSubmitReimbursement = async (isDraft: boolean = false) => {
        if (!reimbursementForm.categoryId) {
            toast.error('Please select a category');
            return;
        }
        if (!reimbursementForm.amount) {
            toast.error('Please enter an amount');
            return;
        }
        if (!reimbursementForm.expenseDate) {
            toast.error('Please select an expense date');
            return;
        }
        if (!reimbursementForm.description) {
            toast.error('Please provide a description');
            return;
        }

        setSubmitting(true);
        try {
            const token = localStorage.getItem('bearer_token') || localStorage.getItem('session_token');

            const response = await fetch('/api/reimbursements', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    categoryId: reimbursementForm.categoryId,
                    amount: Math.round(parseFloat(reimbursementForm.amount) * 100), // Convert to paise
                    expenseDate: reimbursementForm.expenseDate,
                    description: reimbursementForm.description,
                    receiptUrl: reimbursementForm.receiptUrl || null,
                    status: isDraft ? 'draft' : 'submitted',
                }),
            });

            if (response.ok) {
                toast.success(isDraft ? 'Saved as draft' : 'Reimbursement submitted successfully!');
                setShowDialog(false);
                setReimbursementForm({
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
        } catch (error) {
            console.error('Error submitting reimbursement:', error);
            toast.error('An error occurred while submitting');
        } finally {
            setSubmitting(false);
        }
    };

    const handleApproveReject = async (reimbursement: Reimbursement, newStatus: string) => {
        try {
            const token = localStorage.getItem('bearer_token') || localStorage.getItem('session_token');

            const response = await fetch(`/api/reimbursements?id=${reimbursement.id}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    status: newStatus,
                    adminComments: adminComments || null,
                }),
            });

            if (response.ok) {
                toast.success(`Reimbursement ${newStatus}`);
                setSelectedReimbursement(null);
                setAdminComments('');
                fetchReimbursements();
            } else {
                const error = await response.json();
                toast.error(error.error || 'Failed to update reimbursement');
            }
        } catch (error) {
            console.error('Error updating reimbursement:', error);
            toast.error('An error occurred');
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
        const headers = ['Request ID', 'Employee', 'Category', 'Amount', 'Expense Date', 'Status', 'Submitted Date'];
        const rows = reimbursements.map(r => [
            r.requestId,
            isAdmin ? getEmployeeName(r.employeeId) : 'Me',
            getCategoryName(r.categoryId),
            formatAmount(r.amount),
            new Date(r.expenseDate).toLocaleDateString(),
            r.status,
            r.submittedAt ? new Date(r.submittedAt).toLocaleDateString() : 'N/A',
        ]);

        const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `reimbursements-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
    };

    if (loading) {
        return <ContentSkeleton />;
    }

    const isAdmin = currentUser && hasFullAccess(currentUser.role);
    const canCreate = currentUser && hasPermission(currentUser.role, 'reimbursements', 'canCreate');

    const stats = {
        total: reimbursements.length,
        pending: reimbursements.filter(r => r.status === 'submitted').length,
        approved: reimbursements.filter(r => r.status === 'approved').length,
        totalAmount: reimbursements.filter(r => r.status === 'approved').reduce((sum, r) => sum + r.amount, 0),
    };

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-3xl font-bold tracking-tight">
                    {isAdmin ? 'Reimbursement Management' : 'My Reimbursements'}
                </h2>
                <p className="text-muted-foreground">
                    {isAdmin ? 'Review and manage all reimbursement requests' : 'Submit and track your reimbursement requests'}
                </p>
            </div>

            {/* Statistics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>Total Requests</CardDescription>
                        <CardTitle className="text-2xl">{stats.total}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>Pending Approval</CardDescription>
                        <CardTitle className="text-2xl">{stats.pending}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>Approved</CardDescription>
                        <CardTitle className="text-2xl">{stats.approved}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>Total Approved Amount</CardDescription>
                        <CardTitle className="text-2xl">{formatAmount(stats.totalAmount)}</CardTitle>
                    </CardHeader>
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
                                <Dialog open={showDialog} onOpenChange={setShowDialog}>
                                    <DialogTrigger asChild>
                                        <Button>
                                            <Plus className="mr-2 h-4 w-4" />
                                            New Request
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent className="max-w-2xl">
                                        <DialogHeader>
                                            <DialogTitle>Submit Reimbursement Request</DialogTitle>
                                            <DialogDescription>
                                                Fill in the details of your expense. All fields marked with * are required.
                                            </DialogDescription>
                                        </DialogHeader>

                                        <div className="space-y-4">
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-2">
                                                    <Label>Category *</Label>
                                                    <Select
                                                        value={reimbursementForm.categoryId}
                                                        onValueChange={(value) => setReimbursementForm({ ...reimbursementForm, categoryId: value })}
                                                    >
                                                        <SelectTrigger>
                                                            <SelectValue placeholder="Select category" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {categories.map((cat) => (
                                                                <SelectItem key={cat.id} value={cat.id.toString()}>
                                                                    {cat.name}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>

                                                <div className="space-y-2">
                                                    <Label>Amount (₹) *</Label>
                                                    <Input
                                                        type="number"
                                                        step="0.01"
                                                        value={reimbursementForm.amount}
                                                        onChange={(e) => setReimbursementForm({ ...reimbursementForm, amount: e.target.value })}
                                                        placeholder="0.00"
                                                    />
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <Label>Expense Date *</Label>
                                                <Input
                                                    type="date"
                                                    value={reimbursementForm.expenseDate}
                                                    onChange={(e) => setReimbursementForm({ ...reimbursementForm, expenseDate: e.target.value })}
                                                    max={new Date().toISOString().split('T')[0]}
                                                />
                                            </div>

                                            <div className="space-y-2">
                                                <Label>Description *</Label>
                                                <Textarea
                                                    value={reimbursementForm.description}
                                                    onChange={(e) => setReimbursementForm({ ...reimbursementForm, description: e.target.value })}
                                                    placeholder="Provide details about the expense..."
                                                    rows={3}
                                                />
                                            </div>

                                            <div className="space-y-2">
                                                <Label>Receipt (PDF/JPG/PNG, max 5MB)</Label>
                                                <div className="flex gap-2">
                                                    <input
                                                        ref={fileInputRef}
                                                        type="file"
                                                        accept=".pdf,.jpg,.jpeg,.png,image/jpeg,image/png,application/pdf"
                                                        className="hidden"
                                                        onChange={handleFileUpload}
                                                    />
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        onClick={() => fileInputRef.current?.click()}
                                                        disabled={uploading}
                                                    >
                                                        {uploading ? (
                                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                        ) : (
                                                            <Upload className="mr-2 h-4 w-4" />
                                                        )}
                                                        Upload Receipt
                                                    </Button>
                                                    {reimbursementForm.receiptUrl && (
                                                        <span className="text-sm text-muted-foreground flex items-center">
                                                            <FileText className="mr-2 h-4 w-4" />
                                                            Receipt uploaded
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <DialogFooter>
                                            <Button
                                                variant="outline"
                                                onClick={() => handleSubmitReimbursement(true)}
                                                disabled={submitting}
                                            >
                                                Save as Draft
                                            </Button>
                                            <Button onClick={() => handleSubmitReimbursement(false)} disabled={submitting}>
                                                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                                Submit Request
                                            </Button>
                                        </DialogFooter>
                                    </DialogContent>
                                </Dialog>
                            )}
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Filters */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="space-y-2">
                            <Label>Status</Label>
                            <Select value={statusFilter} onValueChange={(value) => { setStatusFilter(value); fetchReimbursements(); }}>
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
                            <Select value={categoryFilter} onValueChange={(value) => { setCategoryFilter(value); fetchReimbursements(); }}>
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

                    <Button onClick={fetchReimbursements} variant="outline">
                        <Filter className="mr-2 h-4 w-4" />
                        Apply Filters
                    </Button>

                    {/* Table */}
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Request ID</TableHead>
                                {isAdmin && <TableHead>Employee</TableHead>}
                                <TableHead>Category</TableHead>
                                <TableHead>Amount</TableHead>
                                <TableHead>Expense Date</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Submitted</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {reimbursements.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={isAdmin ? 8 : 7} className="text-center py-8 text-muted-foreground">
                                        No reimbursement requests found
                                    </TableCell>
                                </TableRow>
                            ) : (
                                reimbursements.map((reimbursement) => (
                                    <TableRow key={reimbursement.id}>
                                        <TableCell className="font-medium">{reimbursement.requestId}</TableCell>
                                        {isAdmin && <TableCell>{getEmployeeName(reimbursement.employeeId)}</TableCell>}
                                        <TableCell>{getCategoryName(reimbursement.categoryId)}</TableCell>
                                        <TableCell>{formatAmount(reimbursement.amount)}</TableCell>
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
                                                                setAdminComments('');
                                                            }}
                                                        >
                                                            <Check className="h-4 w-4 text-green-600" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => {
                                                                setSelectedReimbursement(reimbursement);
                                                                setAdminComments('');
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
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label className="text-muted-foreground">Category</Label>
                                    <p className="font-medium">{getCategoryName(selectedReimbursement.categoryId)}</p>
                                </div>
                                <div>
                                    <Label className="text-muted-foreground">Amount</Label>
                                    <p className="font-medium">{formatAmount(selectedReimbursement.amount)}</p>
                                </div>
                                <div>
                                    <Label className="text-muted-foreground">Expense Date</Label>
                                    <p className="font-medium">{new Date(selectedReimbursement.expenseDate).toLocaleDateString()}</p>
                                </div>
                                <div>
                                    <Label className="text-muted-foreground">Status</Label>
                                    <div>{getStatusBadge(selectedReimbursement.status)}</div>
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
                                            href={selectedReimbursement.receiptUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-blue-600 hover:underline flex items-center"
                                        >
                                            <FileText className="mr-2 h-4 w-4" />
                                            View Receipt
                                        </a>
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
                                <div className="space-y-2">
                                    <Label>Comments (Optional)</Label>
                                    <Textarea
                                        value={adminComments}
                                        onChange={(e) => setAdminComments(e.target.value)}
                                        placeholder="Add comments or reason for rejection..."
                                        rows={3}
                                    />
                                </div>
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
