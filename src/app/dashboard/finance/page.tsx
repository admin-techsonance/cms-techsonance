'use client';

import { useState, useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { Plus, Loader2, DollarSign, TrendingUp, CreditCard, Eye, Download, Send, FileText, Users, ShoppingCart, Receipt, CheckCircle, Clock, AlertCircle, Trash2, Pencil, Printer } from 'lucide-react';
import { InlineTableSkeleton } from '@/components/ui/dashboard-skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  financeCategorySchema,
  financeExpenseSchema,
  financeInvoiceSchema,
  financePurchaseSchema,
  financeVendorSchema,
  type FinanceCategoryFormValues,
  type FinanceInvoiceFormValues,
  type FinancePurchaseFormValues,
  type FinanceVendorFormValues,
} from '@/lib/forms/schemas';
import { toast } from 'sonner';

interface Invoice {
  id: number;
  invoiceNumber: string;
  clientId: number;
  amount: number;
  tax: number;
  totalAmount: number;
  status: string;
  dueDate: string;
  paidDate: string | null;
  createdAt: string;
  notes?: string;
  termsAndConditions?: string;
  paymentTerms?: string;
  updatedAt?: string;
}

interface Expense {
  id: number;
  category: string;
  description: string;
  amount: number;
  date: string;
  status: string;
}

interface Vendor {
  id: number;
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  status: string;
}

interface Purchase {
  id: number;
  vendorId: number;
  date: string;
  amount: number;
  description: string;
  status: string;
  vendorName?: string;
}

interface ExpenseCategory {
  id: number;
  name: string;
  description: string;
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
  termsAndConditions: string;
  notes: string;
  paymentTerms: string;
  logoUrl: string;
}

interface Client {
  id: number;
  companyName: string;
  email: string;
  address: string;
}

const getAuthHeaders = () => {
  const token = localStorage.getItem('session_token');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
};

