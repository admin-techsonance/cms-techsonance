import { differenceInMonths, differenceInYears, isWeekend, format, parseISO, startOfMonth, isAfter, isBefore, addMonths } from 'date-fns';

export const PUBLIC_HOLIDAYS_2026: Record<string, string> = {
  '2026-01-01': "New Year's Day",
  '2026-01-26': 'Republic Day',
  '2026-03-04': 'Holi',
  '2026-03-19': 'Gudi Padwa',
  '2026-05-01': 'Labour Day',
  '2026-09-14': 'Ganesh Chaturthi',
  '2026-10-02': 'Gandhi Jayanti',
  '2026-10-20': 'Dusshera',
  '2026-11-09': 'Diwali',
  '2026-12-25': 'Christmas',
};

/** Backwards compat: array of date strings */
export const PUBLIC_HOLIDAYS_2026_LIST = Object.keys(PUBLIC_HOLIDAYS_2026);

export interface LeaveEntitlement {
  annual: number;
  sick: number;
  family: number;
  study: number;
  maternity: number;
  paternity: number;
  unpaid: number;
}

export interface LeavePolicy {
  leaveType: string;
  tenure02Days: number;
  tenure25Days: number;
  tenure510Days: number;
  tenure10PlusDays: number;
  fixedDaysPerYear: number;
  maxCarryForward: number;
  requiresDocument: boolean;
  internEligible: boolean;
  isActive: boolean;
}

/**
 * Calculate entitlement for a specific leave type based on tenure and policy
 */
export function getEntitlementForType(
  policy: LeavePolicy,
  tenureYears: number
): number {
  if (policy.leaveType === 'annual') {
    if (tenureYears >= 10) return policy.tenure10PlusDays;
    if (tenureYears >= 5) return policy.tenure510Days;
    if (tenureYears >= 2) return policy.tenure25Days;
    return policy.tenure02Days;
  }
  return policy.fixedDaysPerYear;
}

/**
 * Calculates accrued balances from DB-driven policies.
 * Falls back to hardcoded defaults if no policies are passed.
 */
export function calculateAccruedBalances(
  joiningDate: string,
  role: string,
  policies?: LeavePolicy[],
  currentDate: Date = new Date()
): LeaveEntitlement {
  // Interns get 0 paid leave (only unpaid)
  const isIntern = role.toLowerCase() === 'intern';

  if (isIntern) {
    return { annual: 0, sick: 0, family: 0, study: 0, maternity: 0, paternity: 0, unpaid: 365 };
  }

  const start = parseISO(joiningDate);
  const tenureYears = differenceInYears(currentDate, start);
  const totalMonths = differenceInMonths(currentDate, start);

  // If DB policies are provided, use them
  if (policies && policies.length > 0) {
    const result: Record<string, number> = {};
    for (const policy of policies) {
      if (!policy.isActive) continue;
      if (isIntern && !policy.internEligible) {
        result[policy.leaveType] = 0;
        continue;
      }

      if (policy.leaveType === 'annual') {
        // Accrue monthly based on tenure bracket
        const annualEntitlement = getEntitlementForType(policy, tenureYears);
        const monthlyRate = annualEntitlement / 12;
        // Accrue for months worked (capped at annual entitlement)
        const accrued = Math.min(totalMonths * monthlyRate, annualEntitlement);
        result[policy.leaveType] = parseFloat(accrued.toFixed(3));
      } else {
        // Fixed entitlement per year
        if (totalMonths < 12) {
          // Pro-rate for first year
          const monthlyRate = policy.fixedDaysPerYear / 12;
          result[policy.leaveType] = parseFloat((totalMonths * monthlyRate).toFixed(3));
        } else {
          result[policy.leaveType] = policy.fixedDaysPerYear;
        }
      }
    }

    return {
      annual: result.annual ?? 0,
      sick: result.sick ?? 0,
      family: result.family ?? 0,
      study: result.study ?? 0,
      maternity: result.maternity ?? 0,
      paternity: result.paternity ?? 0,
      unpaid: result.unpaid ?? 365,
    };
  }

  // ---- Hardcoded Fallback (matches corrected rules) ----
  let annualEntitlement = 12;
  if (tenureYears >= 10) annualEntitlement = 23;
  else if (tenureYears >= 5) annualEntitlement = 20;
  else if (tenureYears >= 2) annualEntitlement = 18;

  const monthlyAnnualRate = annualEntitlement / 12;
  let tempDate = startOfMonth(start);
  const end = startOfMonth(currentDate);
  let accruedAnnual = 0;
  while (isBefore(tempDate, end) || tempDate.getTime() === end.getTime()) {
    accruedAnnual += monthlyAnnualRate;
    tempDate = addMonths(tempDate, 1);
  }
  accruedAnnual = Math.min(accruedAnnual, annualEntitlement);

  const accruedSick = totalMonths < 12 ? totalMonths * (8 / 12) : 8;
  const accruedFamily = totalMonths < 12 ? totalMonths * (3 / 12) : 3;
  const accruedStudy = totalMonths < 12 ? totalMonths * (8 / 12) : 8;

  return {
    annual: parseFloat(accruedAnnual.toFixed(3)),
    sick: parseFloat(accruedSick.toFixed(3)),
    family: parseFloat(accruedFamily.toFixed(3)),
    study: parseFloat(accruedStudy.toFixed(3)),
    maternity: 0,
    paternity: 0,
    unpaid: 365,
  };
}

