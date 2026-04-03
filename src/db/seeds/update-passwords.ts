import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';

async function main() {
    // Hash the password properly with bcrypt
    const hashedPassword = await bcrypt.hash('password123', 10);
    
    const emails = [
        'admin@techsonance.com',
        'pm@techsonance.com',
        'dev1@techsonance.com',
        'dev2@techsonance.com',
        'client@webcraftsolutions.com'
    ];

    for (const email of emails) {
        await db
            .update(users)
            .set({ password: hashedPassword })
            .where(eq(users.email, email));
        
        console.log(`✅ Updated password for ${email}`);
    }
    
    console.log('✅ All passwords updated successfully');
}

main().catch((error) => {
    console.error('❌ Update failed:', error);
});
