import { db } from '@/db';
import { notifications } from '@/db/schema';

async function main() {
    const sampleNotifications = [
        {
            userId: 1,
            title: 'New Project Assigned',
            message: 'You have been assigned to E-commerce Platform project',
            type: 'info',
            link: '/projects/1',
            isRead: true,
            createdAt: new Date().toISOString(),
        },
        {
            userId: 2,
            title: 'Invoice Paid',
            message: 'Invoice INV-2024-001 has been paid',
            type: 'success',
            link: '/invoices/1',
            isRead: true,
            createdAt: new Date().toISOString(),
        },
        {
            userId: 3,
            title: 'Task Due Soon',
            message: 'Task "Implement user authentication" is due tomorrow',
            type: 'warning',
            link: '/tasks/1',
            isRead: false,
            createdAt: new Date().toISOString(),
        },
        {
            userId: 3,
            title: 'New Ticket Assigned',
            message: 'Support ticket TICK-001 assigned to you',
            type: 'info',
            link: '/tickets/1',
            isRead: false,
            createdAt: new Date().toISOString(),
        },
        {
            userId: 4,
            title: 'Code Review Required',
            message: 'Your pull request needs review',
            type: 'warning',
            link: '/tasks/5',
            isRead: false,
            createdAt: new Date().toISOString(),
        },
        {
            userId: 2,
            title: 'Project Deadline',
            message: 'CRM System deadline approaching',
            type: 'error',
            link: '/projects/3',
            isRead: false,
            createdAt: new Date().toISOString(),
        },
    ];

    await db.insert(notifications).values(sampleNotifications);
    
    console.log('✅ Notifications seeder completed successfully');
}

main().catch((error) => {
    console.error('❌ Seeder failed:', error);
});