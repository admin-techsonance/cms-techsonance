import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { payroll, employees, users, sessions } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { hasFullAccess, type UserRole } from '@/lib/permissions';
import { safeErrorMessage } from '@/lib/constants';

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser(request);

    if (!currentUser) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const payrollId = searchParams.get('payrollId');

    if (!payrollId) {
      return NextResponse.json(
        { error: 'Payroll ID is required' },
        { status: 400 }
      );
    }

    // Fetch payroll record
    const [payrollRecord] = await db.select().from(payroll).where(eq(payroll.id, parseInt(payrollId)));

    if (!payrollRecord) {
      return NextResponse.json(
        { error: 'Payroll not found' },
        { status: 404 }
      );
    }

    // Fetch employee details
    const [employee] = await db.select().from(employees).where(eq(employees.id, payrollRecord.employeeId));

    if (!employee) {
      return NextResponse.json(
        { error: 'Employee not found' },
        { status: 404 }
      );
    }

    // Authorization: admin can view all, employees can only view their own
    const isAdmin = hasFullAccess(currentUser.role as UserRole);
    if (!isAdmin) {
      if (employee.userId !== currentUser.id) {
        return NextResponse.json(
          { error: 'You can only view your own payslips' },
          { status: 403 }
        );
      }
    }

    // Fetch user details
    const [user] = await db.select().from(users).where(eq(users.id, employee.userId));

    const employeeName = user ? `${user.firstName} ${user.lastName}` : employee.employeeId;

    // Fetch business settings
    let businessSettings: any = null;
    try {
      const settingsResponse = await fetch(`${request.nextUrl.origin}/api/business-settings`, {
        headers: { 'Authorization': `Bearer ${request.headers.get('authorization')?.substring(7)}` }
      });
      if (settingsResponse.ok) {
        businessSettings = await settingsResponse.json();
      }
    } catch (error) {
      console.error('Error fetching business settings:', error);
    }

    const monthName = new Date(payrollRecord.month + '-01').toLocaleString('default', { month: 'long', year: 'numeric' });

    // Generate HTML payslip
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Payslip - ${employeeName} - ${monthName}</title>
        <style>
          @media print {
            body { margin: 0; }
            .payslip { border: none; }
          }
          body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
          .payslip { max-width: 800px; margin: 0 auto; border: 2px solid #333; padding: 30px; }
          .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 20px; }
          .logo { max-width: 150px; margin-bottom: 10px; }
          .company-name { font-size: 24px; font-weight: bold; margin: 10px 0; }
          .company-details { font-size: 12px; color: #666; }
          .title { text-align: center; font-size: 20px; font-weight: bold; margin: 20px 0; }
          .section { margin: 20px 0; }
          .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
          .label { font-weight: bold; }
          .value { text-align: right; }
          .total-row { background: #f5f5f5; font-weight: bold; font-size: 16px; margin-top: 10px; padding: 12px; }
          .footer { margin-top: 40px; padding-top: 20px; border-top: 2px solid #333; text-align: center; font-size: 12px; color: #666; }
          table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
          th { background: #f5f5f5; font-weight: bold; }
          .text-right { text-align: right; }
        </style>
      </head>
      <body>
        <div class="payslip">
          <div class="header">
            ${businessSettings?.logoUrl ? `<img src="${businessSettings.logoUrl}" alt="Company Logo" class="logo" />` : ''}
            <div class="company-name">${businessSettings?.businessName || 'Company Name'}</div>
            <div class="company-details">
              ${businessSettings?.address || ''}<br/>
              Email: ${businessSettings?.email || ''} | Phone: ${businessSettings?.phone || ''}<br/>
              ${businessSettings?.gstNo ? `GST: ${businessSettings.gstNo} | ` : ''}${businessSettings?.pan ? `PAN: ${businessSettings.pan}` : ''}
            </div>
          </div>
          
          <div class="title">SALARY SLIP</div>
          
          <div class="section">
            <div class="row">
              <span class="label">Employee Name:</span>
              <span class="value">${employeeName}</span>
            </div>
            <div class="row">
              <span class="label">Employee ID:</span>
              <span class="value">${employee.employeeId}</span>
            </div>
            <div class="row">
              <span class="label">Department:</span>
              <span class="value">${employee.department}</span>
            </div>
            <div class="row">
              <span class="label">Designation:</span>
              <span class="value">${employee.designation}</span>
            </div>
            <div class="row">
              <span class="label">Pay Period:</span>
              <span class="value">${monthName}</span>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Attendance Details</th>
                <th class="text-right">Days</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Total Working Days</td>
                <td class="text-right">${payrollRecord.totalWorkingDays}</td>
              </tr>
              <tr>
                <td>Present Days</td>
                <td class="text-right">${payrollRecord.presentDays}</td>
              </tr>
              <tr>
                <td>Half Days</td>
                <td class="text-right">${payrollRecord.halfDays} (${payrollRecord.halfDays * 0.5} effective)</td>
              </tr>
              <tr>
                <td>Leave Days (Paid)</td>
                <td class="text-right">${payrollRecord.leaveDays}</td>
              </tr>
              <tr>
                <td>Absent Days</td>
                <td class="text-right">${payrollRecord.absentDays}</td>
              </tr>
            </tbody>
          </table>

          <table>
            <thead>
              <tr>
                <th>Earnings</th>
                <th class="text-right">Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Base Salary</td>
                <td class="text-right">${payrollRecord.baseSalary.toLocaleString()}</td>
              </tr>
              <tr>
                <td>Calculated Salary (Based on Attendance)</td>
                <td class="text-right">${payrollRecord.calculatedSalary.toLocaleString()}</td>
              </tr>
              ${(payrollRecord.bonuses ?? 0) > 0 ? `
              <tr>
                <td>Bonuses</td>
                <td class="text-right">${(payrollRecord.bonuses ?? 0).toLocaleString()}</td>
              </tr>` : ''}
            </tbody>
          </table>

          ${(payrollRecord.deductions ?? 0) > 0 ? `
          <table>
            <thead>
              <tr>
                <th>Deductions</th>
                <th class="text-right">Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Deductions</td>
                <td class="text-right">${(payrollRecord.deductions ?? 0).toLocaleString()}</td>
              </tr>
            </tbody>
          </table>` : ''}

          <div class="total-row">
            <div class="row" style="border: none;">
              <span class="label">NET SALARY:</span>
              <span class="value">₹${payrollRecord.netSalary.toLocaleString()}</span>
            </div>
          </div>

          ${payrollRecord.notes ? `
          <div class="section">
            <div class="label">Notes:</div>
            <div>${payrollRecord.notes}</div>
          </div>` : ''}

          <div class="footer">
            <p>This is a computer-generated payslip and does not require a signature.</p>
            <p>Generated on: ${new Date().toLocaleDateString()}</p>
          </div>
        </div>
        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </body>
      </html>
    `;

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html',
        'Content-Disposition': `attachment; filename="Payslip_${employee.employeeId}_${payrollRecord.month}.html"`,
      },
    });

  } catch (error) {
    console.error('Error generating payslip:', error);
    return NextResponse.json(
      { error: safeErrorMessage(error) },
      { status: 500 }
    );
  }
}
