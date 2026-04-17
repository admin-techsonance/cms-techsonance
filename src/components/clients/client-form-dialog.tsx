'use client';

import { useState, useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { clientFormSchema, clientStatusOptions, type ClientFormValues } from '@/lib/forms/schemas';
import { Loader2, Building2, User, Mail, Phone, MapPin, FileText, Tag } from 'lucide-react';
import { toast } from 'sonner';

interface ClientFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  client?: any;
}

const industryOptions = [
  'Technology',
  'Healthcare',
  'Finance & Banking',
  'Education',
  'E-Commerce',
  'Manufacturing',
  'Real Estate',
  'Media & Entertainment',
  'Logistics & Supply Chain',
  'Government',
  'Non-Profit',
  'Consulting',
  'Retail',
  'Hospitality',
  'Other',
] as const;

export function ClientFormDialog({
  open,
  onOpenChange,
  onSuccess,
  client,
}: ClientFormDialogProps) {
  const [loading, setLoading] = useState(false);
  const form = useForm<ClientFormValues>({
    resolver: zodResolver(clientFormSchema),
    defaultValues: {
      companyName: '',
      contactPerson: '',
      email: '',
      phone: '',
      address: '',
      industry: '',
      status: 'active',
      notes: '',
    },
  });

  useEffect(() => {
    if (client) {
      form.reset({
        companyName: client.companyName || '',
        contactPerson: client.contactPerson || '',
        email: client.email || '',
        phone: client.phone || '',
        address: client.address || '',
        industry: client.industry || '',
        status: client.status || 'active',
        notes: client.notes || '',
      });
    } else {
      form.reset({
        companyName: '',
        contactPerson: '',
        email: '',
        phone: '',
        address: '',
        industry: '',
        status: 'active',
        notes: '',
      });
    }
  }, [client, open, form]);

  const handleSubmit = async (values: ClientFormValues) => {
    setLoading(true);

    try {
      const token = localStorage.getItem('session_token');
      const url = client ? `/api/clients?id=${client.id}` : '/api/clients';
      const method = client ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          companyName: values.companyName.trim(),
          contactPerson: values.contactPerson.trim(),
          email: values.email.trim(),
          phone: values.phone?.trim() || null,
          address: values.address?.trim() || null,
          industry: values.industry?.trim() || null,
          status: values.status,
          notes: values.notes?.trim() || null,
        }),
      });

      if (response.ok) {
        onSuccess();
        onOpenChange(false);
        toast.success(client ? 'Client updated successfully' : 'Client added successfully');
      } else {
        const error = await response.json();
        toast.error(error.message || error.error || 'Failed to save client');
      }
    } catch {
      toast.error('An error occurred while saving the client');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pb-4 border-b border-border/40">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <div className="p-2 rounded-lg bg-emerald-500/10">
              <Building2 className="h-5 w-5 text-emerald-600" />
            </div>
            {client ? 'Edit Client' : 'Add New Client'}
          </DialogTitle>
          <DialogDescription>
            {client ? "Update the client's profile details below" : "Fill in the details to onboard a new client into the system"}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6 pt-2">

          {/* Section: Company Identity */}
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Building2 className="h-3.5 w-3.5" /> Company Identity
            </p>
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="companyName"
                render={({ field }) => (
                  <FormItem className="space-y-1.5">
                    <Label htmlFor="companyName" className="text-xs font-medium">Company Name <span className="text-destructive">*</span></Label>
                    <FormControl>
                      <div className="relative">
                        <Building2 className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input id="companyName" placeholder="Acme Corporation" className="pl-9" {...field} />
                      </div>
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="industry"
                render={({ field }) => (
                  <FormItem className="space-y-1.5">
                    <Label htmlFor="industry" className="text-xs font-medium">Industry</Label>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select industry" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {industryOptions.map((ind) => (
                          <SelectItem key={ind} value={ind}>{ind}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />
            </div>
          </div>

          {/* Section: Contact Details */}
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <User className="h-3.5 w-3.5" /> Contact Details
            </p>
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="contactPerson"
                render={({ field }) => (
                  <FormItem className="space-y-1.5">
                    <Label htmlFor="contactPerson" className="text-xs font-medium">Contact Person <span className="text-destructive">*</span></Label>
                    <FormControl>
                      <div className="relative">
                        <User className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input id="contactPerson" placeholder="John Doe" className="pl-9" {...field} />
                      </div>
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem className="space-y-1.5">
                    <Label htmlFor="email" className="text-xs font-medium">Email <span className="text-destructive">*</span></Label>
                    <FormControl>
                      <div className="relative">
                        <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input id="email" type="email" placeholder="contact@acme.com" className="pl-9" {...field} />
                      </div>
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem className="space-y-1.5">
                    <Label htmlFor="phone" className="text-xs font-medium">Phone</Label>
                    <FormControl>
                      <div className="relative">
                        <Phone className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input id="phone" type="tel" placeholder="+91 98765 43210" className="pl-9" {...field} />
                      </div>
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem className="space-y-1.5">
                    <Label htmlFor="status" className="text-xs font-medium">Status <span className="text-destructive">*</span></Label>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {clientStatusOptions.map((status) => (
                          <SelectItem key={status} value={status}>
                            <span className="flex items-center gap-2">
                              <span className={`h-2 w-2 rounded-full ${
                                status === 'active' ? 'bg-emerald-500' :
                                status === 'inactive' ? 'bg-gray-400' :
                                'bg-amber-500'
                              }`} />
                              {status.charAt(0).toUpperCase() + status.slice(1)}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />
            </div>
          </div>

          {/* Section: Location & Notes */}
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5" /> Additional Information
            </p>

            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem className="space-y-1.5">
                  <Label htmlFor="address" className="text-xs font-medium">Address</Label>
                  <FormControl>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input id="address" placeholder="123 Business Street, City, State" className="pl-9" {...field} />
                    </div>
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem className="space-y-1.5">
                  <Label htmlFor="notes" className="text-xs font-medium">Internal Notes</Label>
                  <FormControl>
                    <Textarea
                      id="notes"
                      {...field}
                      rows={3}
                      placeholder="Key information about the client, preferred communication style, etc."
                      className="resize-none"
                    />
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />
          </div>

          <DialogFooter className="pt-4 border-t border-border/40">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="bg-emerald-600 hover:bg-emerald-700 text-white min-w-[140px]">
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                client ? 'Update Client' : 'Add Client'
              )}
            </Button>
          </DialogFooter>
        </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
