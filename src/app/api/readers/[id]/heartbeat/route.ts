import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { readerDevices } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;

    // Validate ID
    if (!id || isNaN(parseInt(id))) {
      return NextResponse.json(
        {
          error: 'Valid reader ID is required',
          code: 'INVALID_ID',
        },
        { status: 400 }
      );
    }

    const readerId = parseInt(id);
    const currentTimestamp = new Date().toISOString();

    // Check if reader exists
    const existingReader = await db
      .select()
      .from(readerDevices)
      .where(eq(readerDevices.id, readerId))
      .limit(1);

    if (existingReader.length === 0) {
      return NextResponse.json(
        {
          error: 'Reader device not found',
          code: 'READER_NOT_FOUND',
        },
        { status: 404 }
      );
    }

    const reader = existingReader[0];

    // Determine new status
    let newStatus = reader.status;
    if (reader.status === 'offline') {
      newStatus = 'online';
    }
    // If status is 'maintenance', keep it as 'maintenance'
    // Otherwise keep current status

    // Update reader with heartbeat and status
    const updatedReader = await db
      .update(readerDevices)
      .set({
        lastHeartbeat: currentTimestamp,
        status: newStatus,
        updatedAt: currentTimestamp,
      })
      .where(eq(readerDevices.id, readerId))
      .returning();

    return NextResponse.json(
      {
        message: 'Heartbeat received successfully',
        reader: updatedReader[0],
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('POST /api/readers/[id]/heartbeat error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error: ' + (error as Error).message,
        code: 'INTERNAL_ERROR',
      },
      { status: 500 }
    );
  }
}