export default function FinancePage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  // Form States
  const [isAddVendorOpen, setIsAddVendorOpen] = useState(false);
  const vendorForm = useForm<FinanceVendorFormValues>({
    resolver: zodResolver(financeVendorSchema),
    defaultValues: { name: '', contactPerson: '', email: '', phone: '' },
  });

  const [isAddPurchaseOpen, setIsAddPurchaseOpen] = useState(false);
  const purchaseForm = useForm<FinancePurchaseFormValues>({
    resolver: zodResolver(financePurchaseSchema),
    defaultValues: { vendorId: '', date: '', amount: '', description: '' },
  });

  const [newExpense, setNewExpense] = useState({ category: '', description: '', amount: '', date: new Date().toISOString().split('T')[0] });

  // Invoice State
  const [isInvoiceDialogOpen, setIsInvoiceDialogOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const invoiceForm = useForm<FinanceInvoiceFormValues>({
    resolver: zodResolver(financeInvoiceSchema),
    defaultValues: {
      clientId: '',
      invoiceNumber: '',
      amount: '',
      tax: '0',
      dueDate: '',
      termsAndConditions: '',
      notes: '',
      paymentTerms: '',
    },
  });

  // Edit States
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [isEditVendorOpen, setIsEditVendorOpen] = useState(false);

  const [editingPurchase, setEditingPurchase] = useState<Purchase | null>(null);
  const [isEditPurchaseOpen, setIsEditPurchaseOpen] = useState(false);

  // Category State
  const [isAddCategoryOpen, setIsAddCategoryOpen] = useState(false);
  const categoryForm = useForm<FinanceCategoryFormValues>({
    resolver: zodResolver(financeCategorySchema),
    defaultValues: { name: '', description: '' },
  });
  const [categoryError, setCategoryError] = useState('');
  const [editingCategory, setEditingCategory] = useState<ExpenseCategory | null>(null);
  const [isEditCategoryOpen, setIsEditCategoryOpen] = useState(false);

  // File Upload State
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  // Business Settings State
  const [businessSettings, setBusinessSettings] = useState<BusinessSettings>({
    businessName: '',
    email: '',
    phone: '',
    address: '',
    gstNo: '',
    pan: '',
    tan: '',
    registrationNo: '',
    termsAndConditions: '',
    notes: '',
    paymentTerms: '',
    logoUrl: ''
  });

  const [reportYear, setReportYear] = useState(new Date().getFullYear().toString());
  const [monthSearch, setMonthSearch] = useState('');

  // Pagination states
  const [vendorPage, setVendorPage] = useState(0);
  const [purchasePage, setPurchasePage] = useState(0);
  const [categoryPage, setCategoryPage] = useState(0);
  const [expensePage, setExpensePage] = useState(0);
  const [invoicePage, setInvoicePage] = useState(0);
  const pageSize = 10;

  useEffect(() => {
    fetchFinanceData();
  }, []);

  const fetchFinanceData = async () => {
    setLoading(true);
    try {
      const [invoicesRes, expensesRes, vendorsRes, purchasesRes, categoriesRes, clientsRes] = await Promise.all([
        fetch('/api/invoices?limit=100', { headers: getAuthHeaders() }),
        fetch('/api/expenses?limit=100', { headers: getAuthHeaders() }),
        fetch('/api/vendors', { headers: getAuthHeaders() }),
        fetch('/api/purchases', { headers: getAuthHeaders() }),
        fetch('/api/expense-categories', { headers: getAuthHeaders() }),
        fetch('/api/clients', { headers: getAuthHeaders() }),
      ]);

      if (invoicesRes.ok) {
        const data = await invoicesRes.json();
        setInvoices(data);
      }

      if (expensesRes.ok) {
        const data = await expensesRes.json();
        setExpenses(data);
      }

      if (vendorsRes.ok) {
        setVendors(await vendorsRes.json());
      }
      if (purchasesRes.ok) {
        setPurchases(await purchasesRes.json());
      }
      if (categoriesRes.ok) {
        setExpenseCategories(await categoriesRes.json());
      }
      if (clientsRes.ok) {
        setClients(await clientsRes.json());
      }

      const settingsRes = await fetch('/api/business-settings', { headers: getAuthHeaders() });
      if (settingsRes.ok) {
        const settings = await settingsRes.json();
        setBusinessSettings(settings);
        const currentInvoiceValues = invoiceForm.getValues();
        if (!currentInvoiceValues.termsAndConditions && !editingInvoice) {
          invoiceForm.reset({
            ...currentInvoiceValues,
            termsAndConditions: settings.termsAndConditions || '',
            notes: settings.notes || '',
            paymentTerms: settings.paymentTerms || '',
          });
        }
      }
    } catch {
      toast.error('Failed to load finance data');
    } finally {
      setLoading(false);
    }
  };

  const handleAddVendor = async (values: FinanceVendorFormValues) => {
    try {
      const res = await fetch('/api/vendors', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(values)
      });
      if (res.ok) {
        setIsAddVendorOpen(false);
        vendorForm.reset({ name: '', contactPerson: '', email: '', phone: '' });
        fetchFinanceData();
        toast.success('Vendor added successfully');
      } else {
        const error = await res.json();
        toast.error(error.error || 'Failed to add vendor');
      }
    } catch {
      toast.error('An error occurred while adding vendor');
    }
  };

  const handleAddPurchase = async (values: FinancePurchaseFormValues) => {
    try {
      const res = await fetch('/api/purchases', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(values)
      });
      if (res.ok) {
        setIsAddPurchaseOpen(false);
        purchaseForm.reset({ vendorId: '', date: '', amount: '', description: '' });
        fetchFinanceData();
        toast.success('Purchase added successfully');
      } else {
        const error = await res.json();
        toast.error(error.error || 'Failed to add purchase');
      }
    } catch {
      toast.error('An error occurred while adding purchase');
    }
  };

  const handleAddExpense = async () => {
    const validation = financeExpenseSchema.safeParse(newExpense);
    if (!validation.success) {
      toast.error(validation.error.issues[0]?.message || 'Please fix the expense form');
      return;
    }
    try {
      let uploadedUrl = null;
      if (receiptFile) {
        const formData = new FormData();
        formData.append('file', receiptFile);

        try {
          const uploadRes = await fetch('/api/upload', {
            method: 'POST',
            body: formData
          });
          if (uploadRes.ok) {
            const data = await uploadRes.json();
            uploadedUrl = data.url;
          } else {
            toast.error('Failed to upload receipt, but continuing with expense creation.');
          }
        } catch {
          toast.error('Error uploading receipt.');
        }
      }

      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ ...newExpense, receiptUrl: uploadedUrl })
      });
      if (res.ok) {
        setNewExpense({ category: '', description: '', amount: '', date: new Date().toISOString().split('T')[0] });
        setReceiptFile(null);
        fetchFinanceData();
        toast.success('Expense added successfully');
      } else {
        const error = await res.json();
        toast.error(error.error || 'Failed to add expense');
      }
    } catch {
      toast.error('An error occurred while adding expense');
    }
  };

  const handleCreateInvoice = async (values: FinanceInvoiceFormValues) => {
    try {
      const totalAmount = parseInt(values.amount, 10) + parseInt(values.tax, 10);
      const url = editingInvoice ? `/api/invoices?id=${editingInvoice.id}` : '/api/invoices';
      const method = editingInvoice ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: getAuthHeaders(),
        body: JSON.stringify({ ...values, totalAmount })
      });

      if (res.ok) {
        setIsInvoiceDialogOpen(false);
        setEditingInvoice(null);
        invoiceForm.reset({
          clientId: '',
          invoiceNumber: '',
          amount: '',
          tax: '0',
          dueDate: '',
          termsAndConditions: businessSettings.termsAndConditions || '',
          notes: businessSettings.notes || '',
          paymentTerms: businessSettings.paymentTerms || ''
        });
        fetchFinanceData();
        toast.success(editingInvoice ? 'Invoice updated successfully' : 'Invoice created successfully');
      } else {
        const error = await res.json();
        toast.error(error.error || 'Failed to save invoice');
      }
    } catch {
      toast.error('An error occurred while saving invoice');
    }
  };

  const handleEditInvoice = (invoice: Invoice) => {
    setEditingInvoice(invoice);
    invoiceForm.reset({
      clientId: invoice.clientId.toString(),
      invoiceNumber: invoice.invoiceNumber,
      amount: invoice.totalAmount.toString(),
      tax: '0',
      dueDate: invoice.dueDate,
      termsAndConditions: businessSettings.termsAndConditions || '',
      notes: businessSettings.notes || '',
      paymentTerms: businessSettings.paymentTerms || ''
    });
    setIsInvoiceDialogOpen(true);
  };

  const handleUpdateVendor = async () => {
    if (!editingVendor) return;
    try {
      const res = await fetch(`/api/vendors?id=${editingVendor.id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(editingVendor)
      });
      if (res.ok) {
        setIsEditVendorOpen(false);
        setEditingVendor(null);
        fetchFinanceData();
      }
    } catch {
      toast.error('An error occurred while updating vendor');
    }
  };

  const handleUpdatePurchase = async () => {
    if (!editingPurchase) return;
    try {
      const res = await fetch(`/api/purchases?id=${editingPurchase.id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(editingPurchase)
      });
      if (res.ok) {
        setIsEditPurchaseOpen(false);
        setEditingPurchase(null);
        fetchFinanceData();
      }
    } catch {
      toast.error('An error occurred while updating purchase');
    }
  };

  const handleAddCategory = async () => {
    setCategoryError('');
    const values = categoryForm.getValues();
    const validation = financeCategorySchema.safeParse(values);
    if (!validation.success) {
      const message = validation.error.issues[0]?.message || 'Please fix the category form';
      setCategoryError(message);
      categoryForm.setError('name', { message });
      return;
    }
    try {
      const res = await fetch('/api/expense-categories', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(values)
      });
      if (res.ok) {
        setIsAddCategoryOpen(false);
        categoryForm.reset({ name: '', description: '' });
        fetchFinanceData();
        toast.success('Category added successfully');
      } else {
        const errorData = await res.json();
        setCategoryError(errorData.error || 'Failed to add category');
      }
    } catch {
      setCategoryError('An unexpected error occurred');
    }
  };

  const handleUpdateCategory = async () => {
    if (!editingCategory) return;
    try {
      const res = await fetch(`/api/expense-categories?id=${editingCategory.id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(editingCategory)
      });
      if (res.ok) {
        setIsEditCategoryOpen(false);
        setEditingCategory(null);
        fetchFinanceData();
      }
    } catch {
      toast.error('An error occurred while updating category');
    }
  };

  const handleDeleteCategory = async (id: number) => {
    if (!confirm('Are you sure you want to delete this category?')) return;
    const response = await fetch(`/api/expense-categories?id=${id}`, { method: 'DELETE', headers: getAuthHeaders() });
    if (response.ok) {
      toast.success('Category deleted successfully');
      fetchFinanceData();
      return;
    }
    toast.error('Failed to delete category');
  };



  const handleDeleteVendor = async (id: number) => {
    if (!confirm('Are you sure you want to delete this vendor?')) return;
    const response = await fetch(`/api/vendors?id=${id}`, { method: 'DELETE', headers: getAuthHeaders() });
    if (response.ok) {
      toast.success('Vendor deleted successfully');
      fetchFinanceData();
      return;
    }
    toast.error('Failed to delete vendor');
  };

  const handleDeletePurchase = async (id: number) => {
    if (!confirm('Are you sure you want to delete this purchase?')) return;
    const response = await fetch(`/api/purchases?id=${id}`, { method: 'DELETE', headers: getAuthHeaders() });
    if (response.ok) {
      toast.success('Purchase deleted successfully');
      fetchFinanceData();
      return;
    }
    toast.error('Failed to delete purchase');
  };

  const handleDeleteExpense = async (id: number) => {
    if (!confirm('Are you sure?')) return;
    const response = await fetch(`/api/expenses?id=${id}`, { method: 'DELETE', headers: getAuthHeaders() });
    if (response.ok) {
      toast.success('Expense deleted successfully');
      fetchFinanceData();
      return;
    }
    toast.error('Failed to delete expense');
  }

  const handleUpdateExpenseStatus = async (id: number, status: 'approved' | 'rejected') => {
    try {
      const res = await fetch(`/api/expenses?id=${id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        fetchFinanceData();
      }
    } catch {
      toast.error('An error occurred while updating expense status');
    }
  };

  const handleUpdateInvoiceStatus = async (id: number, status: string) => {
    try {
      const res = await fetch(`/api/invoices?id=${id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        fetchFinanceData();
      }
    } catch {
      toast.error('An error occurred while updating invoice status');
    }
  };

  const handleExportReport = (monthKey: string) => {
    const monthInvoices = invoices.filter(i => {
      if (i.status !== 'paid' || !i.paidDate) return false;
      return new Date(i.paidDate).toLocaleString('default', { month: 'long', year: 'numeric' }) === monthKey;
    });

    const csvRows = [
      ['Invoice #', 'Client', 'Amount', 'Tax', 'Total', 'Paid Date'],
      ...monthInvoices.map(i => [
        i.invoiceNumber,
        clients.find(c => c.id === i.clientId)?.companyName || i.clientId,
        i.amount,
        i.tax,
        i.totalAmount,
        new Date(i.paidDate!).toLocaleDateString()
      ])
    ];

    generateCsvDownload(csvRows, `Income_Report_${monthKey.replace(' ', '_')}.csv`);
  };

  const handleExportYearReport = (year: string) => {
    const yearInvoices = invoices.filter(i => {
      if (i.status !== 'paid' || !i.paidDate) return false;
      return new Date(i.paidDate).getFullYear().toString() === year;
    });

    const csvRows = [
      ['Invoice #', 'Client', 'Amount', 'Tax', 'Total', 'Paid Date'],
      ...yearInvoices.map(i => [
        i.invoiceNumber,
        clients.find(c => c.id === i.clientId)?.companyName || i.clientId,
        i.amount,
        i.tax,
        i.totalAmount,
        new Date(i.paidDate!).toLocaleDateString()
      ])
    ];

    generateCsvDownload(csvRows, `Income_Report_${year}.csv`);
  };

  const generateCsvDownload = (rows: (string | number)[][], filename: string) => {
    const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrintInvoice = (invoice: Invoice) => {
    const client = clients.find(c => c.id === invoice.clientId);
    const invoiceDate = new Date(invoice.createdAt || new Date().toISOString()).toLocaleDateString();
    const dueDate = new Date(invoice.dueDate).toLocaleDateString();

    // Calculate values
    // Note: In a real app we might want to store subtotal/tax separately or recalculate
    // based on items. For now we use the stored flat values.
    const subtotal = invoice.amount;
    const tax = invoice.tax;
    const total = invoice.totalAmount;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Invoice #${invoice.invoiceNumber}</title>
          <style>
            body { font-family: 'Inter', sans-serif; padding: 40px; color: #333; }
            .header { display: flex; justify-content: space-between; margin-bottom: 40px; }
            .company-details h1 { font-size: 24px; font-weight: bold; margin: 0 0 10px 0; color: #111; }
            .company-details p { margin: 2px 0; font-size: 14px; color: #666; }
            .invoice-title { text-align: right; }
            .invoice-title h2 { font-size: 32px; color: #111; margin: 0 0 10px 0; text-transform: uppercase; letter-spacing: 1px; }
            .meta-table { border-collapse: collapse; margin-left: auto; }
            .meta-table td { padding: 5px 10px; border-bottom: 1px solid #eee; }
            .meta-label { font-weight: 600; color: #666; }
            .bill-to { margin-bottom: 40px; }
            .bill-to h3 { font-size: 14px; text-transform: uppercase; color: #999; margin-bottom: 10px; font-weight: 600; }
            .client-name { font-size: 18px; font-weight: bold; margin-bottom: 5px; }
            .items-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
            .items-table th { text-align: left; padding: 12px 10px; background: #f8f9fa; font-weight: 600; font-size: 14px; border-bottom: 2px solid #eee; }
            .items-table td { padding: 12px 10px; border-bottom: 1px solid #eee; }
            .text-right { text-align: right; }
            .totals { width: 300px; margin-left: auto; margin-bottom: 40px; }
            .totals-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
            .totals-row.final { border-bottom: none; border-top: 2px solid #000; margin-top: 10px; padding-top: 15px; font-weight: bold; font-size: 18px; }
            .notes { margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 14px; }
            .terms { margin-top: 20px; font-size: 12px; color: #999; }
            @media print {
              body { padding: 0; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="company-details">
              <img src="${window.location.origin}/logo.png" alt="Logo" style="width: 150px; height: auto; margin-bottom: 20px;" />
              <h1>${businessSettings.businessName || 'My Company'}</h1>
              <p>${businessSettings.address || ''}</p>
              <p>${businessSettings.email || ''}</p>
              <p>${businessSettings.phone || ''}</p>
              ${businessSettings.gstNo ? `<p>GST: ${businessSettings.gstNo}</p>` : ''}
              ${businessSettings.pan ? `<p>PAN: ${businessSettings.pan}</p>` : ''}
            </div>
            <div class="invoice-title">
              <h2>INVOICE</h2>
              <table class="meta-table">
                <tr><td class="meta-label">Invoice #:</td><td>${invoice.invoiceNumber}</td></tr>
                <tr><td class="meta-label">Date:</td><td>${invoiceDate}</td></tr>
                <tr><td class="meta-label">Due Date:</td><td>${dueDate}</td></tr>
              </table>
            </div>
          </div>

          <div class="bill-to">
             <h3>Bill To:</h3>
             <div class="client-name">${client?.companyName || 'Valued Client'}</div>
             <p>${client?.address || ''}</p>
             <p>${client?.email || ''}</p>
          </div>

          <table class="items-table">
            <thead>
              <tr>
                <th>Description</th>
                <th class="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Professional Services / Invoice Amount</td>
                <td class="text-right">₹${(subtotal).toFixed(2)}</td>
              </tr>
            </tbody>
          </table>

          <div class="totals">
            <div class="totals-row">
              <span>Subtotal:</span>
              <span>₹${(subtotal).toFixed(2)}</span>
            </div>
            <div class="totals-row">
              <span>Tax:</span>
              <span>₹${(tax).toFixed(2)}</span>
            </div>
            <div class="totals-row final">
              <span>Total:</span>
              <span>₹${(total).toFixed(2)}</span>
            </div>
          </div>

          <div class="notes">
            <strong>Notes:</strong><br>
            ${invoice.notes || businessSettings.notes || 'Thank you for your business!'}
          </div>

          <div class="terms">
            <strong>Terms & Conditions:</strong><br>
            ${invoice.termsAndConditions || businessSettings.termsAndConditions || 'Payment due on receipt.'}
          </div>
          
          <div class="terms" style="margin-top: 10px;">
             ${businessSettings.paymentTerms ? `<strong>Payment Terms:</strong> ${businessSettings.paymentTerms}` : ''}
          </div>

          <script>
            window.onload = function() { window.print(); }
          </script>
        </body>
        </html>
      `);
      printWindow.document.close();
    }
  };

  const handleDeleteInvoice = async (id: number) => {
    if (!confirm('Are you sure?')) return;
    const response = await fetch(`/api/invoices?id=${id}`, { method: 'DELETE', headers: getAuthHeaders() });
    if (response.ok) {
      toast.success('Invoice deleted successfully');
      fetchFinanceData();
      return;
    }
    toast.error('Failed to delete invoice');
  }

  const totalRevenue = invoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
  const totalPaid = invoices.filter(inv => inv.status === 'paid').reduce((sum, inv) => sum + inv.totalAmount, 0);
  const pendingPayments = invoices.filter(inv => inv.status === 'sent').reduce((sum, inv) => sum + inv.totalAmount, 0);
  const overduePayments = invoices.filter(inv => inv.status === 'overdue').reduce((sum, inv) => sum + inv.totalAmount, 0);
  const totalExpenses = expenses.filter(exp => exp.status === 'approved').reduce((sum, exp) => sum + exp.amount, 0);
  const netProfit = totalPaid - totalExpenses;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Business Module - Finance</h2>
          <p className="text-muted-foreground">
            Purchase Management, Expenses, Invoicing & Income Tracking
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-green-600" />
              Total Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹{(totalRevenue / 1000).toFixed(1)}K</div>
            <p className="text-xs text-muted-foreground">All invoices</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              Paid
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">₹{(totalPaid / 1000).toFixed(1)}K</div>
            <p className="text-xs text-muted-foreground">Received payments</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-red-600" />
              Expenses
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">₹{(totalExpenses / 1000).toFixed(1)}K</div>
            <p className="text-xs text-muted-foreground">Total spent</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Net Profit
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              ₹{(netProfit / 1000).toFixed(1)}K
            </div>
            <p className="text-xs text-muted-foreground">Revenue - Expenses</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs defaultValue="purchase" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="purchase">Purchase Management</TabsTrigger>
          <TabsTrigger value="expenses">Business Expenses</TabsTrigger>
          <TabsTrigger value="invoices">Invoice Generation</TabsTrigger>
          <TabsTrigger value="income">Income Tracking</TabsTrigger>
        </TabsList>

        {/* PURCHASE MANAGEMENT */}
        <TabsContent value="purchase" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Vendors
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{vendors.length}</div>
                <p className="text-xs text-muted-foreground">Active vendors</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <ShoppingCart className="h-4 w-4" />
                  Purchases
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{purchases.length}</div>
                <p className="text-xs text-muted-foreground">Total entries</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Receipt className="h-4 w-4" />
                  Pending Bills
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">
                  {purchases.filter(p => p.status === 'pending').length}
                </div>
                <p className="text-xs text-muted-foreground">Awaiting payment</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <CreditCard className="h-4 w-4" />
                  Paid This Month
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  ₹{(purchases.filter(p => p.status === 'paid').reduce((sum, p) => sum + p.amount, 0) / 1000).toFixed(1)}K
                </div>
                <p className="text-xs text-muted-foreground">Payment tracking</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Vendor List */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Vendor List</CardTitle>
                  <Dialog open={isAddVendorOpen} onOpenChange={setIsAddVendorOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm" onClick={() => vendorForm.reset({ name: '', contactPerson: '', email: '', phone: '' })}>
                        <Plus className="mr-2 h-4 w-4" />
                        Add Vendor
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add New Vendor</DialogTitle>
                        <DialogDescription>Enter vendor details below.</DialogDescription>
                      </DialogHeader>
                      <Form {...vendorForm}>
                      <div className="grid gap-4 py-4">
                        <FormField control={vendorForm.control} name="name" render={({ field }) => (
                        <FormItem className="grid grid-cols-4 items-center gap-4">
                          <Label htmlFor="v-name" className="text-right">Name</Label>
                          <FormControl><Input id="v-name" {...field} className="col-span-3" /></FormControl>
                          <FormMessage className="col-span-4 text-right text-xs" />
                        </FormItem>
                        )} />
                        <FormField control={vendorForm.control} name="contactPerson" render={({ field }) => (
                        <FormItem className="grid grid-cols-4 items-center gap-4">
                          <Label htmlFor="v-contact" className="text-right">Contact</Label>
                          <FormControl><Input id="v-contact" {...field} className="col-span-3" /></FormControl>
                          <FormMessage className="col-span-4 text-right text-xs" />
                        </FormItem>
                        )} />
                        <FormField control={vendorForm.control} name="email" render={({ field }) => (
                        <FormItem className="grid grid-cols-4 items-center gap-4">
                          <Label htmlFor="v-email" className="text-right">Email</Label>
                          <FormControl><Input id="v-email" {...field} className="col-span-3" /></FormControl>
                          <FormMessage className="col-span-4 text-right text-xs" />
                        </FormItem>
                        )} />
                        <FormField control={vendorForm.control} name="phone" render={({ field }) => (
                        <FormItem className="grid grid-cols-4 items-center gap-4">
                          <Label htmlFor="v-phone" className="text-right">Phone</Label>
                          <FormControl><Input id="v-phone" {...field} className="col-span-3" /></FormControl>
                          <FormMessage className="col-span-4 text-right text-xs" />
                        </FormItem>
                        )} />
                      </div>
                      <DialogFooter>
                        <Button onClick={() => void vendorForm.handleSubmit(handleAddVendor, () => toast.error('Please fix the vendor form'))()}>Save Vendor</Button>
                      </DialogFooter>
                      </Form>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                <div className="max-h-[400px] overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background z-10">
                      <TableRow>
                        <TableHead>Vendor Name</TableHead>
                        <TableHead>Contact</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {vendors.length === 0 ? (
                        <TableRow><TableCell colSpan={4} className="text-center">No vendors found</TableCell></TableRow>
                      ) : (
                        vendors.slice(vendorPage * pageSize, (vendorPage + 1) * pageSize).map((vendor) => (
                          <TableRow key={vendor.id}>
                            <TableCell className="font-medium">{vendor.name}</TableCell>
                            <TableCell>{vendor.email || vendor.phone}</TableCell>
                            <TableCell><Badge variant="default">{vendor.status}</Badge></TableCell>
                            <TableCell>
                              <Button variant="ghost" size="sm" onClick={() => {
                                setEditingVendor(vendor);
                                setIsEditVendorOpen(true);
                              }}><Pencil className="h-4 w-4 mr-2" /></Button>
                              <Button variant="ghost" size="sm" onClick={() => handleDeleteVendor(vendor.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
                <div className="flex items-center justify-end space-x-2 py-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setVendorPage(Math.max(0, vendorPage - 1))}
                    disabled={vendorPage === 0}
                  >
                    Previous
                  </Button>
                  <div className="text-sm font-medium">
                    Page {vendorPage + 1} of {Math.ceil(vendors.length / pageSize) || 1}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setVendorPage(Math.min(Math.ceil(vendors.length / pageSize) - 1, vendorPage + 1))}
                    disabled={vendorPage >= Math.ceil(vendors.length / pageSize) - 1}
                  >
                    Next
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Purchase Entries */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Recent Purchase Entries</CardTitle>
                  <Dialog open={isAddPurchaseOpen} onOpenChange={setIsAddPurchaseOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm" onClick={() => purchaseForm.reset({ vendorId: '', date: '', amount: '', description: '' })}>
                        <Plus className="mr-2 h-4 w-4" />
                        New Purchase
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>New Purchase</DialogTitle>
                      </DialogHeader>
                      <Form {...purchaseForm}>
                      <div className="grid gap-4 py-4">
                        <FormField control={purchaseForm.control} name="vendorId" render={({ field }) => (
                        <FormItem className="grid grid-cols-4 items-center gap-4">
                          <Label className="text-right">Vendor</Label>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                            <SelectTrigger className="col-span-3">
                              <SelectValue placeholder="Select Vendor" />
                            </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {vendors.map(v => (
                                <SelectItem key={v.id} value={v.id.toString()}>{v.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage className="col-span-4 text-right text-xs" />
                        </FormItem>
                        )} />
                        <FormField control={purchaseForm.control} name="amount" render={({ field }) => (
                        <FormItem className="grid grid-cols-4 items-center gap-4">
                          <Label className="text-right">Amount</Label>
                          <FormControl><Input type="number" {...field} className="col-span-3" /></FormControl>
                          <FormMessage className="col-span-4 text-right text-xs" />
                        </FormItem>
                        )} />
                        <FormField control={purchaseForm.control} name="date" render={({ field }) => (
                        <FormItem className="grid grid-cols-4 items-center gap-4">
                          <Label className="text-right">Date</Label>
                          <FormControl><Input type="date" {...field} className="col-span-3" /></FormControl>
                          <FormMessage className="col-span-4 text-right text-xs" />
                        </FormItem>
                        )} />
                        <FormField control={purchaseForm.control} name="description" render={({ field }) => (
                        <FormItem className="grid grid-cols-4 items-center gap-4">
                          <Label className="text-right">Desc</Label>
                          <FormControl><Input {...field} className="col-span-3" /></FormControl>
                          <FormMessage className="col-span-4 text-right text-xs" />
                        </FormItem>
                        )} />
                      </div>
                      <DialogFooter>
                        <Button onClick={() => void purchaseForm.handleSubmit(handleAddPurchase, () => toast.error('Please fix the purchase form'))()}>Save Purchase</Button>
                      </DialogFooter>
                      </Form>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                <div className="max-h-[400px] overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background z-10">
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Vendor</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {purchases.length === 0 ? (
                        <TableRow><TableCell colSpan={5} className="text-center">No purchases found</TableCell></TableRow>
                      ) : (
                        purchases.slice(purchasePage * pageSize, (purchasePage + 1) * pageSize).map((purchase) => (
                          <TableRow key={purchase.id}>
                            <TableCell>{purchase.date}</TableCell>
                            <TableCell>{purchase.vendorName || purchase.vendorId}</TableCell>
                            <TableCell>₹{purchase.amount}</TableCell>
                            <TableCell><Badge variant="outline">{purchase.status}</Badge></TableCell>
                            <TableCell>
                              <Button variant="ghost" size="sm" onClick={() => {
                                setEditingPurchase(purchase);
                                setIsEditPurchaseOpen(true);
                              }}><Pencil className="h-4 w-4 mr-2" /></Button>
                              <Button variant="ghost" size="sm" onClick={() => handleDeletePurchase(purchase.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
                <div className="flex items-center justify-end space-x-2 py-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPurchasePage(Math.max(0, purchasePage - 1))}
                    disabled={purchasePage === 0}
                  >
                    Previous
                  </Button>
                  <div className="text-sm font-medium">
                    Page {purchasePage + 1} of {Math.ceil(purchases.length / pageSize) || 1}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPurchasePage(Math.min(Math.ceil(purchases.length / pageSize) - 1, purchasePage + 1))}
                    disabled={purchasePage >= Math.ceil(purchases.length / pageSize) - 1}
                  >
                    Next
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

        </TabsContent >

        {/* Edit Vendor Dialog */}
        <Dialog open={isEditVendorOpen} onOpenChange={setIsEditVendorOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Vendor</DialogTitle>
            </DialogHeader>
            {editingVendor && (
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right">Name</Label>
                  <Input value={editingVendor.name} onChange={(e) => setEditingVendor({ ...editingVendor, name: e.target.value })} className="col-span-3" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right">Contact</Label>
                  <Input value={editingVendor.contactPerson || ''} onChange={(e) => setEditingVendor({ ...editingVendor, contactPerson: e.target.value })} className="col-span-3" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right">Email</Label>
                  <Input value={editingVendor.email || ''} onChange={(e) => setEditingVendor({ ...editingVendor, email: e.target.value })} className="col-span-3" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right">Phone</Label>
                  <Input value={editingVendor.phone || ''} onChange={(e) => setEditingVendor({ ...editingVendor, phone: e.target.value })} className="col-span-3" />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button onClick={handleUpdateVendor}>Update Vendor</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Purchase Dialog */}
        <Dialog open={isEditPurchaseOpen} onOpenChange={setIsEditPurchaseOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Purchase</DialogTitle>
            </DialogHeader>
            {editingPurchase && (
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right">Amount</Label>
                  <Input type="number" value={editingPurchase.amount} onChange={(e) => setEditingPurchase({ ...editingPurchase, amount: parseInt(e.target.value) || 0 })} className="col-span-3" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right">Date</Label>
                  <Input type="date" value={editingPurchase.date} onChange={(e) => setEditingPurchase({ ...editingPurchase, date: e.target.value })} className="col-span-3" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right">Description</Label>
                  <Input value={editingPurchase.description || ''} onChange={(e) => setEditingPurchase({ ...editingPurchase, description: e.target.value })} className="col-span-3" />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button onClick={handleUpdatePurchase}>Update Purchase</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* BUSINESS EXPENSES */}
        <TabsContent value="expenses" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Total Expenses</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">₹{(totalExpenses / 1000).toFixed(1)}K</div>
                <p className="text-xs text-muted-foreground">This month</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Pending Approval</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">
                  {expenses.filter(e => e.status === 'pending').length}
                </div>
                <p className="text-xs text-muted-foreground">Awaiting review</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Approved</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {expenses.filter(e => e.status === 'approved').length}
                </div>
                <p className="text-xs text-muted-foreground">This month</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Categories</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {new Set(expenses.map(e => e.category)).size}
                </div>
                <p className="text-xs text-muted-foreground">Active categories</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Expense Categories */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Expense Categories</CardTitle>
                  <Button size="sm" onClick={() => setIsAddCategoryOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Category
                  </Button>
                  <Dialog open={isAddCategoryOpen} onOpenChange={setIsAddCategoryOpen}>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add Expense Category</DialogTitle>
                      </DialogHeader>
                      <Form {...categoryForm}>
                      <div className="grid gap-4 py-4">
                        <FormField control={categoryForm.control} name="name" render={({ field }) => (
                        <FormItem className="grid grid-cols-4 items-center gap-4">
                          <Label className="text-right">Name</Label>
                          <FormControl><Input {...field} onChange={(e) => { field.onChange(e); setCategoryError(''); }} className="col-span-3" /></FormControl>
                          <FormMessage className="col-span-4 text-right text-xs" />
                        </FormItem>
                        )} />
                        <FormField control={categoryForm.control} name="description" render={({ field }) => (
                        <FormItem className="grid grid-cols-4 items-center gap-4">
                          <Label className="text-right">Desc</Label>
                          <FormControl><Input {...field} className="col-span-3" /></FormControl>
                          <FormMessage className="col-span-4 text-right text-xs" />
                        </FormItem>
                        )} />
                        {categoryError && (
                          <div className="grid grid-cols-4 items-center gap-4">
                            <div className="col-span-4 text-center text-sm text-red-500">
                              {categoryError}
                            </div>
                          </div>
                        )}
                      </div>
                      <DialogFooter>
                        <Button onClick={handleAddCategory}>Save Category</Button>
                      </DialogFooter>
                      </Form>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                <div className="max-h-[400px] overflow-y-auto space-y-3">
                  {expenseCategories.length === 0 ? (
                    <p className="text-center py-4 text-muted-foreground">No categories found.</p>
                  ) : (
                    expenseCategories.slice(categoryPage * pageSize, (categoryPage + 1) * pageSize).map((category, index) => {
                      const categoryTotal = expenses
                        .filter(e => e.category === category.name && e.status === 'approved')
                        .reduce((sum, e) => sum + e.amount, 0);
                      return (
                        <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                          <div>
                            <p className="font-medium">{category.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {expenses.filter(e => e.category === category.name).length} expenses
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="text-right mr-2">
                              <p className="font-bold">₹{(categoryTotal / 1000).toFixed(1)}K</p>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => {
                              setEditingCategory(category);
                              setIsEditCategoryOpen(true);
                            }}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleDeleteCategory(category.id)}>
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
                <div className="flex items-center justify-end space-x-2 py-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCategoryPage(Math.max(0, categoryPage - 1))}
                    disabled={categoryPage === 0}
                  >
                    Previous
                  </Button>
                  <div className="text-sm font-medium">
                    Page {categoryPage + 1} of {Math.ceil(expenseCategories.length / pageSize) || 1}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCategoryPage(Math.min(Math.ceil(expenseCategories.length / pageSize) - 1, categoryPage + 1))}
                    disabled={categoryPage >= Math.ceil(expenseCategories.length / pageSize) - 1}
                  >
                    Next
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Dialog open={isEditCategoryOpen} onOpenChange={setIsEditCategoryOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Edit Expense Category</DialogTitle>
                </DialogHeader>
                {editingCategory && (
                  <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label className="text-right">Name</Label>
                      <Input value={editingCategory.name} onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value })} className="col-span-3" />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label className="text-right">Desc</Label>
                      <Input value={editingCategory.description || ''} onChange={(e) => setEditingCategory({ ...editingCategory, description: e.target.value })} className="col-span-3" />
                    </div>
                  </div>
                )}
                <DialogFooter>
                  <Button onClick={handleUpdateCategory}>Update Category</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Add Expense Form */}
            <Card>
              <CardHeader>
                <CardTitle>Add New Expense</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select value={newExpense.category} onValueChange={(v) => setNewExpense({ ...newExpense, category: v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {expenseCategories.map(c => (
                          <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Input placeholder="Enter expense description" value={newExpense.description} onChange={(e) => setNewExpense({ ...newExpense, description: e.target.value })} />
                  </div>

                  <div className="space-y-2">
                    <Label>Amount (₹)</Label>
                    <Input type="number" placeholder="0.00" value={newExpense.amount} onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })} />
                  </div>

                  <div className="space-y-2">
                    <Label>Upload Bill/Receipt</Label>
                    <Input type="file" onChange={(e) => setReceiptFile(e.target.files?.[0] || null)} />
                    {receiptFile && <p className="text-xs text-muted-foreground">Selected: {receiptFile.name}</p>}
                  </div>

                  <Button className="w-full" onClick={handleAddExpense}>
                    <Plus className="mr-2 h-4 w-4" />
                    Submit for Approval
                  </Button>
                </div>
              </CardContent>
            </Card>
            {/* Approval System */}
            < Card className="lg:col-span-2" >
              <CardHeader>
                <CardTitle>Expense Approval System</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <InlineTableSkeleton rows={4} columns={5} />
                ) : expenses.length === 0 ? (
                  <div className="text-center py-8">
                    <Receipt className="mx-auto h-12 w-12 text-muted-foreground" />
                    <p className="mt-4 text-sm text-muted-foreground">No expenses recorded</p>
                  </div>
                ) : (
                  <>
                    <div className="max-h-[400px] overflow-y-auto">
                      <Table>
                        <TableHeader className="sticky top-0 bg-background z-10">
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Category</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead>Amount</TableHead>
                            <TableHead>Receipt</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {expenses.slice(expensePage * pageSize, (expensePage + 1) * pageSize).map((expense) => (
                            <TableRow key={expense.id}>
                              <TableCell>{new Date(expense.date).toLocaleDateString()}</TableCell>
                              <TableCell className="font-medium">{expense.category}</TableCell>
                              <TableCell>{expense.description}</TableCell>
                              <TableCell>₹{(expense.amount / 1000).toFixed(2)}K</TableCell>
                              <TableCell>
                                <Button variant="ghost" size="sm">
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </TableCell>
                              <TableCell>
                                <Badge variant={
                                  expense.status === 'approved' ? 'default' :
                                    expense.status === 'rejected' ? 'destructive' :
                                      'secondary'
                                }>
                                  {expense.status}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {expense.status === 'pending' && (
                                  <div className="flex gap-1">
                                    <Button variant="outline" size="sm" onClick={() => handleUpdateExpenseStatus(expense.id, 'approved')}>
                                      <CheckCircle className="h-4 w-4 text-green-600" />
                                    </Button>
                                    <Button variant="outline" size="sm" onClick={() => handleUpdateExpenseStatus(expense.id, 'rejected')}>
                                      <AlertCircle className="h-4 w-4 text-red-600" />
                                    </Button>
                                  </div>
                                )}
                                <Button variant="ghost" size="sm" onClick={() => handleDeleteExpense(expense.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    <div className="flex items-center justify-end space-x-2 py-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setExpensePage(Math.max(0, expensePage - 1))}
                        disabled={expensePage === 0}
                      >
                        Previous
                      </Button>
                      <div className="text-sm font-medium">
                        Page {expensePage + 1} of {Math.ceil(expenses.length / pageSize) || 1}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setExpensePage(Math.min(Math.ceil(expenses.length / pageSize) - 1, expensePage + 1))}
                        disabled={expensePage >= Math.ceil(expenses.length / pageSize) - 1}
                      >
                        Next
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card >
          </div >
        </TabsContent >

        {/* INVOICE GENERATION */}
        <TabsContent value="invoices" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-2xl font-bold tracking-tight">Invoices</h3>
              <p className="text-muted-foreground">Manage and track your invoices</p>
            </div>
            <Dialog open={isInvoiceDialogOpen} onOpenChange={setIsInvoiceDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => {
                  setEditingInvoice(null);
                  invoiceForm.reset({
                    clientId: '',
                    invoiceNumber: '',
                    amount: '',
                    tax: '0',
                    dueDate: '',
                    termsAndConditions: businessSettings.termsAndConditions || '',
                    notes: businessSettings.notes || '',
                    paymentTerms: businessSettings.paymentTerms || ''
                  });
                }}>
                  <Plus className="mr-2 h-4 w-4" />
                  New Invoice
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editingInvoice ? 'Edit Invoice' : 'Create New Invoice'}</DialogTitle>
                  <DialogDescription>Enter invoice details below.</DialogDescription>
                </DialogHeader>
                <Form {...invoiceForm}>
                <div className="space-y-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={invoiceForm.control} name="invoiceNumber" render={({ field }) => (
                    <FormItem className="space-y-2">
                      <Label>Invoice #</Label>
                      <FormControl><Input placeholder="INV-001" {...field} /></FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                    )} />
                    <FormField control={invoiceForm.control} name="clientId" render={({ field }) => (
                    <FormItem className="space-y-2">
                      <Label>Client</Label>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select Client" />
                        </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {clients.map(client => (
                            <SelectItem key={client.id} value={client.id.toString()}>{client.companyName}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage className="text-xs" />
                    </FormItem>
                    )} />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={invoiceForm.control} name="amount" render={({ field }) => (
                    <FormItem className="space-y-2">
                      <Label>Amount (₹)</Label>
                      <FormControl><Input type="number" placeholder="0.00" {...field} /></FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                    )} />
                    <FormField control={invoiceForm.control} name="tax" render={({ field }) => (
                    <FormItem className="space-y-2">
                      <Label>Tax (₹)</Label>
                      <FormControl><Input type="number" placeholder="0" {...field} /></FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                    )} />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={invoiceForm.control} name="dueDate" render={({ field }) => (
                    <FormItem className="space-y-2">
                      <Label>Due Date</Label>
                      <FormControl><Input type="date" {...field} /></FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                    )} />
                    <FormField control={invoiceForm.control} name="paymentTerms" render={({ field }) => (
                    <FormItem className="space-y-2">
                      <Label>Payment Terms</Label>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                    )} />
                  </div>

                  <FormField control={invoiceForm.control} name="termsAndConditions" render={({ field }) => (
                  <FormItem className="space-y-2">
                    <Label>Terms & Conditions</Label>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                  )} />

                  <FormField control={invoiceForm.control} name="notes" render={({ field }) => (
                  <FormItem className="space-y-2">
                    <Label>Notes</Label>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                  )} />

                  <div className="pt-4 border-t">
                    <div className="flex justify-between font-bold text-lg">
                      <span>Total:</span>
                      <span>₹{(parseInt(invoiceForm.watch('amount') || '0', 10) + parseInt(invoiceForm.watch('tax') || '0', 10)).toFixed(2)}</span>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={() => void invoiceForm.handleSubmit(handleCreateInvoice, () => toast.error('Please fix the invoice form'))()}>{editingInvoice ? 'Update Invoice' : 'Create Invoice'}</Button>
                </DialogFooter>
                </Form>
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>All Invoices</CardTitle>
              <CardDescription>
                A list of all invoices generated.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <InlineTableSkeleton rows={5} columns={7} />
              ) : invoices.length === 0 ? (
                <div className="text-center py-8">
                  <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
                  <p className="mt-4 text-sm text-muted-foreground">No invoices yet</p>
                </div>
              ) : (
                <>
                  <div className="max-h-[400px] overflow-y-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-background z-10">
                        <TableRow>
                          <TableHead>Invoice #</TableHead>
                          <TableHead>Client</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Due Date</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {invoices.slice(invoicePage * pageSize, (invoicePage + 1) * pageSize).map((invoice) => (
                          <TableRow key={invoice.id}>
                            <TableCell className="font-medium">{invoice.invoiceNumber}</TableCell>
                            <TableCell>
                              {clients.find(c => c.id === invoice.clientId)?.companyName || invoice.clientId}
                            </TableCell>
                            <TableCell>₹{(invoice.totalAmount / 1000).toFixed(2)}K</TableCell>
                            <TableCell>
                              <Badge variant={
                                invoice.status === 'paid' ? 'default' :
                                  invoice.status === 'sent' ? 'secondary' :
                                    invoice.status === 'overdue' ? 'destructive' :
                                      'outline'
                              }>
                                {invoice.status}
                              </Badge>
                            </TableCell>
                            <TableCell>{new Date(invoice.dueDate).toLocaleDateString()}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1 items-center">
                                <Select
                                  value={invoice.status}
                                  onValueChange={(val) => handleUpdateInvoiceStatus(invoice.id, val)}
                                >
                                  <SelectTrigger className="w-[100px] h-8 mr-2">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="draft">Draft</SelectItem>
                                    <SelectItem value="sent">Sent</SelectItem>
                                    <SelectItem value="paid">Paid</SelectItem>
                                    <SelectItem value="overdue">Overdue</SelectItem>
                                    <SelectItem value="cancelled">Cancelled</SelectItem>
                                  </SelectContent>
                                </Select>
                                <Button variant="ghost" size="sm" onClick={() => handlePrintInvoice(invoice)}>
                                  <Printer className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => handleEditInvoice(invoice)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => handleDeleteInvoice(invoice.id)}>
                                  <Trash2 className="h-4 w-4 text-red-500" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="flex items-center justify-end space-x-2 py-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setInvoicePage(Math.max(0, invoicePage - 1))}
                      disabled={invoicePage === 0}
                    >
                      Previous
                    </Button>
                    <div className="text-sm font-medium">
                      Page {invoicePage + 1} of {Math.ceil(invoices.length / pageSize) || 1}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setInvoicePage(Math.min(Math.ceil(invoices.length / pageSize) - 1, invoicePage + 1))}
                      disabled={invoicePage >= Math.ceil(invoices.length / pageSize) - 1}
                    >
                      Next
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* INCOME TRACKING */}
        < TabsContent value="income" className="space-y-4" >

          {/* Defined Calculated Variables for Render */}
          {(() => {
            const [reportYear, setReportYear] = useState(new Date().getFullYear().toString());
            const [monthSearch, setMonthSearch] = useState('');

            // Pagination states for Income tab
            const [paidInvoicePage, setPaidInvoicePage] = useState(0);
            const [pendingInvoicePage, setPendingInvoicePage] = useState(0);
            const [monthlyReportPage, setMonthlyReportPage] = useState(0);
            const incomePageSize = 5; // Smaller page size for income tab cards

            const totalPaid = invoices.filter(i => i.status === 'paid').reduce((acc, curr) => acc + curr.totalAmount, 0);
            const pendingPayments = invoices.filter(i => i.status === 'sent').reduce((acc, curr) => acc + curr.totalAmount, 0);
            const overduePayments = invoices.filter(i => i.status === 'overdue').reduce((acc, curr) => acc + curr.totalAmount, 0);

            const currentMonth = new Date().getMonth();
            const currentYear = new Date().getFullYear();
            const thisMonthIncome = invoices.filter(i => {
              if (i.status !== 'paid' || !i.paidDate) return false;
              const d = new Date(i.paidDate);
              return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
            }).reduce((acc, curr) => acc + curr.totalAmount, 0);

            const getMonthlyReports = () => {
              const reports: Record<string, { count: number, total: number, date: Date }> = {};
              invoices.filter(i => {
                if (i.status !== 'paid' || !i.paidDate) return false;
                const d = new Date(i.paidDate);
                // Filter by Year
                if (d.getFullYear().toString() !== reportYear) return false;
                return true;
              }).forEach(inv => {
                const d = new Date(inv.paidDate!);
                const key = d.toLocaleString('default', { month: 'long', year: 'numeric' });

                // Filter by Search (Month Name)
                if (monthSearch && !key.toLowerCase().includes(monthSearch.toLowerCase())) return;

                if (!reports[key]) {
                  reports[key] = { count: 0, total: 0, date: d };
                }
                reports[key].count++;
                reports[key].total += inv.totalAmount;
              });
              return Object.entries(reports)
                .map(([month, data]) => ({ month, ...data }))
                .sort((a, b) => b.date.getTime() - a.date.getTime());
            };
            const monthlyReports = getMonthlyReports();

            return (
              <>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                        Paid Invoices
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-green-600">
                        {invoices.filter(i => i.status === 'paid').length}
                      </div>
                      <div className="text-sm font-medium mt-1">₹{(totalPaid / 1000).toFixed(1)}K</div>
                      <p className="text-xs text-muted-foreground">Total received</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Clock className="h-4 w-4 text-blue-600" />
                        Pending Payments
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-blue-600">
                        {invoices.filter(i => i.status === 'sent').length}
                      </div>
                      <div className="text-sm font-medium mt-1">₹{(pendingPayments / 1000).toFixed(1)}K</div>
                      <p className="text-xs text-muted-foreground">Awaiting payment</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 text-red-600" />
                        Overdue Payments
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-red-600">
                        {invoices.filter(i => i.status === 'overdue').length}
                      </div>
                      <div className="text-sm font-medium mt-1">₹{(overduePayments / 1000).toFixed(1)}K</div>
                      <p className="text-xs text-muted-foreground">Action required</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium">This Month</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">₹{(thisMonthIncome / 1000).toFixed(1)}K</div>
                      <p className="text-xs text-muted-foreground">Income received</p>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  {/* Paid Invoices */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Paid Invoices</CardTitle>
                      <CardDescription>Successfully collected payments</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="max-h-[300px] overflow-y-auto">
                        <Table>
                          <TableHeader className="sticky top-0 bg-background z-10">
                            <TableRow>
                              <TableHead>Invoice #</TableHead>
                              <TableHead>Amount</TableHead>
                              <TableHead>Paid Date</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(() => {
                              const paidInvoices = invoices.filter(i => i.status === 'paid').sort((a, b) => new Date(b.paidDate || 0).getTime() - new Date(a.paidDate || 0).getTime());
                              return (
                                <>
                                  {paidInvoices.length === 0 ? (
                                    <TableRow><TableCell colSpan={3} className="text-center">No paid invoices</TableCell></TableRow>
                                  ) : (
                                    paidInvoices.slice(paidInvoicePage * incomePageSize, (paidInvoicePage + 1) * incomePageSize).map((invoice) => (
                                      <TableRow key={invoice.id}>
                                        <TableCell className="font-medium">{invoice.invoiceNumber}</TableCell>
                                        <TableCell className="text-green-600">₹{(invoice.totalAmount / 1000).toFixed(2)}K</TableCell>
                                        <TableCell>{invoice.paidDate ? new Date(invoice.paidDate).toLocaleDateString() : '—'}</TableCell>
                                      </TableRow>
                                    ))
                                  )}
                                </>
                              );
                            })()}
                          </TableBody>
                        </Table>
                      </div>
                      <div className="flex items-center justify-end space-x-2 py-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPaidInvoicePage(Math.max(0, paidInvoicePage - 1))}
                          disabled={paidInvoicePage === 0}
                        >
                          Previous
                        </Button>
                        <div className="text-sm font-medium">
                          Page {paidInvoicePage + 1} of {Math.ceil(invoices.filter(i => i.status === 'paid').length / incomePageSize) || 1}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPaidInvoicePage(Math.min(Math.ceil(invoices.filter(i => i.status === 'paid').length / incomePageSize) - 1, paidInvoicePage + 1))}
                          disabled={paidInvoicePage >= Math.ceil(invoices.filter(i => i.status === 'paid').length / incomePageSize) - 1}
                        >
                          Next
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Pending & Overdue */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Pending & Overdue Payments</CardTitle>
                      <CardDescription>Follow-up required</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="max-h-[300px] overflow-y-auto">
                        <Table>
                          <TableHeader className="sticky top-0 bg-background z-10">
                            <TableRow>
                              <TableHead>Invoice #</TableHead>
                              <TableHead>Amount</TableHead>
                              <TableHead>Due Date</TableHead>
                              <TableHead>Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(() => {
                              const pendingInvoices = invoices.filter(i => i.status === 'sent' || i.status === 'overdue').sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
                              return (
                                <>
                                  {pendingInvoices.length === 0 ? (
                                    <TableRow><TableCell colSpan={4} className="text-center">No pending payments</TableCell></TableRow>
                                  ) : (
                                    pendingInvoices.slice(pendingInvoicePage * incomePageSize, (pendingInvoicePage + 1) * incomePageSize).map((invoice) => (
                                      <TableRow key={invoice.id}>
                                        <TableCell className="font-medium">{invoice.invoiceNumber}</TableCell>
                                        <TableCell>₹{(invoice.totalAmount / 1000).toFixed(2)}K</TableCell>
                                        <TableCell>{new Date(invoice.dueDate).toLocaleDateString()}</TableCell>
                                        <TableCell>
                                          <Badge variant={invoice.status === 'overdue' ? 'destructive' : 'secondary'}>
                                            {invoice.status}
                                          </Badge>
                                        </TableCell>
                                      </TableRow>
                                    ))
                                  )}
                                </>
                              );
                            })()}
                          </TableBody>
                        </Table>
                      </div>
                      <div className="flex items-center justify-end space-x-2 py-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPendingInvoicePage(Math.max(0, pendingInvoicePage - 1))}
                          disabled={pendingInvoicePage === 0}
                        >
                          Previous
                        </Button>
                        <div className="text-sm font-medium">
                          Page {pendingInvoicePage + 1} of {Math.ceil(invoices.filter(i => i.status === 'sent' || i.status === 'overdue').length / incomePageSize) || 1}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPendingInvoicePage(Math.min(Math.ceil(invoices.filter(i => i.status === 'sent' || i.status === 'overdue').length / incomePageSize) - 1, pendingInvoicePage + 1))}
                          disabled={pendingInvoicePage >= Math.ceil(invoices.filter(i => i.status === 'sent' || i.status === 'overdue').length / incomePageSize) - 1}
                        >
                          Next
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Monthly Reports */}
                  <Card className="lg:col-span-2">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle>Monthly Income Reports</CardTitle>
                          <CardDescription>Income breakdown by month</CardDescription>
                        </div>
                        <div className="flex gap-2">
                          <Select value={reportYear} onValueChange={setReportYear}>
                            <SelectTrigger className="w-[100px]">
                              <SelectValue placeholder="Year" />
                            </SelectTrigger>
                            <SelectContent>
                              {Array.from(new Set(invoices.map(i => i.paidDate ? new Date(i.paidDate).getFullYear() : new Date().getFullYear()))).sort((a, b) => b - a).map(year => (
                                <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button variant="outline" size="sm" onClick={() => handleExportYearReport(reportYear)}>
                            <Download className="mr-2 h-4 w-4" />
                            Export Year
                          </Button>
                        </div>
                      </div>
                      <div className="mt-4">
                        <Input
                          placeholder="Search month..."
                          value={monthSearch}
                          onChange={(e) => setMonthSearch(e.target.value)}
                          className="max-w-sm"
                        />
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="max-h-[400px] overflow-y-auto space-y-4">
                        {monthlyReports.length === 0 ? (
                          <p className="text-center py-4 text-muted-foreground">No income history available.</p>
                        ) : (
                          monthlyReports.slice(monthlyReportPage * incomePageSize, (monthlyReportPage + 1) * incomePageSize).map((report) => (
                            <div key={report.month} className="flex items-center justify-between p-4 border rounded-lg">
                              <div>
                                <p className="font-medium">{report.month}</p>
                                <p className="text-sm text-muted-foreground">
                                  {report.count} invoice{report.count !== 1 ? 's' : ''} paid
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-2xl font-bold text-green-600">₹{(report.total / 1000).toFixed(1)}K</p>
                                <p className="text-sm text-muted-foreground">Total income</p>
                              </div>
                              <Button variant="outline" size="sm" onClick={() => handleExportReport(report.month)}>
                                <Download className="mr-2 h-4 w-4" />
                                Export
                              </Button>
                            </div>
                          ))
                        )}
                      </div>
                      <div className="flex items-center justify-end space-x-2 py-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setMonthlyReportPage(Math.max(0, monthlyReportPage - 1))}
                          disabled={monthlyReportPage === 0}
                        >
                          Previous
                        </Button>
                        <div className="text-sm font-medium">
                          Page {monthlyReportPage + 1} of {Math.ceil(monthlyReports.length / incomePageSize) || 1}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setMonthlyReportPage(Math.min(Math.ceil(monthlyReports.length / incomePageSize) - 1, monthlyReportPage + 1))}
                          disabled={monthlyReportPage >= Math.ceil(monthlyReports.length / incomePageSize) - 1}
                        >
                          Next
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </>
            );
          })()}
        </TabsContent >

        {/* BUSINESS SETTINGS */}


      </Tabs >
    </div >
  );
}
