import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { invoiceItems, invoices } from '@/db/schema';
import { eq, like, and, or, desc, asc, sql } from 'drizzle-orm';
import { safeErrorMessage } from '@/lib/constants';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const invoiceId = searchParams.get('invoiceId');
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '10'), 100);
    const offset = parseInt(searchParams.get('offset') ?? '0');
    const search = searchParams.get('search');
    const sort = searchParams.get('sort') ?? 'id';
    const order = searchParams.get('order') ?? 'desc';

    // Single record fetch
    if (id) {
      if (!id || isNaN(parseInt(id))) {
        return NextResponse.json({ 
          error: "Valid ID is required",
          code: "INVALID_ID" 
        }, { status: 400 });
      }

      const record = await db.select()
        .from(invoiceItems)
        .where(eq(invoiceItems.id, parseInt(id)))
        .limit(1);

      if (record.length === 0) {
        return NextResponse.json({ 
          error: 'Invoice item not found',
          code: 'NOT_FOUND' 
        }, { status: 404 });
      }

      return NextResponse.json(record[0], { status: 200 });
    }

    // List with filtering
    let query = db.select().from(invoiceItems);
    const conditions = [];

    // Filter by invoiceId
    if (invoiceId) {
      if (isNaN(parseInt(invoiceId))) {
        return NextResponse.json({ 
          error: "Valid invoice ID is required",
          code: "INVALID_INVOICE_ID" 
        }, { status: 400 });
      }
      conditions.push(eq(invoiceItems.invoiceId, parseInt(invoiceId)));
    }

    // Search across text fields
    if (search) {
      conditions.push(like(invoiceItems.description, `%${search}%`));
    }

    // Apply conditions
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    // Sorting
    const sortColumn = invoiceItems[sort as keyof typeof invoiceItems] || invoiceItems.id;
    query = order === 'asc' 
      ? query.orderBy(asc(sortColumn))
      : query.orderBy(desc(sortColumn));

    // Pagination
    const results = await query.limit(limit).offset(offset);

    // Calculate total amount per invoice if filtering by invoiceId
    let totalAmount = null;
    if (invoiceId) {
      const aggregation = await db.select({
        total: sql<number>`sum(${invoiceItems.amount})`.as('total')
      })
      .from(invoiceItems)
      .where(eq(invoiceItems.invoiceId, parseInt(invoiceId)));
      
      totalAmount = aggregation[0]?.total || 0;
    }

    return NextResponse.json({
      items: results,
      ...(totalAmount !== null && { totalAmount }),
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
    const { invoiceId, description, quantity, unitPrice, amount } = body;

    // Validate required fields
    if (!invoiceId) {
      return NextResponse.json({ 
        error: "Invoice ID is required",
        code: "MISSING_INVOICE_ID" 
      }, { status: 400 });
    }

    if (!description || description.trim() === '') {
      return NextResponse.json({ 
        error: "Description is required",
        code: "MISSING_DESCRIPTION" 
      }, { status: 400 });
    }

    if (quantity === undefined || quantity === null) {
      return NextResponse.json({ 
        error: "Quantity is required",
        code: "MISSING_QUANTITY" 
      }, { status: 400 });
    }

    if (unitPrice === undefined || unitPrice === null) {
      return NextResponse.json({ 
        error: "Unit price is required",
        code: "MISSING_UNIT_PRICE" 
      }, { status: 400 });
    }

    // Validate data types and values
    if (isNaN(parseInt(invoiceId.toString()))) {
      return NextResponse.json({ 
        error: "Invoice ID must be a valid integer",
        code: "INVALID_INVOICE_ID" 
      }, { status: 400 });
    }

    if (isNaN(parseInt(quantity.toString())) || parseInt(quantity.toString()) <= 0) {
      return NextResponse.json({ 
        error: "Quantity must be a positive integer",
        code: "INVALID_QUANTITY" 
      }, { status: 400 });
    }

    if (isNaN(parseInt(unitPrice.toString())) || parseInt(unitPrice.toString()) <= 0) {
      return NextResponse.json({ 
        error: "Unit price must be a positive integer",
        code: "INVALID_UNIT_PRICE" 
      }, { status: 400 });
    }

    // Validate invoiceId exists
    const invoice = await db.select()
      .from(invoices)
      .where(eq(invoices.id, parseInt(invoiceId.toString())))
      .limit(1);

    if (invoice.length === 0) {
      return NextResponse.json({ 
        error: "Invoice not found",
        code: "INVOICE_NOT_FOUND" 
      }, { status: 400 });
    }

    // Calculate amount
    const calculatedAmount = parseInt(quantity.toString()) * parseInt(unitPrice.toString());

    // Validate amount if provided
    if (amount !== undefined && amount !== null && parseInt(amount.toString()) !== calculatedAmount) {
      return NextResponse.json({ 
        error: "Amount must equal quantity multiplied by unit price",
        code: "INVALID_AMOUNT" 
      }, { status: 400 });
    }

    // Insert invoice item
    const newInvoiceItem = await db.insert(invoiceItems)
      .values({
        invoiceId: parseInt(invoiceId.toString()),
        description: description.trim(),
        quantity: parseInt(quantity.toString()),
        unitPrice: parseInt(unitPrice.toString()),
        amount: calculatedAmount
      })
      .returning();

    return NextResponse.json(newInvoiceItem[0], { status: 201 });

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

    // Check if record exists
    const existing = await db.select()
      .from(invoiceItems)
      .where(eq(invoiceItems.id, parseInt(id)))
      .limit(1);

    if (existing.length === 0) {
      return NextResponse.json({ 
        error: 'Invoice item not found',
        code: 'NOT_FOUND' 
      }, { status: 404 });
    }

    const body = await request.json();
    const { invoiceId, description, quantity, unitPrice, amount } = body;
    const updates: any = {};

    // Validate and prepare updates
    if (invoiceId !== undefined) {
      if (isNaN(parseInt(invoiceId.toString()))) {
        return NextResponse.json({ 
          error: "Invoice ID must be a valid integer",
          code: "INVALID_INVOICE_ID" 
        }, { status: 400 });
      }

      // Validate invoiceId exists
      const invoice = await db.select()
        .from(invoices)
        .where(eq(invoices.id, parseInt(invoiceId.toString())))
        .limit(1);

      if (invoice.length === 0) {
        return NextResponse.json({ 
          error: "Invoice not found",
          code: "INVOICE_NOT_FOUND" 
        }, { status: 400 });
      }

      updates.invoiceId = parseInt(invoiceId.toString());
    }

    if (description !== undefined) {
      if (description.trim() === '') {
        return NextResponse.json({ 
          error: "Description cannot be empty",
          code: "INVALID_DESCRIPTION" 
        }, { status: 400 });
      }
      updates.description = description.trim();
    }

    if (quantity !== undefined) {
      if (isNaN(parseInt(quantity.toString())) || parseInt(quantity.toString()) <= 0) {
        return NextResponse.json({ 
          error: "Quantity must be a positive integer",
          code: "INVALID_QUANTITY" 
        }, { status: 400 });
      }
      updates.quantity = parseInt(quantity.toString());
    }

    if (unitPrice !== undefined) {
      if (isNaN(parseInt(unitPrice.toString())) || parseInt(unitPrice.toString()) <= 0) {
        return NextResponse.json({ 
          error: "Unit price must be a positive integer",
          code: "INVALID_UNIT_PRICE" 
        }, { status: 400 });
      }
      updates.unitPrice = parseInt(unitPrice.toString());
    }

    // Recalculate amount if quantity or unitPrice changed
    const currentQuantity = updates.quantity ?? existing[0].quantity;
    const currentUnitPrice = updates.unitPrice ?? existing[0].unitPrice;
    const calculatedAmount = currentQuantity * currentUnitPrice;

    // Validate amount if provided
    if (amount !== undefined && amount !== null && parseInt(amount.toString()) !== calculatedAmount) {
      return NextResponse.json({ 
        error: "Amount must equal quantity multiplied by unit price",
        code: "INVALID_AMOUNT" 
      }, { status: 400 });
    }

    updates.amount = calculatedAmount;

    // Update record
    const updated = await db.update(invoiceItems)
      .set(updates)
      .where(eq(invoiceItems.id, parseInt(id)))
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
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id || isNaN(parseInt(id))) {
      return NextResponse.json({ 
        error: "Valid ID is required",
        code: "INVALID_ID" 
      }, { status: 400 });
    }

    // Check if record exists
    const existing = await db.select()
      .from(invoiceItems)
      .where(eq(invoiceItems.id, parseInt(id)))
      .limit(1);

    if (existing.length === 0) {
      return NextResponse.json({ 
        error: 'Invoice item not found',
        code: 'NOT_FOUND' 
      }, { status: 404 });
    }

    // Delete record
    const deleted = await db.delete(invoiceItems)
      .where(eq(invoiceItems.id, parseInt(id)))
      .returning();

    return NextResponse.json({
      message: 'Invoice item deleted successfully',
      deleted: deleted[0]
    }, { status: 200 });

  } catch (error) {
    console.error('DELETE error:', error);
    return NextResponse.json({ 
      error: safeErrorMessage(error) 
    }, { status: 500 });
  }
}