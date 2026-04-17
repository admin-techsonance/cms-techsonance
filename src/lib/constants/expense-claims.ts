/**
 * Expense Claims Constants
 * Centralized configuration for the Reimbursement / Expense Claims module.
 * Add new entries here to extend dropdowns across the entire application.
 */

// ─── Cost Categories ────────────────────────────────────────────────
export const COST_CATEGORIES = [
  { value: 'ai_software_licence', label: 'AI Software Licence', description: 'AI/ML software tools and licences' },
  { value: 'cellphone', label: 'Cellphone', description: 'Mobile phone expenses and accessories' },
  { value: 'computer_hardware', label: 'Computer Hardware', description: 'Laptops, desktops, peripherals and components' },
  { value: 'data_wifi', label: 'Data/WiFi', description: 'Internet, data plans and WiFi charges' },
  { value: 'entertainment_client_internal', label: 'Entertainment Client/Internal', description: 'Client entertainment and internal team events' },
  { value: 'international_travel', label: 'International Travel', description: 'International flight, hotel and per diem' },
  { value: 'local_travel', label: 'Local Travel', description: 'Local cab, bus, metro and fuel expenses' },
  { value: 'offsite_allowance', label: 'Offsite Allowance', description: 'Offsite work location daily allowance' },
  { value: 'subscriptions_software_licence', label: 'Subscriptions/Other Software Licence', description: 'SaaS subscriptions and software licences' },
  { value: 'training', label: 'Training', description: 'Courses, certifications and training materials' },
  { value: 'office_supplies', label: 'Office Supplies', description: 'Stationery, desk accessories and supplies' },
  { value: 'meals_refreshments', label: 'Meals & Refreshments', description: 'Working meals and team refreshments' },
  { value: 'medical_health', label: 'Medical & Health', description: 'Health check-ups and medical expenses' },
  { value: 'books_publications', label: 'Books & Publications', description: 'Technical books, journals and reference material' },
  { value: 'conference_events', label: 'Conference & Events', description: 'Conference tickets, booth and sponsorship fees' },
  { value: 'relocation', label: 'Relocation', description: 'Moving and relocation expenses' },
  { value: 'other', label: 'Other', description: 'Miscellaneous expenses not covered above' },
] as const;

export type CostCategoryValue = typeof COST_CATEGORIES[number]['value'];

// ─── Currencies ─────────────────────────────────────────────────────
export const CURRENCIES = [
  { value: 'INR', label: 'INR', symbol: '₹', name: 'Indian Rupee' },
  { value: 'USD', label: 'US$', symbol: '$', name: 'US Dollar' },
  { value: 'EUR', label: '€', symbol: '€', name: 'Euro' },
  { value: 'GBP', label: '£', symbol: '£', name: 'British Pound' },
  { value: 'AUD', label: 'AU$', symbol: 'A$', name: 'Australian Dollar' },
  { value: 'CAD', label: 'CA$', symbol: 'C$', name: 'Canadian Dollar' },
  { value: 'ZAR', label: 'R', symbol: 'R', name: 'South African Rand' },
] as const;

export type CurrencyValue = typeof CURRENCIES[number]['value'];

// ─── Divisions (Countries) ──────────────────────────────────────────
export const DIVISIONS = [
  { value: 'IND', label: 'India', code: 'IN' },
] as const;

export type DivisionValue = typeof DIVISIONS[number]['value'];

// ─── Billing Status ─────────────────────────────────────────────────
export const BILLING_STATUSES = [
  { value: 'billable', label: 'Billable' },
  { value: 'non_billable', label: 'Non Billable' },
] as const;

export type BillingStatusValue = typeof BILLING_STATUSES[number]['value'];

// ─── Default Values ─────────────────────────────────────────────────
export const EXPENSE_DEFAULTS = {
  division: 'IND' as DivisionValue,
  businessUnit: 'TechSonance Infotech',
  project: 'TechSonance Infotech',
  currency: 'INR' as CurrencyValue,
  billingStatus: 'non_billable' as BillingStatusValue,
  qty: 1,
} as const;

// ─── Claim Line Item (for Multiple mode) ────────────────────────────
export interface ClaimLineItem {
  id: string; // client-side UUID
  costCategory: CostCategoryValue | '';
  description: string;
  billingStatus: BillingStatusValue;
  currency: CurrencyValue;
  qty: number;
  unitCost: number;
  totalCost: number;
  receiptFile: File | null;
  receiptUrl: string | null;
  claimDate: string;
  project: string;
  forCompany: string;
  division: string;
  reasonForClaim: string;
}

export function createEmptyLineItem(): ClaimLineItem {
  return {
    id: crypto.randomUUID(),
    costCategory: '',
    description: '',
    billingStatus: EXPENSE_DEFAULTS.billingStatus,
    currency: EXPENSE_DEFAULTS.currency,
    qty: EXPENSE_DEFAULTS.qty,
    unitCost: 0,
    totalCost: 0,
    receiptFile: null,
    receiptUrl: null,
    claimDate: new Date().toISOString().split('T')[0],
    project: EXPENSE_DEFAULTS.project,
    forCompany: 'TechSonance Infotech',
    division: EXPENSE_DEFAULTS.division,
    reasonForClaim: '',
  };
}

/**
 * Get auto-description for a cost category
 */
export function getAutoDescription(categoryValue: string): string {
  const cat = COST_CATEGORIES.find(c => c.value === categoryValue);
  return cat?.description ?? '';
}

/**
 * Get currency symbol
 */
export function getCurrencySymbol(currencyValue: string): string {
  const cur = CURRENCIES.find(c => c.value === currencyValue);
  return cur?.symbol ?? currencyValue;
}
