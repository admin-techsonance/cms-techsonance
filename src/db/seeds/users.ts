import { db } from '@/db';
import { users } from '@/db/schema';
import bcrypt from 'bcrypt';

async function main() {
    const currentTimestamp = new Date().toISOString();
    
    // Hash the password properly with bcrypt
    const hashedPassword = await bcrypt.hash('password123', 10);
    
    const sampleUsers = [
        {
            email: 'admin@techsonance.com',
            password: hashedPassword,
            firstName: 'Admin',
            lastName: 'User',
            role: 'admin',
            avatarUrl: null,
            phone: '+1-555-0101',
            createdAt: currentTimestamp,
            updatedAt: currentTimestamp,
            lastLogin: null,
            isActive: true,
            twoFactorEnabled: false,
        },
        {
            email: 'pm@techsonance.com',
            password: hashedPassword,
            firstName: 'Sarah',
            lastName: 'Johnson',
            role: 'project_manager',
            avatarUrl: null,
            phone: '+1-555-0102',
            createdAt: currentTimestamp,
            updatedAt: currentTimestamp,
            lastLogin: null,
            isActive: true,
            twoFactorEnabled: false,
        },
        {
            email: 'dev1@techsonance.com',
            password: hashedPassword,
            firstName: 'John',
            lastName: 'Smith',
            role: 'developer',
            avatarUrl: null,
            phone: '+1-555-0103',
            createdAt: currentTimestamp,
            updatedAt: currentTimestamp,
            lastLogin: null,
            isActive: true,
            twoFactorEnabled: false,
        },
        {
            email: 'dev2@techsonance.com',
            password: hashedPassword,
            firstName: 'Emily',
            lastName: 'Davis',
            role: 'developer',
            avatarUrl: null,
            phone: '+1-555-0104',
            createdAt: currentTimestamp,
            updatedAt: currentTimestamp,
            lastLogin: null,
            isActive: true,
            twoFactorEnabled: false,
        },
        {
            email: 'client@webcraftsolutions.com',
            password: hashedPassword,
            firstName: 'Michael',
            lastName: 'Brown',
            role: 'client',
            avatarUrl: null,
            phone: '+1-555-0105',
            createdAt: currentTimestamp,
            updatedAt: currentTimestamp,
            lastLogin: null,
            isActive: true,
            twoFactorEnabled: false,
        }
    ];

    await db.insert(users).values(sampleUsers);
    
    console.log('✅ Users seeder completed successfully');
}

main().catch((error) => {
    console.error('❌ Seeder failed:', error);
});