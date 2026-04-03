import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { readerDevices } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Authentication check
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required', code: 'AUTHENTICATION_REQUIRED' },
        { status: 401 }
      );
    }

    // Authorization check - require admin role
    if (user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Admin access required', code: 'INSUFFICIENT_PERMISSIONS' },
        { status: 403 }
      );
    }

    // Validate ID parameter
    const id = params.id;
    if (!id || isNaN(parseInt(id))) {
      return NextResponse.json(
        { error: 'Valid ID is required', code: 'INVALID_ID' },
        { status: 400 }
      );
    }

    // Check if reader exists
    const existingReader = await db
      .select()
      .from(readerDevices)
      .where(eq(readerDevices.id, parseInt(id)))
      .limit(1);

    if (existingReader.length === 0) {
      return NextResponse.json(
        { error: 'Reader device not found', code: 'READER_NOT_FOUND' },
        { status: 404 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { name, location, type, status, ipAddress, config } = body;

    // Validate type if provided
    const validTypes = ['usb', 'ethernet', 'mobile'];
    if (type !== undefined && !validTypes.includes(type)) {
      return NextResponse.json(
        {
          error: `Invalid type. Must be one of: ${validTypes.join(', ')}`,
          code: 'INVALID_TYPE',
        },
        { status: 400 }
      );
    }

    // Validate status if provided
    const validStatuses = ['online', 'offline', 'maintenance'];
    if (status !== undefined && !validStatuses.includes(status)) {
      return NextResponse.json(
        {
          error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
          code: 'INVALID_STATUS',
        },
        { status: 400 }
      );
    }

    // Validate config is valid JSON if provided
    if (config !== undefined && config !== null) {
      try {
        if (typeof config === 'string') {
          JSON.parse(config);
        } else if (typeof config === 'object') {
          // If it's already an object, convert to string
          JSON.stringify(config);
        } else {
          throw new Error('Config must be a valid JSON string or object');
        }
      } catch (error) {
        return NextResponse.json(
          {
            error: 'Config must be valid JSON',
            code: 'INVALID_CONFIG_JSON',
          },
          { status: 400 }
        );
      }
    }

    // Prepare update data
    const updateData: {
      name?: string;
      location?: string;
      type?: string;
      status?: string;
      ipAddress?: string;
      config?: string;
      updatedAt: string;
    } = {
      updatedAt: new Date().toISOString(),
    };

    // Only include fields that are provided
    if (name !== undefined) {
      updateData.name = typeof name === 'string' ? name.trim() : name;
    }
    if (location !== undefined) {
      updateData.location = typeof location === 'string' ? location.trim() : location;
    }
    if (type !== undefined) {
      updateData.type = type;
    }
    if (status !== undefined) {
      updateData.status = status;
    }
    if (ipAddress !== undefined) {
      updateData.ipAddress = typeof ipAddress === 'string' ? ipAddress.trim() : ipAddress;
    }
    if (config !== undefined) {
      // Convert config to string if it's an object
      updateData.config = typeof config === 'string' ? config : JSON.stringify(config);
    }

    // Update reader device
    const updatedReader = await db
      .update(readerDevices)
      .set(updateData)
      .where(eq(readerDevices.id, parseInt(id)))
      .returning();

    if (updatedReader.length === 0) {
      return NextResponse.json(
        { error: 'Failed to update reader device', code: 'UPDATE_FAILED' },
        { status: 500 }
      );
    }

    return NextResponse.json(updatedReader[0], { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Internal server error: ' + (error instanceof Error ? error.message : 'Unknown error'),
        code: 'INTERNAL_SERVER_ERROR',
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    if (user.role !== 'admin') {
      return NextResponse.json({
        error: 'Insufficient permissions. Admin required',
        code: 'FORBIDDEN'
      }, { status: 403 });
    }

    const id = parseInt(params.id);
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    const deleted = await db.delete(readerDevices)
      .where(eq(readerDevices.id, id))
      .returning();

    if (deleted.length === 0) {
      return NextResponse.json({ error: 'Reader not found' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Reader deleted successfully' }, { status: 200 });

  } catch (error) {
    console.error('DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}