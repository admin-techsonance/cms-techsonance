import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, NotFoundError } from '@/server/http/errors';
import { apiSuccess } from '@/server/http/response';
import { getAdminRouteSupabase } from '@/server/supabase/route-helpers';

/**
 * Default leave policy seed data - used when no policies exist in DB yet.
 * These match the user's corrected entitlement rules.
 */
const DEFAULT_POLICIES = [
  {
    leave_type: 'annual',
    tenure_0_2_days: 12,
    tenure_2_5_days: 18,
    tenure_5_10_days: 20,
    tenure_10_plus_days: 23,
    fixed_days_per_year: 0,
    max_carry_forward: 5,
    requires_document: false,
    intern_eligible: false,
    display_order: 1,
    is_active: true,
  },
  {
    leave_type: 'sick',
    tenure_0_2_days: 8,
    tenure_2_5_days: 8,
    tenure_5_10_days: 8,
    tenure_10_plus_days: 8,
    fixed_days_per_year: 8,
    max_carry_forward: 0,
    requires_document: true,
    intern_eligible: false,
    display_order: 2,
    is_active: true,
  },
  {
    leave_type: 'family',
    tenure_0_2_days: 3,
    tenure_2_5_days: 3,
    tenure_5_10_days: 3,
    tenure_10_plus_days: 3,
    fixed_days_per_year: 3,
    max_carry_forward: 0,
    requires_document: true,
    intern_eligible: false,
    display_order: 3,
    is_active: true,
  },
  {
    leave_type: 'study',
    tenure_0_2_days: 8,
    tenure_2_5_days: 8,
    tenure_5_10_days: 8,
    tenure_10_plus_days: 8,
    fixed_days_per_year: 8,
    max_carry_forward: 0,
    requires_document: true,
    intern_eligible: false,
    display_order: 4,
    is_active: true,
  },
  {
    leave_type: 'maternity',
    tenure_0_2_days: 0,
    tenure_2_5_days: 0,
    tenure_5_10_days: 0,
    tenure_10_plus_days: 0,
    fixed_days_per_year: 182,
    max_carry_forward: 0,
    requires_document: true,
    intern_eligible: false,
    display_order: 5,
    is_active: true,
  },
  {
    leave_type: 'paternity',
    tenure_0_2_days: 0,
    tenure_2_5_days: 0,
    tenure_5_10_days: 0,
    tenure_10_plus_days: 0,
    fixed_days_per_year: 15,
    max_carry_forward: 0,
    requires_document: false,
    intern_eligible: false,
    display_order: 6,
    is_active: true,
  },
  {
    leave_type: 'unpaid',
    tenure_0_2_days: 0,
    tenure_2_5_days: 0,
    tenure_5_10_days: 0,
    tenure_10_plus_days: 0,
    fixed_days_per_year: 365,
    max_carry_forward: 0,
    requires_document: false,
    intern_eligible: true,
    display_order: 7,
    is_active: true,
  },
];

