import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { readerDevices } from '@/db/schema';
import { eq, like, and, or, asc } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';

const VALID_TYPES = ['usb', 'ethernet', 'mobile'];
const VALID_STATUSES = ['online', 'offline', 'maintenance'];

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    if (user.role !== 'cms_administrator' && user.role !== 'hr_manager') {
      return NextResponse.json({ 
        error: 'Insufficient permissions. Admin or HR role required.',
        code: 'INSUFFICIENT_PERMISSIONS' 
      }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '10'), 100);
    const offset = parseInt(searchParams.get('offset') ?? '0');
    const statusFilter = searchParams.get('status');
    const typeFilter = searchParams.get('type');
    const locationFilter = searchParams.get('location');

    const conditions = [];

    if (statusFilter) {
      if (!VALID_STATUSES.includes(statusFilter)) {
        return NextResponse.json({ 
          error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`,
          code: 'INVALID_STATUS' 
        }, { status: 400 });
      }
      conditions.push(eq(readerDevices.status, statusFilter));
    }

    if (typeFilter) {
      if (!VALID_TYPES.includes(typeFilter)) {
        return NextResponse.json({ 
          error: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}`,
          code: 'INVALID_TYPE' 
        }, { status: 400 });
      }
      conditions.push(eq(readerDevices.type, typeFilter));
    }

    if (locationFilter) {
      conditions.push(like(readerDevices.location, `%${locationFilter}%`));
    }

    const results = await db.select()
      .from(readerDevices)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(readerDevices.name))
      .limit(limit)
      .offset(offset);

    return NextResponse.json(results, { status: 200 });
  } catch (error) {
    console.error('GET error:', error);
    return NextResponse.json({ 
      error: 'Internal server error: ' + (error instanceof Error ? error.message : 'Unknown error')
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    if (user.role !== 'cms_administrator') {
      return NextResponse.json({ 
        error: 'Insufficient permissions. Admin role required.',
        code: 'INSUFFICIENT_PERMISSIONS' 
      }, { status: 403 });
    }

    const body = await request.json();
    const { readerId, name, location, type, ipAddress, config } = body;

    if (!readerId || typeof readerId !== 'string' || readerId.trim() === '') {
      return NextResponse.json({ 
        error: 'readerId is required and must be a non-empty string',
        code: 'MISSING_READER_ID' 
      }, { status: 400 });
    }

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return NextResponse.json({ 
        error: 'name is required and must be a non-empty string',
        code: 'MISSING_NAME' 
      }, { status: 400 });
    }

    if (!location || typeof location !== 'string' || location.trim() === '') {
      return NextResponse.json({ 
        error: 'location is required and must be a non-empty string',
        code: 'MISSING_LOCATION' 
      }, { status: 400 });
    }

    if (!type || !VALID_TYPES.includes(type)) {
      return NextResponse.json({ 
        error: `type is required and must be one of: ${VALID_TYPES.join(', ')}`,
        code: 'INVALID_TYPE' 
      }, { status: 400 });
    }

    if (config && typeof config === 'string') {
      try {
        JSON.parse(config);
      } catch {
        return NextResponse.json({ 
          error: 'config must be a valid JSON string',
          code: 'INVALID_CONFIG_JSON' 
        }, { status: 400 });
      }
    }

    const existingReader = await db.select()
      .from(readerDevices)
      .where(eq(readerDevices.readerId, readerId.trim()))
      .limit(1);

    if (existingReader.length > 0) {
      return NextResponse.json({ 
        error: 'A reader device with this readerId already exists',
        code: 'READER_ID_EXISTS' 
      }, { status: 400 });
    }

    const now = new Date().toISOString();
    const newReader = await db.insert(readerDevices)
      .values({
        readerId: readerId.trim(),
        name: name.trim(),
        location: location.trim(),
        type,
        status: 'offline',
        ipAddress: ipAddress?.trim() || null,
        config: config || null,
        lastHeartbeat: null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return NextResponse.json(newReader[0], { status: 201 });
  } catch (error) {
    console.error('POST error:', error);
    return NextResponse.json({ 
      error: 'Internal server error: ' + (error instanceof Error ? error.message : 'Unknown error')
    }, { status: 500 });
  }
}