import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { expenses, projects, employees } from '@/db/schema';
import { eq, like, and, or, desc, asc, gte, lte, sql } from 'drizzle-orm';
import { safeErrorMessage } from '@/lib/constants';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const search = searchParams.get('search');
    const projectId = searchParams.get('projectId');
    const employeeId = searchParams.get('employeeId');
    const status = searchParams.get('status');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const aggregateBy = searchParams.get('aggregateBy'); // 'category' or 'project'
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '10'), 100);
    const offset = parseInt(searchParams.get('offset') ?? '0');
    const sortField = searchParams.get('sort') ?? 'createdAt';
    const sortOrder = searchParams.get('order') ?? 'desc';

    // Get single expense by ID
    if (id) {
      if (!id || isNaN(parseInt(id))) {
        return NextResponse.json({ 
          error: "Valid ID is required",
          code: "INVALID_ID" 
        }, { status: 400 });
      }

      const expense = await db.select()
        .from(expenses)
        .where(eq(expenses.id, parseInt(id)))
        .limit(1);

      if (expense.length === 0) {
        return NextResponse.json({ 
          error: 'Expense not found',
          code: "EXPENSE_NOT_FOUND" 
        }, { status: 404 });
      }

      return NextResponse.json(expense[0], { status: 200 });
    }

    // Handle aggregation requests
    if (aggregateBy === 'category') {
      const conditions = [];

      if (projectId) {
        if (isNaN(parseInt(projectId))) {
          return NextResponse.json({ 
            error: "Valid project ID is required",
            code: "INVALID_PROJECT_ID" 
          }, { status: 400 });
        }
        conditions.push(eq(expenses.projectId, parseInt(projectId)));
      }

      if (employeeId) {
        if (isNaN(parseInt(employeeId))) {
          return NextResponse.json({ 
            error: "Valid employee ID is required",
            code: "INVALID_EMPLOYEE_ID" 
          }, { status: 400 });
        }
        conditions.push(eq(expenses.employeeId, parseInt(employeeId)));
      }

      if (status) {
        if (!['pending', 'approved', 'rejected'].includes(status)) {
          return NextResponse.json({ 
            error: "Invalid status. Must be one of: pending, approved, rejected",
            code: "INVALID_STATUS" 
          }, { status: 400 });
        }
        conditions.push(eq(expenses.status, status));
      }

      if (startDate) {
        conditions.push(gte(expenses.date, startDate));
      }

      if (endDate) {
        conditions.push(lte(expenses.date, endDate));
      }

      const whereCondition = conditions.length > 0 ? and(...conditions) : undefined;

      const aggregated = await db.select({
        category: expenses.category,
        totalAmount: sql<number>`SUM(${expenses.amount})`,
        count: sql<number>`COUNT(*)`,
      })
        .from(expenses)
        .where(whereCondition)
        .groupBy(expenses.category);

      return NextResponse.json(aggregated, { status: 200 });
    }

    if (aggregateBy === 'project') {
      const conditions = [];

      if (projectId) {
        if (isNaN(parseInt(projectId))) {
          return NextResponse.json({ 
            error: "Valid project ID is required",
            code: "INVALID_PROJECT_ID" 
          }, { status: 400 });
        }
        conditions.push(eq(expenses.projectId, parseInt(projectId)));
      }

      if (employeeId) {
        if (isNaN(parseInt(employeeId))) {
          return NextResponse.json({ 
            error: "Valid employee ID is required",
            code: "INVALID_EMPLOYEE_ID" 
          }, { status: 400 });
        }
        conditions.push(eq(expenses.employeeId, parseInt(employeeId)));
      }

      if (status) {
        if (!['pending', 'approved', 'rejected'].includes(status)) {
          return NextResponse.json({ 
            error: "Invalid status. Must be one of: pending, approved, rejected",
            code: "INVALID_STATUS" 
          }, { status: 400 });
        }
        conditions.push(eq(expenses.status, status));
      }

      if (startDate) {
        conditions.push(gte(expenses.date, startDate));
      }

      if (endDate) {
        conditions.push(lte(expenses.date, endDate));
      }

      const whereCondition = conditions.length > 0 ? and(...conditions) : undefined;

      const aggregated = await db.select({
        projectId: expenses.projectId,
        totalAmount: sql<number>`SUM(${expenses.amount})`,
        count: sql<number>`COUNT(*)`,
      })
        .from(expenses)
        .where(whereCondition)
        .groupBy(expenses.projectId);

      return NextResponse.json(aggregated, { status: 200 });
    }

    // Build query with filters
    const conditions = [];

    if (search) {
      conditions.push(
        or(
          like(expenses.category, `%${search}%`),
          like(expenses.description, `%${search}%`)
        )
      );
    }

    if (projectId) {
      if (isNaN(parseInt(projectId))) {
        return NextResponse.json({ 
          error: "Valid project ID is required",
          code: "INVALID_PROJECT_ID" 
        }, { status: 400 });
      }
      conditions.push(eq(expenses.projectId, parseInt(projectId)));
    }

    if (employeeId) {
      if (isNaN(parseInt(employeeId))) {
        return NextResponse.json({ 
          error: "Valid employee ID is required",
          code: "INVALID_EMPLOYEE_ID" 
        }, { status: 400 });
      }
      conditions.push(eq(expenses.employeeId, parseInt(employeeId)));
    }

    if (status) {
      if (!['pending', 'approved', 'rejected'].includes(status)) {
        return NextResponse.json({ 
          error: "Invalid status. Must be one of: pending, approved, rejected",
          code: "INVALID_STATUS" 
        }, { status: 400 });
      }
      conditions.push(eq(expenses.status, status));
    }

    if (startDate) {
      conditions.push(gte(expenses.date, startDate));
    }

    if (endDate) {
      conditions.push(lte(expenses.date, endDate));
    }

    const whereCondition = conditions.length > 0 ? and(...conditions) : undefined;

    let query = db.select().from(expenses);

    if (whereCondition) {
      query = query.where(whereCondition);
    }

    // Apply sorting
    const orderByColumn = sortField === 'date' ? expenses.date 
      : sortField === 'amount' ? expenses.amount 
      : sortField === 'category' ? expenses.category
      : expenses.createdAt;
    
    query = query.orderBy(sortOrder === 'asc' ? asc(orderByColumn) : desc(orderByColumn));

    const results = await query.limit(limit).offset(offset);

    return NextResponse.json(results, { status: 200 });
  } catch (error) {
    console.error('GET expenses error:', error);
    return NextResponse.json({ 
      error: safeErrorMessage(error) 
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      category, 
      description, 
      amount, 
      date, 
      projectId, 
      employeeId, 
      receiptUrl, 
      status 
    } = body;

    // Validate required fields
    if (!category || !category.trim()) {
      return NextResponse.json({ 
        error: "Category is required",
        code: "MISSING_CATEGORY" 
      }, { status: 400 });
    }

    if (!description || !description.trim()) {
      return NextResponse.json({ 
        error: "Description is required",
        code: "MISSING_DESCRIPTION" 
      }, { status: 400 });
    }

    if (!amount && amount !== 0) {
      return NextResponse.json({ 
        error: "Amount is required",
        code: "MISSING_AMOUNT" 
      }, { status: 400 });
    }

    if (!date || !date.trim()) {
      return NextResponse.json({ 
        error: "Date is required",
        code: "MISSING_DATE" 
      }, { status: 400 });
    }

    // Validate amount is positive integer
    const parsedAmount = parseInt(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return NextResponse.json({ 
        error: "Amount must be a positive integer",
        code: "INVALID_AMOUNT" 
      }, { status: 400 });
    }

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return NextResponse.json({ 
        error: "Date must be in YYYY-MM-DD format",
        code: "INVALID_DATE_FORMAT" 
      }, { status: 400 });
    }

    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) {
      return NextResponse.json({ 
        error: "Invalid date provided",
        code: "INVALID_DATE" 
      }, { status: 400 });
    }

    // Validate status if provided
    if (status && !['pending', 'approved', 'rejected'].includes(status)) {
      return NextResponse.json({ 
        error: "Invalid status. Must be one of: pending, approved, rejected",
        code: "INVALID_STATUS" 
      }, { status: 400 });
    }

    // Validate projectId if provided
    if (projectId) {
      const parsedProjectId = parseInt(projectId);
      if (isNaN(parsedProjectId)) {
        return NextResponse.json({ 
          error: "Invalid project ID",
          code: "INVALID_PROJECT_ID" 
        }, { status: 400 });
      }

      const projectExists = await db.select()
        .from(projects)
        .where(eq(projects.id, parsedProjectId))
        .limit(1);

      if (projectExists.length === 0) {
        return NextResponse.json({ 
          error: "Project not found",
          code: "PROJECT_NOT_FOUND" 
        }, { status: 400 });
      }
    }

    // Validate employeeId if provided
    if (employeeId) {
      const parsedEmployeeId = parseInt(employeeId);
      if (isNaN(parsedEmployeeId)) {
        return NextResponse.json({ 
          error: "Invalid employee ID",
          code: "INVALID_EMPLOYEE_ID" 
        }, { status: 400 });
      }

      const employeeExists = await db.select()
        .from(employees)
        .where(eq(employees.id, parsedEmployeeId))
        .limit(1);

      if (employeeExists.length === 0) {
        return NextResponse.json({ 
          error: "Employee not found",
          code: "EMPLOYEE_NOT_FOUND" 
        }, { status: 400 });
      }
    }

    // Create expense with validated data
    const newExpense = await db.insert(expenses)
      .values({
        category: category.trim(),
        description: description.trim(),
        amount: parsedAmount,
        date: date,
        projectId: projectId ? parseInt(projectId) : null,
        employeeId: employeeId ? parseInt(employeeId) : null,
        receiptUrl: receiptUrl?.trim() || null,
        status: status || 'pending',
        createdAt: new Date().toISOString(),
      })
      .returning();

    return NextResponse.json(newExpense[0], { status: 201 });
  } catch (error) {
    console.error('POST expenses error:', error);
    return NextResponse.json({ 
      error: safeErrorMessage(error) 
    }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id || isNaN(parseInt(id))) {
      return NextResponse.json({ 
        error: "Valid ID is required",
        code: "INVALID_ID" 
      }, { status: 400 });
    }

    const expenseId = parseInt(id);

    // Check if expense exists
    const existingExpense = await db.select()
      .from(expenses)
      .where(eq(expenses.id, expenseId))
      .limit(1);

    if (existingExpense.length === 0) {
      return NextResponse.json({ 
        error: 'Expense not found',
        code: "EXPENSE_NOT_FOUND" 
      }, { status: 404 });
    }

    const body = await request.json();
    const { 
      category, 
      description, 
      amount, 
      date, 
      projectId, 
      employeeId, 
      receiptUrl, 
      status 
    } = body;

    const updates: any = {};

    // Validate and add category if provided
    if (category !== undefined) {
      if (!category.trim()) {
        return NextResponse.json({ 
          error: "Category cannot be empty",
          code: "EMPTY_CATEGORY" 
        }, { status: 400 });
      }
      updates.category = category.trim();
    }

    // Validate and add description if provided
    if (description !== undefined) {
      if (!description.trim()) {
        return NextResponse.json({ 
          error: "Description cannot be empty",
          code: "EMPTY_DESCRIPTION" 
        }, { status: 400 });
      }
      updates.description = description.trim();
    }

    // Validate and add amount if provided
    if (amount !== undefined) {
      const parsedAmount = parseInt(amount);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        return NextResponse.json({ 
          error: "Amount must be a positive integer",
          code: "INVALID_AMOUNT" 
        }, { status: 400 });
      }
      updates.amount = parsedAmount;
    }

    // Validate and add date if provided
    if (date !== undefined) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(date)) {
        return NextResponse.json({ 
          error: "Date must be in YYYY-MM-DD format",
          code: "INVALID_DATE_FORMAT" 
        }, { status: 400 });
      }

      const parsedDate = new Date(date);
      if (isNaN(parsedDate.getTime())) {
        return NextResponse.json({ 
          error: "Invalid date provided",
          code: "INVALID_DATE" 
        }, { status: 400 });
      }
      updates.date = date;
    }

    // Validate and add status if provided
    if (status !== undefined) {
      if (!['pending', 'approved', 'rejected'].includes(status)) {
        return NextResponse.json({ 
          error: "Invalid status. Must be one of: pending, approved, rejected",
          code: "INVALID_STATUS" 
        }, { status: 400 });
      }
      updates.status = status;
    }

    // Validate and add projectId if provided
    if (projectId !== undefined) {
      if (projectId === null) {
        updates.projectId = null;
      } else {
        const parsedProjectId = parseInt(projectId);
        if (isNaN(parsedProjectId)) {
          return NextResponse.json({ 
            error: "Invalid project ID",
            code: "INVALID_PROJECT_ID" 
          }, { status: 400 });
        }

        const projectExists = await db.select()
          .from(projects)
          .where(eq(projects.id, parsedProjectId))
          .limit(1);

        if (projectExists.length === 0) {
          return NextResponse.json({ 
            error: "Project not found",
            code: "PROJECT_NOT_FOUND" 
          }, { status: 400 });
        }
        updates.projectId = parsedProjectId;
      }
    }

    // Validate and add employeeId if provided
    if (employeeId !== undefined) {
      if (employeeId === null) {
        updates.employeeId = null;
      } else {
        const parsedEmployeeId = parseInt(employeeId);
        if (isNaN(parsedEmployeeId)) {
          return NextResponse.json({ 
            error: "Invalid employee ID",
            code: "INVALID_EMPLOYEE_ID" 
          }, { status: 400 });
        }

        const employeeExists = await db.select()
          .from(employees)
          .where(eq(employees.id, parsedEmployeeId))
          .limit(1);

        if (employeeExists.length === 0) {
          return NextResponse.json({ 
            error: "Employee not found",
            code: "EMPLOYEE_NOT_FOUND" 
          }, { status: 400 });
        }
        updates.employeeId = parsedEmployeeId;
      }
    }

    // Add receiptUrl if provided
    if (receiptUrl !== undefined) {
      updates.receiptUrl = receiptUrl ? receiptUrl.trim() : null;
    }

    // If no updates provided, return error
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ 
        error: "No valid fields to update",
        code: "NO_UPDATES" 
      }, { status: 400 });
    }

    // Update expense
    const updatedExpense = await db.update(expenses)
      .set(updates)
      .where(eq(expenses.id, expenseId))
      .returning();

    return NextResponse.json(updatedExpense[0], { status: 200 });
  } catch (error) {
    console.error('PUT expenses error:', error);
    return NextResponse.json({ 
      error: safeErrorMessage(error) 
    }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id || isNaN(parseInt(id))) {
      return NextResponse.json({ 
        error: "Valid ID is required",
        code: "INVALID_ID" 
      }, { status: 400 });
    }

    const expenseId = parseInt(id);

    // Check if expense exists
    const existingExpense = await db.select()
      .from(expenses)
      .where(eq(expenses.id, expenseId))
      .limit(1);

    if (existingExpense.length === 0) {
      return NextResponse.json({ 
        error: 'Expense not found',
        code: "EXPENSE_NOT_FOUND" 
      }, { status: 404 });
    }

    // Delete expense
    const deletedExpense = await db.delete(expenses)
      .where(eq(expenses.id, expenseId))
      .returning();

    return NextResponse.json({
      message: 'Expense deleted successfully',
      expense: deletedExpense[0]
    }, { status: 200 });
  } catch (error) {
    console.error('DELETE expenses error:', error);
    return NextResponse.json({ 
      error: safeErrorMessage(error) 
    }, { status: 500 });
  }
}