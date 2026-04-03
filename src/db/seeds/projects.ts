import { db } from '@/db';
import { projects } from '@/db/schema';

async function main() {
    const currentTimestamp = new Date().toISOString();
    
    const sampleProjects = [
        {
            name: 'E-commerce Platform',
            description: 'Build a modern e-commerce platform',
            clientId: 1,
            status: 'in_progress',
            priority: 'high',
            startDate: new Date('2024-01-15').toISOString(),
            endDate: new Date('2024-06-30').toISOString(),
            budget: 150000,
            createdBy: 1,
            createdAt: currentTimestamp,
            updatedAt: currentTimestamp,
        },
        {
            name: 'Mobile App Development',
            description: 'iOS and Android mobile application',
            clientId: 1,
            status: 'planning',
            priority: 'medium',
            startDate: new Date('2024-03-01').toISOString(),
            endDate: new Date('2024-08-31').toISOString(),
            budget: 80000,
            createdBy: 2,
            createdAt: currentTimestamp,
            updatedAt: currentTimestamp,
        },
        {
            name: 'CRM System',
            description: 'Custom CRM solution for retail',
            clientId: 2,
            status: 'in_progress',
            priority: 'high',
            startDate: new Date('2024-02-01').toISOString(),
            endDate: new Date('2024-07-31').toISOString(),
            budget: 120000,
            createdBy: 1,
            createdAt: currentTimestamp,
            updatedAt: currentTimestamp,
        },
        {
            name: 'Website Redesign',
            description: 'Complete website overhaul',
            clientId: 2,
            status: 'completed',
            priority: 'medium',
            startDate: new Date('2023-10-01').toISOString(),
            endDate: new Date('2024-01-31').toISOString(),
            budget: 50000,
            createdBy: 2,
            createdAt: currentTimestamp,
            updatedAt: currentTimestamp,
        },
        {
            name: 'Data Analytics Dashboard',
            description: 'Real-time analytics platform',
            clientId: 3,
            status: 'on_hold',
            priority: 'low',
            startDate: new Date('2024-04-01').toISOString(),
            endDate: new Date('2024-09-30').toISOString(),
            budget: 60000,
            createdBy: 2,
            createdAt: currentTimestamp,
            updatedAt: currentTimestamp,
        },
    ];

    await db.insert(projects).values(sampleProjects);
    
    console.log('✅ Projects seeder completed successfully');
}

main().catch((error) => {
    console.error('❌ Seeder failed:', error);
});