import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { users, sessions } from '@/db/schema';
import { eq, or } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import { getCurrentUser } from '@/lib/auth';
import { safeErrorMessage } from '@/lib/constants';

const SALT_ROUNDS = 10;

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

        // Fetch full user record from DB (shared getCurrentUser doesn't return password)
        const [fullUser] = await db.select().from(users).where(eq(users.id, currentUser.id)).limit(1);
        if (!fullUser) {
            return NextResponse.json(
                { error: 'User not found' },
                { status: 404 }
            );
        }

        // Verify current password
        const isPasswordValid = await bcrypt.compare(currentPassword, fullUser.password);

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
            { error: safeErrorMessage(error) },
            { status: 500 }
        );
    }
}