export interface LeaveCalculationBreakdown {
  totalDays: number;
  workDays: number;
  weekendDays: number;
  publicHolidays: number;
  publicHolidayDetails: { date: string; reason: string }[];
  actualLeaveDays: number;
}

/**
 * Calculates detailed leave breakdown between two dates,
 * excluding weekends and public holidays from the leave count.
 */
export function calculateDetailedLeaveDays(
  start: string,
  end: string,
  period: 'full_day' | 'half_day' | 'hourly' = 'full_day',
  actualHoursFraction?: number,
  companyHolidays?: Record<string, string>
): LeaveCalculationBreakdown {
  const empty: LeaveCalculationBreakdown = {
    totalDays: 0,
    workDays: 0,
    weekendDays: 0,
    publicHolidays: 0,
    publicHolidayDetails: [],
    actualLeaveDays: 0,
  };

  if (!start || !end) return empty;

  const startDate = parseISO(start);
  const endDate = parseISO(end);
  if (isAfter(startDate, endDate)) return empty;

  const holidays = companyHolidays ?? PUBLIC_HOLIDAYS_2026;

  let totalDays = 0;
  let workDays = 0;
  let weekendDays = 0;
  let publicHolidays = 0;
  const publicHolidayDetails: { date: string; reason: string }[] = [];

  const current = new Date(startDate);
  while (isBefore(current, endDate) || current.getTime() === endDate.getTime()) {
    totalDays++;
    const dateStr = format(current, 'yyyy-MM-dd');
    const isHoliday = dateStr in holidays;
    const isWknd = isWeekend(current);

    if (isHoliday) {
      publicHolidays++;
      publicHolidayDetails.push({ date: dateStr, reason: holidays[dateStr] });
    } else if (isWknd) {
      weekendDays++;
    } else {
      workDays++;
    }

    current.setDate(current.getDate() + 1);
  }

  let actualLeaveDays = workDays;

  if (period === 'half_day') {
    actualLeaveDays = 0.5;
  } else if (period === 'hourly' && actualHoursFraction !== undefined) {
    // Convert hours to fraction of a 9-hour working day
    actualLeaveDays = parseFloat((actualHoursFraction / 9).toFixed(3));
  }

  return {
    totalDays,
    workDays,
    weekendDays,
    publicHolidays,
    publicHolidayDetails,
    actualLeaveDays,
  };
}

/**
 * Backwards-compatible wrapper: returns just the number of actual work days
 */
export function calculateActualLeaveDays(start: string, end: string) {
  return calculateDetailedLeaveDays(start, end).workDays;
}
