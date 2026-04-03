import { db } from '@/db';
import { invoices } from '@/db/schema';

async function main() {
    const currentTimestamp = new Date().toISOString();
    
    const sampleInvoices = [
        {
            invoiceNumber: 'INV-2024-001',
            clientId: 1,
            projectId: 1,
            amount: 50000,
            tax: 5000,
            totalAmount: 55000,
            status: 'paid',
            dueDate: new Date('2024-02-15').toISOString(),
            paidDate: new Date('2024-02-10').toISOString(),
            notes: 'First milestone payment',
            createdAt: currentTimestamp,
            updatedAt: currentTimestamp,
        },
        {
            invoiceNumber: 'INV-2024-002',
            clientId: 1,
            projectId: 2,
            amount: 30000,
            tax: 3000,
            totalAmount: 33000,
            status: 'sent',
            dueDate: new Date('2024-03-31').toISOString(),
            paidDate: null,
            createdAt: currentTimestamp,
            updatedAt: currentTimestamp,
        },
        {
            invoiceNumber: 'INV-2024-003',
            clientId: 2,
            projectId: 3,
            amount: 40000,
            tax: 4000,
            totalAmount: 44000,
            status: 'paid',
            dueDate: new Date('2024-03-15').toISOString(),
            paidDate: new Date('2024-03-12').toISOString(),
            createdAt: currentTimestamp,
            updatedAt: currentTimestamp,
        },
        {
            invoiceNumber: 'INV-2024-004',
            clientId: 2,
            projectId: 4,
            amount: 50000,
            tax: 5000,
            totalAmount: 55000,
            status: 'paid',
            dueDate: new Date('2024-01-31').toISOString(),
            paidDate: new Date('2024-01-28').toISOString(),
            notes: 'Final payment',
            createdAt: currentTimestamp,
            updatedAt: currentTimestamp,
        },
        {
            invoiceNumber: 'INV-2024-005',
            clientId: 1,
            projectId: 1,
            amount: 45000,
            tax: 4500,
            totalAmount: 49500,
            status: 'overdue',
            dueDate: new Date('2024-02-01').toISOString(),
            paidDate: null,
            createdAt: currentTimestamp,
            updatedAt: currentTimestamp,
        }
    ];

    await db.insert(invoices).values(sampleInvoices);
    
    console.log('✅ Invoices seeder completed successfully');
}

main().catch((error) => {
    console.error('❌ Seeder failed:', error);
});