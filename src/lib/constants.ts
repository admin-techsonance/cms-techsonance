/**
 * Centralized Constants File
 * All hardcoded values used across the application are defined here.
 * Import from '@/lib/constants' instead of defining local constants.
 */

// ─── Pagination ─────────────────────────────────────────────────────────────
export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAYROLL_PAGE_SIZE = 50;

// ─── Currency ───────────────────────────────────────────────────────────────
export const DEFAULT_CURRENCY = 'INR';

// ─── Employee Statuses ──────────────────────────────────────────────────────
export const EMPLOYEE_STATUSES = ['active', 'on_leave', 'resigned'] as const;
export type EmployeeStatus = typeof EMPLOYEE_STATUSES[number];

// ─── Attendance Statuses ────────────────────────────────────────────────────
export const ATTENDANCE_STATUSES = ['present', 'absent', 'half_day', 'leave'] as const;
export type AttendanceStatus = typeof ATTENDANCE_STATUSES[number];

// ─── Daily Report Statuses ──────────────────────────────────────────────────
export const DAILY_REPORT_STATUSES = ['present', 'half_day', 'early_leave', 'on_leave'] as const;
export type DailyReportStatus = typeof DAILY_REPORT_STATUSES[number];

// ─── Leave Types ────────────────────────────────────────────────────────────
export const LEAVE_TYPES = ['sick', 'casual', 'vacation', 'unpaid'] as const;
export type LeaveType = typeof LEAVE_TYPES[number];

// ─── Approval Statuses (Leave Requests, Expenses, etc.) ─────────────────────
export const APPROVAL_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type ApprovalStatus = typeof APPROVAL_STATUSES[number];

// ─── Ticket Priorities ──────────────────────────────────────────────────────
export const TICKET_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type TicketPriority = typeof TICKET_PRIORITIES[number];

// ─── Ticket Statuses ────────────────────────────────────────────────────────
export const TICKET_STATUSES = ['open', 'in_progress', 'resolved', 'closed'] as const;
export type TicketStatus = typeof TICKET_STATUSES[number];

// ─── Reimbursement Statuses ─────────────────────────────────────────────────
export const REIMBURSEMENT_STATUSES = ['draft', 'submitted', 'approved', 'rejected'] as const;
export type ReimbursementStatus = typeof REIMBURSEMENT_STATUSES[number];

// ─── Payroll Statuses ───────────────────────────────────────────────────────
export const PAYROLL_STATUSES = ['draft', 'approved', 'paid'] as const;
export type PayrollStatus = typeof PAYROLL_STATUSES[number];

// ─── Client Statuses ────────────────────────────────────────────────────────
export const CLIENT_STATUSES = ['active', 'inactive'] as const;
export type ClientStatus = typeof CLIENT_STATUSES[number];

// ─── Project Statuses ───────────────────────────────────────────────────────
export const PROJECT_STATUSES = ['planned', 'in_progress', 'completed', 'on_hold', 'cancelled'] as const;
export type ProjectStatus = typeof PROJECT_STATUSES[number];

// ─── Task Statuses ──────────────────────────────────────────────────────────
export const TASK_STATUSES = ['todo', 'in_progress', 'in_review', 'done'] as const;
export type TaskStatus = typeof TASK_STATUSES[number];

// ─── Task Priorities ────────────────────────────────────────────────────────
export const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type TaskPriority = typeof TASK_PRIORITIES[number];

// ─── Invoice Statuses ───────────────────────────────────────────────────────
export const INVOICE_STATUSES = ['draft', 'sent', 'paid', 'overdue', 'cancelled'] as const;
export type InvoiceStatus = typeof INVOICE_STATUSES[number];

// ─── Default Reimbursement Categories (for auto-seed) ───────────────────────
export const DEFAULT_REIMBURSEMENT_CATEGORIES = [
  { name: 'Travel', description: 'Flight, train, bus, or taxi fares' },
  { name: 'Meal', description: 'Food and beverages during business trips' },
  { name: 'Lodging', description: 'Hotel or accommodation charges' },
  { name: 'Office Supplies', description: 'Stationery, electronics, or other office needs' },
  { name: 'Internet/Phone', description: 'Reimbursement for communication bills' },
  { name: 'Other', description: 'Miscellaneous expenses' },
] as const;

// ─── Validation Helpers ─────────────────────────────────────────────────────

/** Check if a value is in a readonly tuple/array */
export function isValidEnum<T extends readonly string[]>(
  value: string,
  validValues: T
): value is T[number] {
  return (validValues as readonly string[]).includes(value);
}

/** Validate date format YYYY-MM-DD */
export function isValidDateFormat(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

/** Validate a date string is parseable */
export function isValidDate(dateString: string): boolean {
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date.getTime());
}

/** Validate an ISO timestamp (or null/undefined) */
export function isValidTimestamp(timestamp: string | null | undefined): boolean {
  if (!timestamp) return true;
  const date = new Date(timestamp);
  return date instanceof Date && !isNaN(date.getTime());
}

/** Sanitize error message for client response (don't leak internals) */
export function safeErrorMessage(error: unknown): string {
  if (process.env.NODE_ENV === 'development') {
    return (error as Error).message || 'Internal server error';
  }
  return 'Internal server error';
}
