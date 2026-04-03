import { db } from '@/db';
import { companySettings } from '@/db/schema';

async function main() {
    const sampleSettings = [
        {
            companyName: 'TechSonance InfoTech',
            email: 'contact@techsonance.com',
            phone: '+1-555-TECH-01',
            address: '123 Innovation Drive, Tech City, TC 12345',
            website: 'https://techsonance.com',
            primaryColor: '#3B82F6',
            secondaryColor: '#10B981',
            logoUrl: '/logo.png',
            smtpHost: 'smtp.gmail.com',
            smtpPort: 587,
            smtpUser: 'noreply@techsonance.com',
            smtpPassword: null,
            updatedAt: new Date().toISOString(),
        }
    ];

    await db.insert(companySettings).values(sampleSettings);
    
    console.log('✅ Company settings seeder completed successfully');
}

main().catch((error) => {
    console.error('❌ Seeder failed:', error);
});