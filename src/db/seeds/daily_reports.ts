import { db } from '@/db';
import { dailyReports } from '@/db/schema';

async function main() {
    const today = new Date('2024-12-20');
    
    const sampleDailyReports = [
        {
            userId: 3,
            date: new Date('2024-12-14').toISOString().split('T')[0],
            availableStatus: 'present',
            createdAt: new Date('2024-12-14T18:00:00').toISOString(),
            updatedAt: new Date('2024-12-14T18:00:00').toISOString(),
        },
        {
            userId: 3,
            date: new Date('2024-12-15').toISOString().split('T')[0],
            availableStatus: 'present',
            createdAt: new Date('2024-12-15T18:00:00').toISOString(),
            updatedAt: new Date('2024-12-15T18:00:00').toISOString(),
        },
        {
            userId: 3,
            date: new Date('2024-12-16').toISOString().split('T')[0],
            availableStatus: 'half_day',
            createdAt: new Date('2024-12-16T18:00:00').toISOString(),
            updatedAt: new Date('2024-12-16T18:00:00').toISOString(),
        },
        {
            userId: 3,
            date: new Date('2024-12-17').toISOString().split('T')[0],
            availableStatus: 'present',
            createdAt: new Date('2024-12-17T18:00:00').toISOString(),
            updatedAt: new Date('2024-12-17T18:00:00').toISOString(),
        },
        {
            userId: 3,
            date: new Date('2024-12-18').toISOString().split('T')[0],
            availableStatus: 'early_leave',
            createdAt: new Date('2024-12-18T18:00:00').toISOString(),
            updatedAt: new Date('2024-12-18T18:00:00').toISOString(),
        },
    ];

    await db.insert(dailyReports).values(sampleDailyReports);
    
    console.log('✅ Daily reports seeder completed successfully');
}

main().catch((error) => {
    console.error('❌ Seeder failed:', error);
});