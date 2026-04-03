import { db } from '@/db';
import { clients } from '@/db/schema';

async function main() {
    const currentTimestamp = new Date().toISOString();
    
    const sampleClients = [
        {
            companyName: 'WebCraft Solutions',
            contactPerson: 'Michael Brown',
            email: 'contact@webcraftsolutions.com',
            phone: '+1-555-0101',
            address: '450 Tech Boulevard, Suite 200, San Francisco, CA 94105',
            industry: 'E-commerce',
            status: 'active',
            createdBy: 1,
            createdAt: currentTimestamp,
            updatedAt: currentTimestamp,
            notes: 'Leading e-commerce platform provider',
        },
        {
            companyName: 'Digital Innovators Inc',
            contactPerson: 'Jennifer Lee',
            email: 'info@digitalinnovators.com',
            phone: '+1-555-0102',
            address: '890 Innovation Drive, Building C, Austin, TX 78701',
            industry: 'Technology',
            status: 'active',
            createdBy: 1,
            createdAt: currentTimestamp,
            updatedAt: currentTimestamp,
            notes: 'Innovation-focused tech company',
        },
        {
            companyName: 'Global Retail Corp',
            contactPerson: 'Robert Wilson',
            email: 'contact@globalretail.com',
            phone: '+1-555-0103',
            address: '1200 Commerce Street, Floor 15, New York, NY 10013',
            industry: 'Retail',
            status: 'prospect',
            createdBy: 2,
            createdAt: currentTimestamp,
            updatedAt: currentTimestamp,
            notes: 'Potential client for CRM system',
        },
    ];

    await db.insert(clients).values(sampleClients);
    
    console.log('✅ Clients seeder completed successfully');
}

main().catch((error) => {
    console.error('❌ Seeder failed:', error);
});