import { db } from '@/db';
import { tickets } from '@/db/schema';

async function main() {
    const currentTimestamp = new Date().toISOString();
    
    const sampleTickets = [
        {
            ticketNumber: 'TICK-001',
            clientId: 1,
            subject: 'Login Issues',
            description: 'Users unable to login to the platform',
            priority: 'urgent',
            status: 'in_progress',
            assignedTo: 3,
            createdAt: currentTimestamp,
            updatedAt: currentTimestamp,
        },
        {
            ticketNumber: 'TICK-002',
            clientId: 1,
            subject: 'Payment Gateway Error',
            description: 'Payment processing returning errors',
            priority: 'high',
            status: 'resolved',
            assignedTo: 4,
            createdAt: currentTimestamp,
            updatedAt: currentTimestamp,
        },
        {
            ticketNumber: 'TICK-003',
            clientId: 2,
            subject: 'Feature Request: Dark Mode',
            description: 'Request to add dark mode theme',
            priority: 'low',
            status: 'open',
            assignedTo: null,
            createdAt: currentTimestamp,
            updatedAt: currentTimestamp,
        },
        {
            ticketNumber: 'TICK-004',
            clientId: 2,
            subject: 'Performance Degradation',
            description: 'App loading slowly during peak hours',
            priority: 'high',
            status: 'in_progress',
            assignedTo: 3,
            createdAt: currentTimestamp,
            updatedAt: currentTimestamp,
        },
        {
            ticketNumber: 'TICK-005',
            clientId: 1,
            subject: 'Export Functionality',
            description: 'Need CSV export for reports',
            priority: 'medium',
            status: 'open',
            assignedTo: 4,
            createdAt: currentTimestamp,
            updatedAt: currentTimestamp,
        }
    ];

    await db.insert(tickets).values(sampleTickets);
    
    console.log('✅ Tickets seeder completed successfully');
}

main().catch((error) => {
    console.error('❌ Seeder failed:', error);
});