function normalizePolicy(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    leaveType: row.leave_type,
    tenure02Days: Number(row.tenure_0_2_days),
    tenure25Days: Number(row.tenure_2_5_days),
    tenure510Days: Number(row.tenure_5_10_days),
    tenure10PlusDays: Number(row.tenure_10_plus_days),
    fixedDaysPerYear: Number(row.fixed_days_per_year),
    maxCarryForward: Number(row.max_carry_forward),
    requiresDocument: Boolean(row.requires_document),
    internEligible: Boolean(row.intern_eligible),
    displayOrder: Number(row.display_order),
    isActive: Boolean(row.is_active),
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

/**
 * Normalize default policies to the same shape as DB rows
 */
function normalizeFallbackPolicy(row: typeof DEFAULT_POLICIES[number], index: number) {
  return {
    id: index + 1,
    leaveType: row.leave_type,
    tenure02Days: row.tenure_0_2_days,
    tenure25Days: row.tenure_2_5_days,
    tenure510Days: row.tenure_5_10_days,
    tenure10PlusDays: row.tenure_10_plus_days,
    fixedDaysPerYear: row.fixed_days_per_year,
    maxCarryForward: row.max_carry_forward,
    requiresDocument: row.requires_document,
    internEligible: row.intern_eligible,
    displayOrder: row.display_order,
    isActive: row.is_active,
    createdAt: null,
    updatedAt: null,
  };
}

/**
 * GET /api/leave-policies
 * Returns all leave policies for the current tenant.
 * If the table doesn't exist yet, returns hardcoded defaults.
 * If table exists but is empty, seeds from defaults and returns those.
 */
export const GET = withApiHandler(async (_request, context) => {
  const tenantId = context.auth?.user.tenantId;
  if (!tenantId) throw new BadRequestError('Tenant info required');
  const supabase = getAdminRouteSupabase();

  let { data, error } = await supabase
    .from('leave_policies')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('display_order', { ascending: true });

  // If the table doesn't exist yet (migration not run), return defaults
  if (error) {
    const errorMessage = typeof error === 'object' && error !== null
      ? (error as any).message ?? ''
      : String(error);
    if (errorMessage.includes('leave_policies') || errorMessage.includes('schema cache')) {
      return apiSuccess(
        DEFAULT_POLICIES.map(normalizeFallbackPolicy),
        'Leave policies fetched successfully (using defaults — run migration to enable DB storage)'
      );
    }
    throw error;
  }

  // Auto-seed default policies if none exist
  if (!data || data.length === 0) {
    const rows = DEFAULT_POLICIES.map((p) => ({
      ...p,
      tenant_id: tenantId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    const { data: seeded, error: seedError } = await supabase
      .from('leave_policies')
      .insert(rows)
      .select('*');

    if (seedError) {
      // If insert also fails (table missing), return defaults
      return apiSuccess(
        DEFAULT_POLICIES.map(normalizeFallbackPolicy),
        'Leave policies fetched successfully (using defaults)'
      );
    }
    data = seeded;
  }

  return apiSuccess(
    ((data as Record<string, unknown>[] | null) ?? []).map(normalizePolicy),
    'Leave policies fetched successfully'
  );
}, { requireAuth: true, roles: ['Employee'] });

/**
 * PATCH /api/leave-policies?id=<policyId>
 * Admin-only: update a specific leave policy rule.
 */
export const PATCH = withApiHandler(async (request, context) => {
  const policyId = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(policyId) || policyId <= 0) {
    throw new BadRequestError('Valid leave policy id is required');
  }

  const tenantId = context.auth?.user.tenantId;
  if (!tenantId) throw new BadRequestError('Tenant info required');
  const supabase = getAdminRouteSupabase();

  const { data: existing } = await supabase
    .from('leave_policies')
    .select('*')
    .eq('id', policyId)
    .eq('tenant_id', tenantId)
    .single();
  if (!existing) throw new NotFoundError('Leave policy not found');

  const body = await request.json();
  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };

  // Only allow specific fields to be updated
  const allowedFields: Record<string, string> = {
    tenure02Days: 'tenure_0_2_days',
    tenure25Days: 'tenure_2_5_days',
    tenure510Days: 'tenure_5_10_days',
    tenure10PlusDays: 'tenure_10_plus_days',
    fixedDaysPerYear: 'fixed_days_per_year',
    maxCarryForward: 'max_carry_forward',
    requiresDocument: 'requires_document',
    internEligible: 'intern_eligible',
    displayOrder: 'display_order',
    isActive: 'is_active',
  };

  for (const [camelKey, snakeKey] of Object.entries(allowedFields)) {
    if (body[camelKey] !== undefined) {
      updateData[snakeKey] = body[camelKey];
    }
  }

  const { data: updated, error } = await supabase
    .from('leave_policies')
    .update(updateData)
    .eq('id', policyId)
    .eq('tenant_id', tenantId)
    .select('*')
    .single();

  if (error || !updated) throw error ?? new Error('Failed to update leave policy');
  return apiSuccess(normalizePolicy(updated), 'Leave policy updated successfully');
}, { requireAuth: true, roles: ['Admin'] });
