import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { users, sessions } from '@/db/schema';
import { eq, or } from 'drizzle-orm';
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

async function getCurrentUser(request: NextRequest) {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }

    const token = authHeader.substring(7);

    try {
        const [session] = await db.select().from(sessions).where(eq(sessions.token, token)).limit(1);

        if (!session) {
            return null;
        }

        const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
        return user || null;
    } catch (error) {
        console.error('Error fetching user:', error);
        return null;
    }
}

export async function PUT(request: NextRequest) {
    try {
        const currentUser = await getCurrentUser(request);

        if (!currentUser) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const body = await request.json();
        const { currentPassword, newPassword } = body;

        // Validate input
        if (!currentPassword || !newPassword) {
            return NextResponse.json(
                { error: 'Current password and new password are required' },
                { status: 400 }
            );
        }

        if (newPassword.length < 6) {
            return NextResponse.json(
                { error: 'New password must be at least 6 characters long' },
                { status: 400 }
            );
        }

        // Verify current password
        const isPasswordValid = await bcrypt.compare(currentPassword, currentUser.password);

        if (!isPasswordValid) {
            return NextResponse.json(
                { error: 'Current password is incorrect' },
                { status: 400 }
            );
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);

        // Update password in database
        await db.update(users)
            .set({
                password: hashedPassword,
                updatedAt: new Date().toISOString()
            })
            .where(eq(users.id, currentUser.id));

        return NextResponse.json(
            { message: 'Password updated successfully' },
            { status: 200 }
        );

    } catch (error) {
        console.error('Error changing password:', error);
        return NextResponse.json(
            { error: 'Failed to change password', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
