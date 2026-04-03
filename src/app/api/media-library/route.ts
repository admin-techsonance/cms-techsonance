import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { mediaLibrary, users } from '@/db/schema';
import { eq, like, and, or, desc } from 'drizzle-orm';

const VALID_FILE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'video/mp4',
  'video/mpeg',
  'video/quicktime',
  'audio/mpeg',
  'audio/wav',
  'text/plain',
  'application/zip',
  'application/x-rar-compressed'
];

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    // Single record fetch
    if (id) {
      if (!id || isNaN(parseInt(id))) {
        return NextResponse.json(
          { error: 'Valid ID is required', code: 'INVALID_ID' },
          { status: 400 }
        );
      }

      const record = await db
        .select()
        .from(mediaLibrary)
        .where(eq(mediaLibrary.id, parseInt(id)))
        .limit(1);

      if (record.length === 0) {
        return NextResponse.json(
          { error: 'Media file not found', code: 'NOT_FOUND' },
          { status: 404 }
        );
      }

      return NextResponse.json(record[0], { status: 200 });
    }

    // List with pagination, search, and filtering
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '10'), 100);
    const offset = parseInt(searchParams.get('offset') ?? '0');
    const search = searchParams.get('search');
    const fileType = searchParams.get('fileType');
    const uploadedBy = searchParams.get('uploadedBy');

    let query = db.select().from(mediaLibrary);

    // Build WHERE conditions
    const conditions = [];

    if (search) {
      conditions.push(like(mediaLibrary.name, `%${search}%`));
    }

    if (fileType) {
      conditions.push(eq(mediaLibrary.fileType, fileType));
    }

    if (uploadedBy) {
      const uploadedByInt = parseInt(uploadedBy);
      if (!isNaN(uploadedByInt)) {
        conditions.push(eq(mediaLibrary.uploadedBy, uploadedByInt));
      }
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    // Apply sorting, pagination
    const results = await query
      .orderBy(desc(mediaLibrary.createdAt))
      .limit(limit)
      .offset(offset);

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
    const { name, fileUrl, fileType, fileSize, uploadedBy } = body;

    // Validate required fields
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Name is required and must be a non-empty string', code: 'MISSING_NAME' },
        { status: 400 }
      );
    }

    if (!fileUrl || typeof fileUrl !== 'string' || fileUrl.trim().length === 0) {
      return NextResponse.json(
        { error: 'File URL is required and must be a non-empty string', code: 'MISSING_FILE_URL' },
        { status: 400 }
      );
    }

    if (!fileType || typeof fileType !== 'string' || fileType.trim().length === 0) {
      return NextResponse.json(
        { error: 'File type is required and must be a non-empty string', code: 'MISSING_FILE_TYPE' },
        { status: 400 }
      );
    }

    // Validate fileType is in allowed list
    if (!VALID_FILE_TYPES.includes(fileType.toLowerCase())) {
      return NextResponse.json(
        {
          error: `Invalid file type. Allowed types: ${VALID_FILE_TYPES.join(', ')}`,
          code: 'INVALID_FILE_TYPE'
        },
        { status: 400 }
      );
    }

    if (!fileSize || typeof fileSize !== 'number') {
      return NextResponse.json(
        { error: 'File size is required and must be a number', code: 'MISSING_FILE_SIZE' },
        { status: 400 }
      );
    }

    // Validate fileSize is positive integer
    if (fileSize <= 0 || !Number.isInteger(fileSize)) {
      return NextResponse.json(
        { error: 'File size must be a positive integer (bytes)', code: 'INVALID_FILE_SIZE' },
        { status: 400 }
      );
    }

    if (!uploadedBy || typeof uploadedBy !== 'number') {
      return NextResponse.json(
        { error: 'Uploaded by user ID is required and must be a number', code: 'MISSING_UPLOADED_BY' },
        { status: 400 }
      );
    }

    // Validate uploadedBy exists in users table
    const userExists = await db
      .select()
      .from(users)
      .where(eq(users.id, uploadedBy))
      .limit(1);

    if (userExists.length === 0) {
      return NextResponse.json(
        { error: 'User not found for uploadedBy field', code: 'USER_NOT_FOUND' },
        { status: 400 }
      );
    }

    // Create media file record
    const newMediaFile = await db
      .insert(mediaLibrary)
      .values({
        name: name.trim(),
        fileUrl: fileUrl.trim(),
        fileType: fileType.toLowerCase().trim(),
        fileSize,
        uploadedBy,
        createdAt: new Date().toISOString()
      })
      .returning();

    return NextResponse.json(newMediaFile[0], { status: 201 });
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

    const mediaId = parseInt(id);

    // Check if record exists
    const existingRecord = await db
      .select()
      .from(mediaLibrary)
      .where(eq(mediaLibrary.id, mediaId))
      .limit(1);

    if (existingRecord.length === 0) {
      return NextResponse.json(
        { error: 'Media file not found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { name, fileUrl, fileType, fileSize, uploadedBy } = body;

    const updates: Record<string, any> = {};

    // Validate and add name if provided
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return NextResponse.json(
          { error: 'Name must be a non-empty string', code: 'INVALID_NAME' },
          { status: 400 }
        );
      }
      updates.name = name.trim();
    }

    // Validate and add fileUrl if provided
    if (fileUrl !== undefined) {
      if (typeof fileUrl !== 'string' || fileUrl.trim().length === 0) {
        return NextResponse.json(
          { error: 'File URL must be a non-empty string', code: 'INVALID_FILE_URL' },
          { status: 400 }
        );
      }
      updates.fileUrl = fileUrl.trim();
    }

    // Validate and add fileType if provided
    if (fileType !== undefined) {
      if (typeof fileType !== 'string' || fileType.trim().length === 0) {
        return NextResponse.json(
          { error: 'File type must be a non-empty string', code: 'INVALID_FILE_TYPE' },
          { status: 400 }
        );
      }
      if (!VALID_FILE_TYPES.includes(fileType.toLowerCase())) {
        return NextResponse.json(
          {
            error: `Invalid file type. Allowed types: ${VALID_FILE_TYPES.join(', ')}`,
            code: 'INVALID_FILE_TYPE'
          },
          { status: 400 }
        );
      }
      updates.fileType = fileType.toLowerCase().trim();
    }

    // Validate and add fileSize if provided
    if (fileSize !== undefined) {
      if (typeof fileSize !== 'number') {
        return NextResponse.json(
          { error: 'File size must be a number', code: 'INVALID_FILE_SIZE' },
          { status: 400 }
        );
      }
      if (fileSize <= 0 || !Number.isInteger(fileSize)) {
        return NextResponse.json(
          { error: 'File size must be a positive integer (bytes)', code: 'INVALID_FILE_SIZE' },
          { status: 400 }
        );
      }
      updates.fileSize = fileSize;
    }

    // Validate and add uploadedBy if provided
    if (uploadedBy !== undefined) {
      if (typeof uploadedBy !== 'number') {
        return NextResponse.json(
          { error: 'Uploaded by must be a number', code: 'INVALID_UPLOADED_BY' },
          { status: 400 }
        );
      }

      // Validate uploadedBy exists in users table
      const userExists = await db
        .select()
        .from(users)
        .where(eq(users.id, uploadedBy))
        .limit(1);

      if (userExists.length === 0) {
        return NextResponse.json(
          { error: 'User not found for uploadedBy field', code: 'USER_NOT_FOUND' },
          { status: 400 }
        );
      }

      updates.uploadedBy = uploadedBy;
    }

    // Check if there are any updates
    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields provided for update', code: 'NO_UPDATES' },
        { status: 400 }
      );
    }

    // Perform update
    const updatedRecord = await db
      .update(mediaLibrary)
      .set(updates)
      .where(eq(mediaLibrary.id, mediaId))
      .returning();

    return NextResponse.json(updatedRecord[0], { status: 200 });
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

    const mediaId = parseInt(id);

    // Check if record exists
    const existingRecord = await db
      .select()
      .from(mediaLibrary)
      .where(eq(mediaLibrary.id, mediaId))
      .limit(1);

    if (existingRecord.length === 0) {
      return NextResponse.json(
        { error: 'Media file not found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    // Delete the record
    const deletedRecord = await db
      .delete(mediaLibrary)
      .where(eq(mediaLibrary.id, mediaId))
      .returning();

    return NextResponse.json(
      {
        message: 'Media file deleted successfully',
        deletedRecord: deletedRecord[0]
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