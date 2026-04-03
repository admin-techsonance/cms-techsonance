import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { invoices, clients, projects } from '@/db/schema';
import { eq, like, and, or, desc, asc, gte, lte } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { safeErrorMessage } from '@/lib/constants';

const VALID_STATUSES = ['draft', 'sent', 'paid', 'overdue', 'cancelled'];

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    // Single invoice by ID
    if (id) {
      if (!id || isNaN(parseInt(id))) {
        return NextResponse.json({ 
          error: "Valid ID is required",
          code: "INVALID_ID" 
        }, { status: 400 });
      }

      const invoice = await db.select()
        .from(invoices)
        .where(eq(invoices.id, parseInt(id)))
        .limit(1);

      if (invoice.length === 0) {
        return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
      }

      return NextResponse.json(invoice[0], { status: 200 });
    }

    // List invoices with pagination, search, filtering, and sorting
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '10'), 100);
    const offset = parseInt(searchParams.get('offset') ?? '0');
    const search = searchParams.get('search');
    const clientId = searchParams.get('clientId');
    const projectId = searchParams.get('projectId');
    const status = searchParams.get('status');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const sort = searchParams.get('sort') ?? 'createdAt';
    const order = searchParams.get('order') ?? 'desc';

    let query = db.select().from(invoices);
    const conditions = [];

    // Search by invoice number
    if (search) {
      conditions.push(like(invoices.invoiceNumber, `%${search}%`));
    }

    // Filter by clientId
    if (clientId && !isNaN(parseInt(clientId))) {
      conditions.push(eq(invoices.clientId, parseInt(clientId)));
    }

    // Filter by projectId
    if (projectId && !isNaN(parseInt(projectId))) {
      conditions.push(eq(invoices.projectId, parseInt(projectId)));
    }

    // Filter by status
    if (status && VALID_STATUSES.includes(status)) {
      conditions.push(eq(invoices.status, status));
    }

    // Filter by date range
    if (startDate) {
      conditions.push(gte(invoices.dueDate, startDate));
    }
    if (endDate) {
      conditions.push(lte(invoices.dueDate, endDate));
    }

    // Apply filters
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    // Apply sorting
    const sortColumn = sort === 'dueDate' ? invoices.dueDate : 
                       sort === 'totalAmount' ? invoices.totalAmount : 
                       invoices.createdAt;
    
    query = order === 'asc' 
      ? query.orderBy(asc(sortColumn))
      : query.orderBy(desc(sortColumn));

    const results = await query.limit(limit).offset(offset);

    return NextResponse.json(results, { status: 200 });
  } catch (error) {
    console.error('GET error:', error);
    return NextResponse.json({ 
      error: safeErrorMessage(error) 
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json();

    // Security check: reject if userId provided in body
    if ('userId' in body || 'user_id' in body) {
      return NextResponse.json({ 
        error: "User ID cannot be provided in request body",
        code: "USER_ID_NOT_ALLOWED" 
      }, { status: 400 });
    }

    const { 
      invoiceNumber, 
      clientId, 
      amount, 
      tax, 
      totalAmount, 
      dueDate,
      projectId,
      paidDate,
      notes,
      status
    } = body;

    // Validate required fields
    if (!invoiceNumber || !invoiceNumber.trim()) {
      return NextResponse.json({ 
        error: "Invoice number is required",
        code: "MISSING_INVOICE_NUMBER" 
      }, { status: 400 });
    }

    if (!clientId || isNaN(parseInt(clientId))) {
      return NextResponse.json({ 
        error: "Valid client ID is required",
        code: "INVALID_CLIENT_ID" 
      }, { status: 400 });
    }

    if (amount === undefined || amount === null || isNaN(parseInt(amount)) || parseInt(amount) < 0) {
      return NextResponse.json({ 
        error: "Valid positive amount is required",
        code: "INVALID_AMOUNT" 
      }, { status: 400 });
    }

    if (tax === undefined || tax === null || isNaN(parseInt(tax)) || parseInt(tax) < 0) {
      return NextResponse.json({ 
        error: "Valid positive tax amount is required",
        code: "INVALID_TAX" 
      }, { status: 400 });
    }

    if (totalAmount === undefined || totalAmount === null || isNaN(parseInt(totalAmount)) || parseInt(totalAmount) < 0) {
      return NextResponse.json({ 
        error: "Valid positive total amount is required",
        code: "INVALID_TOTAL_AMOUNT" 
      }, { status: 400 });
    }

    if (!dueDate || !dueDate.trim()) {
      return NextResponse.json({ 
        error: "Due date is required",
        code: "MISSING_DUE_DATE" 
      }, { status: 400 });
    }

    // Validate status if provided
    if (status && !VALID_STATUSES.includes(status)) {
      return NextResponse.json({ 
        error: `Status must be one of: ${VALID_STATUSES.join(', ')}`,
        code: "INVALID_STATUS" 
      }, { status: 400 });
    }

    // Check if invoice number is unique
    const existingInvoice = await db.select()
      .from(invoices)
      .where(eq(invoices.invoiceNumber, invoiceNumber.trim()))
      .limit(1);

    if (existingInvoice.length > 0) {
      return NextResponse.json({ 
        error: "Invoice number already exists",
        code: "DUPLICATE_INVOICE_NUMBER" 
      }, { status: 400 });
    }

    // Validate client exists
    const client = await db.select()
      .from(clients)
      .where(eq(clients.id, parseInt(clientId)))
      .limit(1);

    if (client.length === 0) {
      return NextResponse.json({ 
        error: "Client not found",
        code: "CLIENT_NOT_FOUND" 
      }, { status: 400 });
    }

    // Validate project exists if projectId provided
    if (projectId) {
      if (isNaN(parseInt(projectId))) {
        return NextResponse.json({ 
          error: "Valid project ID is required",
          code: "INVALID_PROJECT_ID" 
        }, { status: 400 });
      }

      const project = await db.select()
        .from(projects)
        .where(eq(projects.id, parseInt(projectId)))
        .limit(1);

      if (project.length === 0) {
        return NextResponse.json({ 
          error: "Project not found",
          code: "PROJECT_NOT_FOUND" 
        }, { status: 400 });
      }
    }

    const now = new Date().toISOString();
    
    const newInvoice = await db.insert(invoices)
      .values({
        invoiceNumber: invoiceNumber.trim(),
        clientId: parseInt(clientId),
        projectId: projectId ? parseInt(projectId) : null,
        amount: parseInt(amount),
        tax: parseInt(tax),
        totalAmount: parseInt(totalAmount),
        dueDate: dueDate.trim(),
        status: status || 'draft',
        paidDate: paidDate || null,
        notes: notes?.trim() || null,
        createdAt: now,
        updatedAt: now
      })
      .returning();

    return NextResponse.json(newInvoice[0], { status: 201 });
  } catch (error) {
    console.error('POST error:', error);
    return NextResponse.json({ 
      error: safeErrorMessage(error) 
    }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id || isNaN(parseInt(id))) {
      return NextResponse.json({ 
        error: "Valid ID is required",
        code: "INVALID_ID" 
      }, { status: 400 });
    }

    const body = await request.json();

    // Security check: reject if userId provided in body
    if ('userId' in body || 'user_id' in body) {
      return NextResponse.json({ 
        error: "User ID cannot be provided in request body",
        code: "USER_ID_NOT_ALLOWED" 
      }, { status: 400 });
    }

    // Check if invoice exists
    const existingInvoice = await db.select()
      .from(invoices)
      .where(eq(invoices.id, parseInt(id)))
      .limit(1);

    if (existingInvoice.length === 0) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    const { 
      invoiceNumber, 
      clientId, 
      amount, 
      tax, 
      totalAmount, 
      dueDate,
      projectId,
      paidDate,
      notes,
      status
    } = body;

    const updates: Record<string, any> = {
      updatedAt: new Date().toISOString()
    };

    // Validate and update invoice number if provided
    if (invoiceNumber !== undefined) {
      if (!invoiceNumber.trim()) {
        return NextResponse.json({ 
          error: "Invoice number cannot be empty",
          code: "INVALID_INVOICE_NUMBER" 
        }, { status: 400 });
      }

      // Check if new invoice number is unique (excluding current invoice)
      const duplicateCheck = await db.select()
        .from(invoices)
        .where(and(
          eq(invoices.invoiceNumber, invoiceNumber.trim()),
          eq(invoices.id, parseInt(id))
        ))
        .limit(1);

      if (duplicateCheck.length === 0) {
        const existingNumber = await db.select()
          .from(invoices)
          .where(eq(invoices.invoiceNumber, invoiceNumber.trim()))
          .limit(1);

        if (existingNumber.length > 0) {
          return NextResponse.json({ 
            error: "Invoice number already exists",
            code: "DUPLICATE_INVOICE_NUMBER" 
          }, { status: 400 });
        }
      }

      updates.invoiceNumber = invoiceNumber.trim();
    }

    // Validate and update clientId if provided
    if (clientId !== undefined) {
      if (isNaN(parseInt(clientId))) {
        return NextResponse.json({ 
          error: "Valid client ID is required",
          code: "INVALID_CLIENT_ID" 
        }, { status: 400 });
      }

      const client = await db.select()
        .from(clients)
        .where(eq(clients.id, parseInt(clientId)))
        .limit(1);

      if (client.length === 0) {
        return NextResponse.json({ 
          error: "Client not found",
          code: "CLIENT_NOT_FOUND" 
        }, { status: 400 });
      }

      updates.clientId = parseInt(clientId);
    }

    // Validate and update projectId if provided
    if (projectId !== undefined) {
      if (projectId === null) {
        updates.projectId = null;
      } else {
        if (isNaN(parseInt(projectId))) {
          return NextResponse.json({ 
            error: "Valid project ID is required",
            code: "INVALID_PROJECT_ID" 
          }, { status: 400 });
        }

        const project = await db.select()
          .from(projects)
          .where(eq(projects.id, parseInt(projectId)))
          .limit(1);

        if (project.length === 0) {
          return NextResponse.json({ 
            error: "Project not found",
            code: "PROJECT_NOT_FOUND" 
          }, { status: 400 });
        }

        updates.projectId = parseInt(projectId);
      }
    }

    // Validate and update amounts if provided
    if (amount !== undefined) {
      if (isNaN(parseInt(amount)) || parseInt(amount) < 0) {
        return NextResponse.json({ 
          error: "Valid positive amount is required",
          code: "INVALID_AMOUNT" 
        }, { status: 400 });
      }
      updates.amount = parseInt(amount);
    }

    if (tax !== undefined) {
      if (isNaN(parseInt(tax)) || parseInt(tax) < 0) {
        return NextResponse.json({ 
          error: "Valid positive tax amount is required",
          code: "INVALID_TAX" 
        }, { status: 400 });
      }
      updates.tax = parseInt(tax);
    }

    if (totalAmount !== undefined) {
      if (isNaN(parseInt(totalAmount)) || parseInt(totalAmount) < 0) {
        return NextResponse.json({ 
          error: "Valid positive total amount is required",
          code: "INVALID_TOTAL_AMOUNT" 
        }, { status: 400 });
      }
      updates.totalAmount = parseInt(totalAmount);
    }

    // Update dueDate if provided
    if (dueDate !== undefined) {
      if (!dueDate.trim()) {
        return NextResponse.json({ 
          error: "Due date cannot be empty",
          code: "INVALID_DUE_DATE" 
        }, { status: 400 });
      }
      updates.dueDate = dueDate.trim();
    }

    // Validate and update status if provided
    if (status !== undefined) {
      if (!VALID_STATUSES.includes(status)) {
        return NextResponse.json({ 
          error: `Status must be one of: ${VALID_STATUSES.join(', ')}`,
          code: "INVALID_STATUS" 
        }, { status: 400 });
      }
      updates.status = status;

      // Auto-set paidDate when status changes to 'paid'
      if (status === 'paid' && existingInvoice[0].status !== 'paid') {
        updates.paidDate = new Date().toISOString();
      }
    }

    // Update paidDate if provided
    if (paidDate !== undefined) {
      updates.paidDate = paidDate;
    }

    // Update notes if provided
    if (notes !== undefined) {
      updates.notes = notes?.trim() || null;
    }

    const updated = await db.update(invoices)
      .set(updates)
      .where(eq(invoices.id, parseInt(id)))
      .returning();

    return NextResponse.json(updated[0], { status: 200 });
  } catch (error) {
    console.error('PUT error:', error);
    return NextResponse.json({ 
      error: safeErrorMessage(error) 
    }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id || isNaN(parseInt(id))) {
      return NextResponse.json({ 
        error: "Valid ID is required",
        code: "INVALID_ID" 
      }, { status: 400 });
    }

    // Check if invoice exists
    const existingInvoice = await db.select()
      .from(invoices)
      .where(eq(invoices.id, parseInt(id)))
      .limit(1);

    if (existingInvoice.length === 0) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // Soft delete by setting status to 'cancelled'
    const deleted = await db.update(invoices)
      .set({
        status: 'cancelled',
        updatedAt: new Date().toISOString()
      })
      .where(eq(invoices.id, parseInt(id)))
      .returning();

    return NextResponse.json({ 
      message: 'Invoice cancelled successfully',
      invoice: deleted[0]
    }, { status: 200 });
  } catch (error) {
    console.error('DELETE error:', error);
    return NextResponse.json({ 
      error: safeErrorMessage(error) 
    }, { status: 500 });
  }
}