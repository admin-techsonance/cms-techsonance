import { db } from '@/db';
import { companyHolidays } from '@/db/schema';

async function main() {
    const sampleHolidays = [
        {
            date: '2025-01-01',
            reason: 'New Year\'s Day',
            year: 2025,
            createdAt: new Date().toISOString(),
        },
        {
            date: '2025-01-26',
            reason: 'Republic Day',
            year: 2025,
            createdAt: new Date().toISOString(),
        },
        {
            date: '2025-03-14',
            reason: 'Holi Festival',
            year: 2025,
            createdAt: new Date().toISOString(),
        },
        {
            date: '2025-04-18',
            reason: 'Good Friday',
            year: 2025,
            createdAt: new Date().toISOString(),
        },
        {
            date: '2025-06-15',
            reason: 'Company Foundation Day',
            year: 2025,
            createdAt: new Date().toISOString(),
        },
        {
            date: '2025-08-15',
            reason: 'Independence Day',
            year: 2025,
            createdAt: new Date().toISOString(),
        },
        {
            date: '2025-10-02',
            reason: 'Gandhi Jayanti',
            year: 2025,
            createdAt: new Date().toISOString(),
        },
        {
            date: '2025-10-20',
            reason: 'Diwali Festival',
            year: 2025,
            createdAt: new Date().toISOString(),
        },
        {
            date: '2025-12-25',
            reason: 'Christmas Day',
            year: 2025,
            createdAt: new Date().toISOString(),
        },
        {
            date: '2025-12-31',
            reason: 'Year End Holiday',
            year: 2025,
            createdAt: new Date().toISOString(),
        }
    ];

    await db.insert(companyHolidays).values(sampleHolidays);
    
    console.log('✅ Company holidays seeder completed successfully');
}

main().catch((error) => {
    console.error('❌ Seeder failed:', error);
});