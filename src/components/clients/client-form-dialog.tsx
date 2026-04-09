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
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface ClientFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  client?: any;
}

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
      const url = client ? `/api/clients?id=${client.id}` : '/api/clients';
      const method = client ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
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
        toast.error(error.error || 'Failed to save client');
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
        <DialogHeader>
          <DialogTitle>{client ? 'Edit Client' : 'Add New Client'}</DialogTitle>
          <DialogDescription>
            {client ? 'Update client information' : 'Enter client details to add them to the system'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="companyName"
              render={({ field }) => (
            <FormItem className="space-y-2">
              <Label htmlFor="companyName">Company Name *</Label>
              <FormControl>
              <Input
                id="companyName"
                {...field}
              />
              </FormControl>
              <FormMessage className="text-xs" />
            </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="contactPerson"
              render={({ field }) => (
            <FormItem className="space-y-2">
              <Label htmlFor="contactPerson">Contact Person *</Label>
              <FormControl>
              <Input
                id="contactPerson"
                {...field}
              />
              </FormControl>
              <FormMessage className="text-xs" />
            </FormItem>
              )}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
            <FormItem className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <FormControl>
              <Input
                id="email"
                type="email"
                {...field}
              />
              </FormControl>
              <FormMessage className="text-xs" />
            </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
            <FormItem className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <FormControl>
              <Input
                id="phone"
                type="tel"
                {...field}
              />
              </FormControl>
              <FormMessage className="text-xs" />
            </FormItem>
              )}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="industry"
              render={({ field }) => (
            <FormItem className="space-y-2">
              <Label htmlFor="industry">Industry</Label>
              <FormControl>
              <Input
                id="industry"
                {...field}
              />
              </FormControl>
              <FormMessage className="text-xs" />
            </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
            <FormItem className="space-y-2">
              <Label htmlFor="status">Status *</Label>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {clientStatusOptions.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage className="text-xs" />
            </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="address"
            render={({ field }) => (
          <FormItem className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <FormControl>
            <Input
              id="address"
              {...field}
            />
            </FormControl>
            <FormMessage className="text-xs" />
          </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
          <FormItem className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <FormControl>
            <Textarea
              id="notes"
              {...field}
              rows={3}
            />
            </FormControl>
            <FormMessage className="text-xs" />
          </FormItem>
            )}
          />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
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
