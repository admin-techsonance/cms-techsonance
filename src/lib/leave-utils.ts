import { differenceInMonths, differenceInYears, isWeekend, format, parseISO, startOfMonth, endOfMonth, isAfter, isBefore, addMonths } from 'date-fns';

export const PUBLIC_HOLIDAYS_2026 = [
  '2026-01-01', // New Year
  '2026-01-26', // Republic Day
  '2026-03-04', // Holi
  '2026-03-19', // Gudi Padwa
  '2026-05-01', // Labour Day
  '2026-09-14', // Ganesh Chaturthi
  '2026-10-02', // Gandhi Jayanti
  '2026-10-20', // Dusshera
  '2026-11-09', // Diwali
  '2026-12-25', // Christmas
];

export interface LeaveEntitlement {
  annual: number;
  sick: number;
  family: number;
  study: number;
  duvet: number;
}

/**
 * Calculates current leave balances based on tenure and joining date
 * Following BBD India 2026 Policy
 */
export function calculateAccruedBalances(joiningDate: string, role: string, currentDate: Date = new Date()) {
  const start = parseISO(joiningDate);
  
  // Interns get 0 paid leave
  if (role.toLowerCase() === 'intern') {
    return {
      annual: 0,
      sick: 0,
      family: 0,
      study: 0,
      duvet: 0
    };
  }

  const tenureYears = differenceInYears(currentDate, start);
  const totalMonths = differenceInMonths(currentDate, start);

  // 1. Annual Leave Calculation
  // 0-2y: 1.5/mo, 2-5y: 1.67/mo, 5-10y: 1.83/mo, 10y+: 2.08/mo
  let accruedAnnual = 0;
  let tempDate = startOfMonth(start);
  const end = startOfMonth(currentDate);

  while (isBefore(tempDate, end) || tempDate.getTime() === end.getTime()) {
    const monthsFromStart = differenceInMonths(tempDate, start);
    const yearsAtPoint = Math.floor(monthsFromStart / 12);
    
    let rate = 1.50;
    if (yearsAtPoint >= 10) rate = 2.08;
    else if (yearsAtPoint >= 5) rate = 1.83;
    else if (yearsAtPoint >= 2) rate = 1.67;

    accruedAnnual += rate;

    // TODO: Forfeiture Rule on March 31st
    // "excess of your annual leave accumulation aligned to tenure, will be forfeited"
    // This is complex for a simple client-side calc without historical tracking, 
    // but for now we calculate total accrued since joining or last Mar 31.
    
    tempDate = addMonths(tempDate, 1);
  }

  // 2. Sick Leave
  // 0.833/mo for first 6 months, then 10/year cycle
  let accruedSick = 0;
  if (totalMonths <= 6) {
    accruedSick = totalMonths * 0.833;
  } else {
    accruedSick = 10; // Simple approximation for the current cycle
  }

  // 3. Family Leave
  // 0.25/mo for first year, then 3 upfront
  let accruedFamily = 0;
  if (totalMonths <= 12) {
    accruedFamily = totalMonths * 0.25;
  } else {
    accruedFamily = 3;
  }

  // 4. Study Leave
  // 0.667/mo first year, then 8 upfront
  let accruedStudy = 0;
  if (totalMonths <= 12) {
    accruedStudy = totalMonths * 0.667;
  } else {
    accruedStudy = 8;
  }

  return {
    annual: parseFloat(accruedAnnual.toFixed(3)),
    sick: parseFloat(accruedSick.toFixed(3)),
    family: parseFloat(accruedFamily.toFixed(3)),
    study: parseFloat(accruedStudy.toFixed(3)),
    duvet: 0 // Award based, manual entry needed
  };
}

/**
 * Calculates actual work days between two dates, excluding weekends and public holidays
 */
export function calculateActualLeaveDays(start: string, end: string) {
  if (!start || !end) return 0;
  
  const startDate = parseISO(start);
  const endDate = parseISO(end);
  
  if (isAfter(startDate, endDate)) return 0;
  
  let count = 0;
  let current = new Date(startDate);
  
  while (isBefore(current, endDate) || current.getTime() === endDate.getTime()) {
    const dateStr = format(current, 'yyyy-MM-dd');
    const isHoliday = PUBLIC_HOLIDAYS_2026.includes(dateStr);
    const isWknd = isWeekend(current);
    
    if (!isHoliday && !isWknd) {
      count++;
    }
    
    current.setDate(current.getDate() + 1);
  }
  
  return count;
}
