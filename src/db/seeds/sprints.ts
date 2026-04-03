import { db } from '@/db';
import { sprints } from '@/db/schema';

async function main() {
    const sampleSprints = [
        {
            projectId: 1,
            name: 'Sprint 3',
            goal: 'Implement shopping cart functionality with checkout flow',
            startDate: '2024-10-14',
            endDate: '2024-10-25',
            status: 'completed',
            createdAt: new Date('2024-10-14').toISOString(),
            updatedAt: new Date('2024-10-25').toISOString(),
        },
        {
            projectId: 3,
            name: 'Q4 Sprint 1',
            goal: 'Build CRM dashboard with customer insights and analytics',
            startDate: '2024-11-04',
            endDate: '2024-11-15',
            status: 'completed',
            createdAt: new Date('2024-11-04').toISOString(),
            updatedAt: new Date('2024-11-15').toISOString(),
        },
        {
            projectId: 1,
            name: 'Sprint 5',
            goal: 'Implement payment gateway integration and order processing',
            startDate: '2024-12-09',
            endDate: '2024-12-20',
            status: 'active',
            createdAt: new Date('2024-12-09').toISOString(),
            updatedAt: new Date('2024-12-09').toISOString(),
        },
        {
            projectId: 3,
            name: 'December Sprint',
            goal: 'API development for customer management module',
            startDate: '2024-12-23',
            endDate: '2025-01-03',
            status: 'planning',
            createdAt: new Date('2024-12-18').toISOString(),
            updatedAt: new Date('2024-12-18').toISOString(),
        },
        {
            projectId: 1,
            name: 'January Sprint 1',
            goal: 'Mobile responsive design implementation and UX improvements',
            startDate: '2025-01-06',
            endDate: '2025-01-17',
            status: 'planning',
            createdAt: new Date('2024-12-18').toISOString(),
            updatedAt: new Date('2024-12-18').toISOString(),
        },
    ];

    await db.insert(sprints).values(sampleSprints);
    
    console.log('✅ Sprints seeder completed successfully');
}

main().catch((error) => {
    console.error('❌ Seeder failed:', error);
});