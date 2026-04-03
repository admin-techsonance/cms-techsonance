import { db } from '@/db';
import { expenses } from '@/db/schema';

async function main() {
    const sampleExpenses = [
        {
            category: 'Software Licenses',
            description: 'Annual IDE licenses',
            amount: 5000,
            projectId: null,
            employeeId: null,
            date: '2024-02-01',
            status: 'approved',
            receiptUrl: 'https://example.com/receipts/software-licenses-2024.pdf',
            createdAt: new Date().toISOString(),
        },
        {
            category: 'Cloud Hosting',
            description: 'AWS monthly costs',
            amount: 2500,
            projectId: 1,
            employeeId: null,
            date: '2024-02-15',
            status: 'approved',
            receiptUrl: 'https://example.com/receipts/aws-feb-2024.pdf',
            createdAt: new Date().toISOString(),
        },
        {
            category: 'Office Supplies',
            description: 'Development equipment',
            amount: 1200,
            projectId: null,
            employeeId: 3,
            date: '2024-02-20',
            status: 'approved',
            receiptUrl: 'https://example.com/receipts/office-supplies-feb.pdf',
            createdAt: new Date().toISOString(),
        },
        {
            category: 'Training',
            description: 'Conference attendance',
            amount: 3000,
            projectId: null,
            employeeId: 4,
            date: '2024-03-01',
            status: 'pending',
            receiptUrl: null,
            createdAt: new Date().toISOString(),
        },
        {
            category: 'Marketing',
            description: 'Social media advertising',
            amount: 1500,
            projectId: 2,
            employeeId: null,
            date: '2024-03-05',
            status: 'approved',
            receiptUrl: 'https://example.com/receipts/marketing-march.pdf',
            createdAt: new Date().toISOString(),
        },
        {
            category: 'Travel',
            description: 'Client meeting expenses',
            amount: 800,
            projectId: 3,
            employeeId: 2,
            date: '2024-03-10',
            status: 'pending',
            receiptUrl: null,
            createdAt: new Date().toISOString(),
        },
    ];

    await db.insert(expenses).values(sampleExpenses);
    
    console.log('✅ Expenses seeder completed successfully');
}

main().catch((error) => {
    console.error('❌ Seeder failed:', error);
});