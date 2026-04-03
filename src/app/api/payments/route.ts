import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { payments, invoices } from '@/db/schema';
import { eq, like, and, or, desc, asc, gte, lte, sql } from 'drizzle-orm';
import { safeErrorMessage } from '@/lib/constants';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    // Single payment by ID
    if (id) {
      if (!id || isNaN(parseInt(id))) {
        return NextResponse.json({ 
          error: "Valid ID is required",
          code: "INVALID_ID" 
        }, { status: 400 });
      }

      const payment = await db.select()
        .from(payments)
        .where(eq(payments.id, parseInt(id)))
        .limit(1);

      if (payment.length === 0) {
        return NextResponse.json({ 
          error: 'Payment not found',
          code: 'PAYMENT_NOT_FOUND' 
        }, { status: 404 });
      }

      return NextResponse.json(payment[0], { status: 200 });
    }

    // List payments with pagination and filters
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '10'), 100);
    const offset = parseInt(searchParams.get('offset') ?? '0');
    const search = searchParams.get('search');
    const invoiceId = searchParams.get('invoiceId');
    const paymentMethod = searchParams.get('paymentMethod');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const sort = searchParams.get('sort') ?? 'createdAt';
    const order = searchParams.get('order') ?? 'desc';

    let query = db.select().from(payments);
    const conditions = [];

    // Filter by invoiceId
    if (invoiceId && !isNaN(parseInt(invoiceId))) {
      conditions.push(eq(payments.invoiceId, parseInt(invoiceId)));
    }

    // Filter by payment method
    if (paymentMethod) {
      conditions.push(eq(payments.paymentMethod, paymentMethod));
    }

    // Filter by date range
    if (startDate) {
      conditions.push(gte(payments.paymentDate, startDate));
    }
    if (endDate) {
      conditions.push(lte(payments.paymentDate, endDate));
    }

    // Search across text fields
    if (search) {
      conditions.push(
        or(
          like(payments.paymentMethod, `%${search}%`),
          like(payments.transactionId, `%${search}%`),
          like(payments.notes, `%${search}%`)
        )
      );
    }

    // Apply conditions
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    // Apply sorting
    const sortColumn = payments[sort as keyof typeof payments] ?? payments.createdAt;
    query = order === 'asc' ? query.orderBy(asc(sortColumn)) : query.orderBy(desc(sortColumn));

    const results = await query.limit(limit).offset(offset);

    // Calculate total payments per invoice if filtering by invoiceId
    let aggregation = null;
    if (invoiceId && !isNaN(parseInt(invoiceId))) {
      const totalResult = await db.select({
        totalAmount: sql<number>`COALESCE(SUM(${payments.amount}), 0)`,
        paymentCount: sql<number>`COUNT(${payments.id})`
      })
      .from(payments)
      .where(eq(payments.invoiceId, parseInt(invoiceId)));

      aggregation = {
        invoiceId: parseInt(invoiceId),
        totalAmount: totalResult[0]?.totalAmount ?? 0,
        paymentCount: totalResult[0]?.paymentCount ?? 0
      };
    }

    return NextResponse.json({
      payments: results,
      aggregation,
      pagination: {
        limit,
        offset,
        total: results.length
      }
    }, { status: 200 });

  } catch (error) {
    console.error('GET error:', error);
    return NextResponse.json({ 
      error: safeErrorMessage(error) 
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { invoiceId, amount, paymentMethod, paymentDate, transactionId, notes } = body;

    // Validate required fields
    if (!invoiceId || isNaN(parseInt(invoiceId))) {
      return NextResponse.json({ 
        error: "Valid invoice ID is required",
        code: "MISSING_INVOICE_ID" 
      }, { status: 400 });
    }

    if (!amount || isNaN(parseInt(amount))) {
      return NextResponse.json({ 
        error: "Valid amount is required",
        code: "MISSING_AMOUNT" 
      }, { status: 400 });
    }

    if (parseInt(amount) <= 0) {
      return NextResponse.json({ 
        error: "Amount must be a positive integer",
        code: "INVALID_AMOUNT" 
      }, { status: 400 });
    }

    if (!paymentMethod || typeof paymentMethod !== 'string' || paymentMethod.trim() === '') {
      return NextResponse.json({ 
        error: "Payment method is required",
        code: "MISSING_PAYMENT_METHOD" 
      }, { status: 400 });
    }

    if (!paymentDate || typeof paymentDate !== 'string' || paymentDate.trim() === '') {
      return NextResponse.json({ 
        error: "Payment date is required",
        code: "MISSING_PAYMENT_DATE" 
      }, { status: 400 });
    }

    // Validate payment date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z)?$/;
    if (!dateRegex.test(paymentDate)) {
      return NextResponse.json({ 
        error: "Payment date must be a valid ISO date string",
        code: "INVALID_PAYMENT_DATE" 
      }, { status: 400 });
    }

    // Validate that invoice exists
    const invoice = await db.select()
      .from(invoices)
      .where(eq(invoices.id, parseInt(invoiceId)))
      .limit(1);

    if (invoice.length === 0) {
      return NextResponse.json({ 
        error: "Invoice not found",
        code: "INVOICE_NOT_FOUND" 
      }, { status: 404 });
    }

    // Prepare payment data
    const paymentData = {
      invoiceId: parseInt(invoiceId),
      amount: parseInt(amount),
      paymentMethod: paymentMethod.trim(),
      paymentDate: paymentDate.trim(),
      transactionId: transactionId ? transactionId.trim() : null,
      notes: notes ? notes.trim() : null,
      createdAt: new Date().toISOString()
    };

    // Insert payment
    const newPayment = await db.insert(payments)
      .values(paymentData)
      .returning();

    return NextResponse.json(newPayment[0], { status: 201 });

  } catch (error) {
    console.error('POST error:', error);
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

    const body = await request.json();
    const { paymentMethod, transactionId, notes } = body;

    // Check if payment exists
    const existingPayment = await db.select()
      .from(payments)
      .where(eq(payments.id, parseInt(id)))
      .limit(1);

    if (existingPayment.length === 0) {
      return NextResponse.json({ 
        error: 'Payment not found',
        code: 'PAYMENT_NOT_FOUND' 
      }, { status: 404 });
    }

    // Prepare update data
    const updateData: {
      paymentMethod?: string;
      transactionId?: string | null;
      notes?: string | null;
    } = {};

    if (paymentMethod !== undefined) {
      if (typeof paymentMethod !== 'string' || paymentMethod.trim() === '') {
        return NextResponse.json({ 
          error: "Payment method must be a non-empty string",
          code: "INVALID_PAYMENT_METHOD" 
        }, { status: 400 });
      }
      updateData.paymentMethod = paymentMethod.trim();
    }

    if (transactionId !== undefined) {
      updateData.transactionId = transactionId ? transactionId.trim() : null;
    }

    if (notes !== undefined) {
      updateData.notes = notes ? notes.trim() : null;
    }

    // Check if there's anything to update
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ 
        error: "No valid fields to update",
        code: "NO_UPDATE_FIELDS" 
      }, { status: 400 });
    }

    // Update payment
    const updatedPayment = await db.update(payments)
      .set(updateData)
      .where(eq(payments.id, parseInt(id)))
      .returning();

    return NextResponse.json(updatedPayment[0], { status: 200 });

  } catch (error) {
    console.error('PUT error:', error);
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

    // Check if payment exists
    const existingPayment = await db.select()
      .from(payments)
      .where(eq(payments.id, parseInt(id)))
      .limit(1);

    if (existingPayment.length === 0) {
      return NextResponse.json({ 
        error: 'Payment not found',
        code: 'PAYMENT_NOT_FOUND' 
      }, { status: 404 });
    }

    // Delete payment
    const deletedPayment = await db.delete(payments)
      .where(eq(payments.id, parseInt(id)))
      .returning();

    return NextResponse.json({
      message: 'Payment deleted successfully',
      payment: deletedPayment[0]
    }, { status: 200 });

  } catch (error) {
    console.error('DELETE error:', error);
    return NextResponse.json({ 
      error: safeErrorMessage(error) 
    }, { status: 500 });
  }
}