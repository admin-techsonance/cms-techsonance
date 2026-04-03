import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { clients, users } from '@/db/schema';
import { eq, like, and, or, desc } from 'drizzle-orm';

// Email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Valid status enum values
const VALID_STATUSES = ['active', 'inactive', 'prospect'];

// Validate email format
function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email);
}

// Validate status value
function isValidStatus(status: string): boolean {
  return VALID_STATUSES.includes(status);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    // Single client by ID
    if (id) {
      if (!id || isNaN(parseInt(id))) {
        return NextResponse.json(
          { error: 'Valid ID is required', code: 'INVALID_ID' },
          { status: 400 }
        );
      }

      const client = await db
        .select()
        .from(clients)
        .where(eq(clients.id, parseInt(id)))
        .limit(1);

      if (client.length === 0) {
        return NextResponse.json(
          { error: 'Client not found', code: 'CLIENT_NOT_FOUND' },
          { status: 404 }
        );
      }

      return NextResponse.json(client[0], { status: 200 });
    }

    // List clients with pagination, search, and filtering
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '10'), 100);
    const offset = parseInt(searchParams.get('offset') ?? '0');
    const search = searchParams.get('search');
    const status = searchParams.get('status');
    const industry = searchParams.get('industry');
    const sort = searchParams.get('sort') ?? 'createdAt';
    const order = searchParams.get('order') ?? 'desc';

    let query = db.select().from(clients);

    // Build where conditions
    const conditions = [];

    // Search across companyName, contactPerson, and email
    if (search) {
      conditions.push(
        or(
          like(clients.companyName, `%${search}%`),
          like(clients.contactPerson, `%${search}%`),
          like(clients.email, `%${search}%`)
        )
      );
    }

    // Filter by status
    if (status) {
      if (!isValidStatus(status)) {
        return NextResponse.json(
          { 
            error: 'Invalid status value. Must be one of: active, inactive, prospect',
            code: 'INVALID_STATUS' 
          },
          { status: 400 }
        );
      }
      conditions.push(eq(clients.status, status));
    }

    // Filter by industry
    if (industry) {
      conditions.push(eq(clients.industry, industry));
    }

    // Apply conditions
    if (conditions.length > 0) {
      query = query.where(conditions.length === 1 ? conditions[0] : and(...conditions));
    }

    // Apply sorting
    const sortColumn = clients[sort as keyof typeof clients] || clients.createdAt;
    query = order === 'asc' ? query.orderBy(sortColumn) : query.orderBy(desc(sortColumn));

    // Apply pagination
    const results = await query.limit(limit).offset(offset);

    return NextResponse.json(results, { status: 200 });
  } catch (error) {
    console.error('GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error: ' + (error as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { companyName, contactPerson, email, phone, address, industry, notes, createdBy, status } = body;

    // Validate required fields
    if (!companyName || typeof companyName !== 'string' || companyName.trim() === '') {
      return NextResponse.json(
        { error: 'Company name is required', code: 'MISSING_COMPANY_NAME' },
        { status: 400 }
      );
    }

    if (!contactPerson || typeof contactPerson !== 'string' || contactPerson.trim() === '') {
      return NextResponse.json(
        { error: 'Contact person is required', code: 'MISSING_CONTACT_PERSON' },
        { status: 400 }
      );
    }

    if (!email || typeof email !== 'string' || email.trim() === '') {
      return NextResponse.json(
        { error: 'Email is required', code: 'MISSING_EMAIL' },
        { status: 400 }
      );
    }

    if (!createdBy || isNaN(parseInt(createdBy))) {
      return NextResponse.json(
        { error: 'Valid createdBy user ID is required', code: 'MISSING_CREATED_BY' },
        { status: 400 }
      );
    }

    // Validate email format
    const sanitizedEmail = email.trim().toLowerCase();
    if (!isValidEmail(sanitizedEmail)) {
      return NextResponse.json(
        { error: 'Invalid email format', code: 'INVALID_EMAIL_FORMAT' },
        { status: 400 }
      );
    }

    // Validate status if provided
    const clientStatus = status?.trim() || 'active';
    if (!isValidStatus(clientStatus)) {
      return NextResponse.json(
        { 
          error: 'Invalid status value. Must be one of: active, inactive, prospect',
          code: 'INVALID_STATUS' 
        },
        { status: 400 }
      );
    }

    // Verify createdBy user exists
    const userExists = await db
      .select()
      .from(users)
      .where(eq(users.id, parseInt(createdBy)))
      .limit(1);

    if (userExists.length === 0) {
      return NextResponse.json(
        { error: 'User with specified createdBy ID does not exist', code: 'USER_NOT_FOUND' },
        { status: 400 }
      );
    }

    // Prepare client data
    const now = new Date().toISOString();
    const clientData = {
      companyName: companyName.trim(),
      contactPerson: contactPerson.trim(),
      email: sanitizedEmail,
      phone: phone?.trim() || null,
      address: address?.trim() || null,
      industry: industry?.trim() || null,
      notes: notes?.trim() || null,
      status: clientStatus,
      createdBy: parseInt(createdBy),
      createdAt: now,
      updatedAt: now,
    };

    // Insert client
    const newClient = await db
      .insert(clients)
      .values(clientData)
      .returning();

    return NextResponse.json(newClient[0], { status: 201 });
  } catch (error) {
    console.error('POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error: ' + (error as Error).message },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id || isNaN(parseInt(id))) {
      return NextResponse.json(
        { error: 'Valid ID is required', code: 'INVALID_ID' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { companyName, contactPerson, email, phone, address, industry, notes, status } = body;

    // Check if client exists
    const existingClient = await db
      .select()
      .from(clients)
      .where(eq(clients.id, parseInt(id)))
      .limit(1);

    if (existingClient.length === 0) {
      return NextResponse.json(
        { error: 'Client not found', code: 'CLIENT_NOT_FOUND' },
        { status: 404 }
      );
    }

    // Validate fields if provided
    if (companyName !== undefined && (typeof companyName !== 'string' || companyName.trim() === '')) {
      return NextResponse.json(
        { error: 'Company name cannot be empty', code: 'INVALID_COMPANY_NAME' },
        { status: 400 }
      );
    }

    if (contactPerson !== undefined && (typeof contactPerson !== 'string' || contactPerson.trim() === '')) {
      return NextResponse.json(
        { error: 'Contact person cannot be empty', code: 'INVALID_CONTACT_PERSON' },
        { status: 400 }
      );
    }

    if (email !== undefined) {
      if (typeof email !== 'string' || email.trim() === '') {
        return NextResponse.json(
          { error: 'Email cannot be empty', code: 'INVALID_EMAIL' },
          { status: 400 }
        );
      }

      const sanitizedEmail = email.trim().toLowerCase();
      if (!isValidEmail(sanitizedEmail)) {
        return NextResponse.json(
          { error: 'Invalid email format', code: 'INVALID_EMAIL_FORMAT' },
          { status: 400 }
        );
      }
    }

    if (status !== undefined && !isValidStatus(status)) {
      return NextResponse.json(
        { 
          error: 'Invalid status value. Must be one of: active, inactive, prospect',
          code: 'INVALID_STATUS' 
        },
        { status: 400 }
      );
    }

    // Prepare update data (only include provided fields)
    const updateData: any = {
      updatedAt: new Date().toISOString(),
    };

    if (companyName !== undefined) updateData.companyName = companyName.trim();
    if (contactPerson !== undefined) updateData.contactPerson = contactPerson.trim();
    if (email !== undefined) updateData.email = email.trim().toLowerCase();
    if (phone !== undefined) updateData.phone = phone?.trim() || null;
    if (address !== undefined) updateData.address = address?.trim() || null;
    if (industry !== undefined) updateData.industry = industry?.trim() || null;
    if (notes !== undefined) updateData.notes = notes?.trim() || null;
    if (status !== undefined) updateData.status = status;

    // Update client
    const updated = await db
      .update(clients)
      .set(updateData)
      .where(eq(clients.id, parseInt(id)))
      .returning();

    return NextResponse.json(updated[0], { status: 200 });
  } catch (error) {
    console.error('PUT error:', error);
    return NextResponse.json(
      { error: 'Internal server error: ' + (error as Error).message },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id || isNaN(parseInt(id))) {
      return NextResponse.json(
        { error: 'Valid ID is required', code: 'INVALID_ID' },
        { status: 400 }
      );
    }

    // Check if client exists
    const existingClient = await db
      .select()
      .from(clients)
      .where(eq(clients.id, parseInt(id)))
      .limit(1);

    if (existingClient.length === 0) {
      return NextResponse.json(
        { error: 'Client not found', code: 'CLIENT_NOT_FOUND' },
        { status: 404 }
      );
    }

    // Soft delete by setting status to 'inactive'
    const deleted = await db
      .update(clients)
      .set({
        status: 'inactive',
        updatedAt: new Date().toISOString(),
      })
      .where(eq(clients.id, parseInt(id)))
      .returning();

    return NextResponse.json(
      {
        message: 'Client successfully deleted (soft delete)',
        client: deleted[0],
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('DELETE error:', error);
    return NextResponse.json(
      { error: 'Internal server error: ' + (error as Error).message },
      { status: 500 }
    );
  }
}