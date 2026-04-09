import { eq } from 'drizzle-orm';
import { jsPDF } from 'jspdf';
import { db } from '@/db';
import { businessSettings, employees, payroll, users } from '@/db/schema';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, ForbiddenError, NotFoundError } from '@/server/http/errors';

export const GET = withApiHandler(async (request, context) => {
  const payrollId = Number(new URL(request.url).searchParams.get('payrollId'));
  if (!Number.isInteger(payrollId) || payrollId <= 0) {
    throw new BadRequestError('Valid payroll id is required');
  }

  const [payrollRecord] = await db.select().from(payroll).where(eq(payroll.id, payrollId)).limit(1);
  if (!payrollRecord) throw new NotFoundError('Payroll record not found');

  const [[employee], [settings]] = await Promise.all([
    db.select().from(employees).where(eq(employees.id, payrollRecord.employeeId)).limit(1),
    db.select().from(businessSettings).limit(1),
  ]);
  if (!employee) throw new NotFoundError('Employee not found');

  const user = context.auth!.user;
  const isAdminLike = user.role === 'Admin' || user.role === 'SuperAdmin';
  if (!isAdminLike && employee.userId !== user.id) {
    throw new ForbiddenError('You can only view your own payslip');
  }

  const [employeeUser] = await db.select().from(users).where(eq(users.id, employee.userId)).limit(1);
  const employeeName = employeeUser ? `${employeeUser.firstName} ${employeeUser.lastName}` : employee.employeeId;
  const monthName = new Date(`${payrollRecord.month}-01T00:00:00.000Z`).toLocaleString('default', { month: 'long', year: 'numeric' });

  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  let y = 48;
  const left = 48;

  const writeLine = (label: string, value: string, bold = false) => {
    pdf.setFont('helvetica', bold ? 'bold' : 'normal');
    pdf.text(`${label}${value}`, left, y);
    y += 20;
  };

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(18);
  pdf.text(settings?.businessName || 'Company Name', left, y);
  y += 24;
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  if (settings?.address) {
    pdf.text(settings.address, left, y);
    y += 14;
  }
  pdf.text(`Email: ${settings?.email || '-'}  Phone: ${settings?.phone || '-'}`, left, y);
  y += 24;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  pdf.text(`Salary Slip - ${monthName}`, left, y);
  y += 28;
  pdf.setFontSize(11);

  writeLine('Employee Name: ', employeeName, true);
  writeLine('Employee ID: ', employee.employeeId);
  writeLine('Department: ', employee.department);
  writeLine('Designation: ', employee.designation);
  writeLine('Total Working Days: ', String(payrollRecord.totalWorkingDays));
  writeLine('Present Days: ', String(payrollRecord.presentDays));
  writeLine('Half Days: ', `${payrollRecord.halfDays} (${payrollRecord.halfDays * 0.5} effective)`);
  writeLine('Leave Days: ', String(payrollRecord.leaveDays));
  writeLine('Absent Days: ', String(payrollRecord.absentDays));
  y += 8;
  writeLine('Base Salary: ', `INR ${payrollRecord.baseSalary.toLocaleString()}`, true);
  writeLine('Calculated Salary: ', `INR ${payrollRecord.calculatedSalary.toLocaleString()}`);
  writeLine('Bonuses: ', `INR ${(payrollRecord.bonuses ?? 0).toLocaleString()}`);
  writeLine('Deductions: ', `INR ${(payrollRecord.deductions ?? 0).toLocaleString()}`);
  writeLine('Net Salary: ', `INR ${payrollRecord.netSalary.toLocaleString()}`, true);
  if (payrollRecord.notes) {
    y += 8;
    pdf.setFont('helvetica', 'bold');
    pdf.text('Notes:', left, y);
    y += 16;
    pdf.setFont('helvetica', 'normal');
    pdf.text(String(payrollRecord.notes), left, y, { maxWidth: 500 });
    y += 24;
  }
  pdf.text(`Generated on ${new Date().toLocaleDateString()}`, left, y + 16);

  const pdfBuffer = Buffer.from(pdf.output('arraybuffer'));

  return new Response(pdfBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="Payslip_${employee.employeeId}_${payrollRecord.month}.pdf"`,
    },
  });
}, { requireAuth: true, roles: ['Employee'] });
