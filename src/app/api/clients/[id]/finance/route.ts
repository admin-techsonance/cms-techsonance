import { NextResponse } from 'next/server';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError } from '@/server/http/errors';
import { getAdminRouteSupabase } from '@/server/supabase/route-helpers';

export const GET = withApiHandler(async (request, context) => {
  // Extract id from the pathname (e.g., /api/clients/123/finance)
  const url = new URL(request.url);
  const segments = url.pathname.split('/');
  // Expected structure: /api/clients/[id]/finance
  const idSegment = segments[segments.length - 2];
  const clientId = Number(idSegment);
  
  if (!Number.isInteger(clientId) || clientId <= 0) {
    throw new BadRequestError('Valid client id is required');
  }

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;

  if (!accessToken || !tenantId) {
    throw new BadRequestError('Authorization and tenant info required');
  }
  
  const supabase = getAdminRouteSupabase();

  // Aggregate financial data for this specific client from `invoices`
  // We need Lifetime Value (Paid), Outstanding (Draft/Sent), Overdue (Overdue status)
  
  const { data: invoices, error } = await supabase
    .from('invoices')
    .select('amount, status')
    .eq('client_id', clientId)
    .eq('tenant_id', tenantId);

  if (error) throw new Error(error.message);

  let lifetimeValue = 0;
  let outstandingBalance = 0;
  let overdueBalance = 0;

  if (invoices && invoices.length > 0) {
    invoices.forEach(inv => {
      const amt = Number(inv.amount);
      if (inv.status === 'paid') {
        lifetimeValue += amt;
      } else if (inv.status === 'overdue') {
        overdueBalance += amt;
        outstandingBalance += amt; // Overdue is also technically outstanding
      } else if (inv.status === 'sent' || inv.status === 'draft') {
        outstandingBalance += amt;
      }
    });
  }

  return NextResponse.json({
    lifetimeValue,
    outstandingBalance,
    overdueBalance,
    totalInvoices: invoices?.length || 0
  });

}, { requireAuth: true, roles: ['Admin', 'SuperAdmin', 'Manager'] });
