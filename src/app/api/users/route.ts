import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq, like, and, or, desc } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import { safeErrorMessage } from '@/lib/constants';

const SALT_ROUNDS = 10;
const VALID_ROLES = [
  'admin',
  'hr_manager',
  'cms_administrator',
  'project_manager',
  'business_development',
  'developer',
  'qa_engineer',
  'devops_engineer',
  'ui_ux_designer',
  'digital_marketing',
  'business_analyst',
  'client'
] as const;
type UserRole = typeof VALID_ROLES[number];

// Email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Helper function to exclude password from response
function excludePassword<T extends { password?: string }>(user: T): Omit<T, 'password'> {
  const { password, ...userWithoutPassword } = user;
  return userWithoutPassword;
}

// Helper function to validate email format
function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email);
}

// Helper function to validate role
function isValidRole(role: string): role is UserRole {
  return VALID_ROLES.includes(role as UserRole);
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');

    // Single user by ID
    if (id) {
      if (!id || isNaN(parseInt(id))) {
        return NextResponse.json({ 
          error: "Valid ID is required",
          code: "INVALID_ID" 
        }, { status: 400 });
      }

      const user = await db.select()
        .from(users)
        .where(eq(users.id, parseInt(id)))
        .limit(1);

      if (user.length === 0) {
        return NextResponse.json({ 
          error: 'User not found',
          code: "USER_NOT_FOUND" 
        }, { status: 404 });
      }

      return NextResponse.json(excludePassword(user[0]));
    }

    // List users with pagination, search, and filters
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '10'), 100);
    const offset = parseInt(searchParams.get('offset') ?? '0');
    const search = searchParams.get('search');
    const role = searchParams.get('role');
    const isActive = searchParams.get('isActive');

    let query = db.select().from(users);

    // Build where conditions
    const conditions = [];

    // Search by email, firstName, or lastName
    if (search) {
      conditions.push(
        or(
          like(users.email, `%${search}%`),
          like(users.firstName, `%${search}%`),
          like(users.lastName, `%${search}%`)
        )
      );
    }

    // Filter by role
    if (role) {
      if (!isValidRole(role)) {
        return NextResponse.json({ 
          error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}`,
          code: "INVALID_ROLE" 
        }, { status: 400 });
      }
      conditions.push(eq(users.role, role));
    }

    // Filter by isActive status
    if (isActive !== null && isActive !== undefined) {
      const isActiveBoolean = isActive === 'true';
      conditions.push(eq(users.isActive, isActiveBoolean));
    }

    // Apply conditions if any exist
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    const results = await query
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .offset(offset);

    // Exclude passwords from all results
    const sanitizedResults = results.map(user => excludePassword(user));

    return NextResponse.json(sanitizedResults);
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
    const { 
      email, 
      password, 
      firstName, 
      lastName, 
      role,
      avatarUrl,
      phone,
      twoFactorEnabled,
      isActive
    } = body;

    // Validate required fields
    if (!email) {
      return NextResponse.json({ 
        error: "Email is required",
        code: "MISSING_EMAIL" 
      }, { status: 400 });
    }

    if (!password) {
      return NextResponse.json({ 
        error: "Password is required",
        code: "MISSING_PASSWORD" 
      }, { status: 400 });
    }

    if (!firstName) {
      return NextResponse.json({ 
        error: "First name is required",
        code: "MISSING_FIRST_NAME" 
      }, { status: 400 });
    }

    if (!lastName) {
      return NextResponse.json({ 
        error: "Last name is required",
        code: "MISSING_LAST_NAME" 
      }, { status: 400 });
    }

    if (!role) {
      return NextResponse.json({ 
        error: "Role is required",
        code: "MISSING_ROLE" 
      }, { status: 400 });
    }

    // Validate email format
    if (!isValidEmail(email.trim().toLowerCase())) {
      return NextResponse.json({ 
        error: "Invalid email format",
        code: "INVALID_EMAIL_FORMAT" 
      }, { status: 400 });
    }

    // Validate role enum
    if (!isValidRole(role)) {
      return NextResponse.json({ 
        error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}`,
        code: "INVALID_ROLE" 
      }, { status: 400 });
    }

    // Check if email already exists
    const existingUser = await db.select()
      .from(users)
      .where(eq(users.email, email.trim().toLowerCase()))
      .limit(1);

    if (existingUser.length > 0) {
      return NextResponse.json({ 
        error: "Email already exists",
        code: "EMAIL_EXISTS" 
      }, { status: 400 });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    // Prepare user data
    const now = new Date().toISOString();
    const userData = {
      email: email.trim().toLowerCase(),
      password: hashedPassword,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      role,
      avatarUrl: avatarUrl?.trim() || null,
      phone: phone?.trim() || null,
      twoFactorEnabled: twoFactorEnabled ?? false,
      isActive: isActive ?? true,
      createdAt: now,
      updatedAt: now,
      lastLogin: null
    };

    const newUser = await db.insert(users)
      .values(userData)
      .returning();

    return NextResponse.json(excludePassword(newUser[0]), { status: 201 });
  } catch (error) {
    console.error('POST error:', error);
    return NextResponse.json({ 
      error: safeErrorMessage(error) 
    }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');

    if (!id || isNaN(parseInt(id))) {
      return NextResponse.json({ 
        error: "Valid ID is required",
        code: "INVALID_ID" 
      }, { status: 400 });
    }

    const body = await request.json();
    const { 
      email, 
      password, 
      firstName, 
      lastName, 
      role,
      avatarUrl,
      phone,
      twoFactorEnabled,
      isActive,
      lastLogin
    } = body;

    // Check if user exists
    const existingUser = await db.select()
      .from(users)
      .where(eq(users.id, parseInt(id)))
      .limit(1);

    if (existingUser.length === 0) {
      return NextResponse.json({ 
        error: 'User not found',
        code: "USER_NOT_FOUND" 
      }, { status: 404 });
    }

    // Build update object
    const updates: any = {
      updatedAt: new Date().toISOString()
    };

    // Validate and add email if provided
    if (email !== undefined) {
      if (!isValidEmail(email.trim().toLowerCase())) {
        return NextResponse.json({ 
          error: "Invalid email format",
          code: "INVALID_EMAIL_FORMAT" 
        }, { status: 400 });
      }

      // Check if email is already taken by another user
      const emailCheck = await db.select()
        .from(users)
        .where(eq(users.email, email.trim().toLowerCase()))
        .limit(1);

      if (emailCheck.length > 0 && emailCheck[0].id !== parseInt(id)) {
        return NextResponse.json({ 
          error: "Email already exists",
          code: "EMAIL_EXISTS" 
        }, { status: 400 });
      }

      updates.email = email.trim().toLowerCase();
    }

    // Hash password if provided
    if (password !== undefined && password !== '') {
      updates.password = await bcrypt.hash(password, SALT_ROUNDS);
    }

    // Validate role if provided
    if (role !== undefined) {
      if (!isValidRole(role)) {
        return NextResponse.json({ 
          error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}`,
          code: "INVALID_ROLE" 
        }, { status: 400 });
      }
      updates.role = role;
    }

    // Add other fields if provided
    if (firstName !== undefined) updates.firstName = firstName.trim();
    if (lastName !== undefined) updates.lastName = lastName.trim();
    if (avatarUrl !== undefined) updates.avatarUrl = avatarUrl?.trim() || null;
    if (phone !== undefined) updates.phone = phone?.trim() || null;
    if (twoFactorEnabled !== undefined) updates.twoFactorEnabled = twoFactorEnabled;
    if (isActive !== undefined) updates.isActive = isActive;
    if (lastLogin !== undefined) updates.lastLogin = lastLogin;

    const updatedUser = await db.update(users)
      .set(updates)
      .where(eq(users.id, parseInt(id)))
      .returning();

    if (updatedUser.length === 0) {
      return NextResponse.json({ 
        error: 'User not found',
        code: "USER_NOT_FOUND" 
      }, { status: 404 });
    }

    return NextResponse.json(excludePassword(updatedUser[0]));
  } catch (error) {
    console.error('PUT error:', error);
    return NextResponse.json({ 
      error: safeErrorMessage(error) 
    }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');

    if (!id || isNaN(parseInt(id))) {
      return NextResponse.json({ 
        error: "Valid ID is required",
        code: "INVALID_ID" 
      }, { status: 400 });
    }

    // Check if user exists
    const existingUser = await db.select()
      .from(users)
      .where(eq(users.id, parseInt(id)))
      .limit(1);

    if (existingUser.length === 0) {
      return NextResponse.json({ 
        error: 'User not found',
        code: "USER_NOT_FOUND" 
      }, { status: 404 });
    }

    // Soft delete by setting isActive to false
    const deletedUser = await db.update(users)
      .set({ 
        isActive: false,
        updatedAt: new Date().toISOString()
      })
      .where(eq(users.id, parseInt(id)))
      .returning();

    if (deletedUser.length === 0) {
      return NextResponse.json({ 
        error: 'User not found',
        code: "USER_NOT_FOUND" 
      }, { status: 404 });
    }

    return NextResponse.json({ 
      message: 'User deleted successfully (soft delete)',
      user: excludePassword(deletedUser[0])
    });
  } catch (error) {
    console.error('DELETE error:', error);
    return NextResponse.json({ 
      error: safeErrorMessage(error) 
    }, { status: 500 });
  }
}