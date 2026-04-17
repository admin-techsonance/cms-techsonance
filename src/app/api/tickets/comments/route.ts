import { NextResponse } from 'next/server';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, NotFoundError } from '@/server/http/errors';
import { getAdminRouteSupabase } from '@/server/supabase/route-helpers';

export const GET = withApiHandler(async (request, context) => {
  const { searchParams } = new URL(request.url);
  const ticketId = searchParams.get('ticketId');
  if (!ticketId) throw new BadRequestError('Ticket ID is required');

  const accessToken = context.auth?.accessToken;
  if (!accessToken) throw new BadRequestError('Authorization required');
  
  const supabase = getAdminRouteSupabase();

  // Fetch comments (without PostgREST inner joins on auth.users vs public.users to avoid 500 errors)
  const { data: rawComments, error: fetchError } = await supabase
    .from('helpdesk_comments')
    .select(`
      id,
      ticket_id,
      user_id,
      message,
      created_at
    `)
    .eq('ticket_id', Number(ticketId))
    .order('created_at', { ascending: true });

  if (fetchError) throw new Error('Failed to fetch comments');

  let comments = rawComments || [];

  if (comments.length > 0) {
    const userIds = Array.from(new Set(comments.map((c: any) => c.user_id)));
    const { data: profiles } = await supabase
      .from('users')
      .select('id, legacy_user_id, role, first_name, last_name')
      .in('id', userIds);

    const profileMap: any = {};
    if (profiles) {
      profiles.forEach(p => { profileMap[p.id] = p; });
    }

    comments = comments.map((c: any) => ({
      ...c,
      legacy_user_id: profileMap[c.user_id]?.legacy_user_id ?? null,
      users: profileMap[c.user_id] || null
    }));
  }

  return NextResponse.json({ comments });
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request, context) => {
  const payload = await request.json();
  const ticketId = payload.ticketId;
  const message = payload.message;
  
  if (!ticketId || !message?.trim()) throw new BadRequestError('Ticket ID and valid message are required');

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  const actor = context.auth?.user;
  const authUuid = actor?.providerUserId;
  
  if (!accessToken || !tenantId || !actor || !authUuid) throw new BadRequestError('Authorization required');
  
  const supabase = getAdminRouteSupabase();

  // Fetch ticket to determine who should be notified
  const { data: ticket, error: ticketError } = await ticketLookup(supabase, ticketId, tenantId);
  if (ticketError || !ticket) throw new NotFoundError('Ticket not found');

  const { data: newComment, error: commentError } = await supabase.from('helpdesk_comments').insert({
    ticket_id: ticketId,
    user_id: authUuid,
    message: message.trim(),
    created_at: new Date().toISOString()
  }).select(`
      id,
      ticket_id,
      user_id,
      message,
      created_at
  `).single();

  if (commentError || !newComment) throw commentError ?? new Error('Failed to create comment');

  const { data: activeProfile } = await supabase.from('users').select('id, legacy_user_id, role, first_name, last_name').eq('id', authUuid).single();

  const comment = { ...newComment, legacy_user_id: activeProfile?.legacy_user_id ?? null, users: activeProfile || null };

  // TRIGGER INTERNAL NOTIFICATIONS
  const isAdminActor = actor.role === 'Admin' || actor.role === 'Manager' || actor.role === 'SuperAdmin';
  
  try {
     if (isAdminActor) {
       // Notify the Employee that an Admin replied
       // the ticket created_by is the legacy user auth ID
       const { data: employeeUser } = await supabase.from('users').select('id').eq('auth_user_id', ticket.created_by).single();
       if (employeeUser) {
          await supabase.from('notifications').insert({
            user_id: employeeUser.id,
            title: `New Reply on Ticket ${ticket.ticket_number}`,
            message: `An administrator has responded to your ticket regarding "${ticket.subject}".`,
            type: 'info',
            link: '/dashboard/help-desk',
            is_read: false,
            tenant_id: tenantId,
            created_at: new Date().toISOString(),
          });
       }
     } else {
       // Search for admins to notify
       const { data: adminUsers } = await supabase.from('users').select('id').in('role', ['Admin', 'SuperAdmin', 'Manager']).eq('tenant_id', tenantId);
       if (adminUsers) {
          const alerts = adminUsers.map((admin: any) => ({
             user_id: admin.id,
             title: `New Message on Ticket ${ticket.ticket_number}`,
             message: `The employee has added a comment to the ticket "${ticket.subject}".`,
             type: 'info',
             link: '/dashboard/help-desk',
             is_read: false,
             tenant_id: tenantId,
             created_at: new Date().toISOString(),
          }));
          await supabase.from('notifications').insert(alerts);
       }
     }
  } catch(e) {
     console.error('Failed to disparch chat notification', e);
  }

  return NextResponse.json({ success: true, comment });
}, { requireAuth: true, roles: ['Employee'] });

async function ticketLookup(supabase: any, id: number, tenantId: string) {
    return supabase.from('tickets').select('*').eq('id', id).eq('tenant_id', tenantId).single();
}
