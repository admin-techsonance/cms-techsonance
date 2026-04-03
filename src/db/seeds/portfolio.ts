import { db } from '@/db';
import { portfolio } from '@/db/schema';

async function main() {
    const samplePortfolio = [
        {
            title: 'E-commerce Platform for Fashion Retailer',
            description: 'Complete e-commerce solution with custom features',
            clientName: 'Fashion Forward Inc',
            category: 'E-commerce',
            technologies: JSON.stringify(['React', 'Node.js', 'PostgreSQL', 'Stripe']),
            status: 'active',
            projectUrl: 'https://fashionforward.example.com',
            thumbnail: null,
            images: null,
            createdAt: new Date().toISOString(),
        },
        {
            title: 'Healthcare Management System',
            description: 'Patient management and scheduling system',
            clientName: 'MediCare Clinic',
            category: 'Healthcare',
            technologies: JSON.stringify(['Next.js', 'TypeScript', 'MongoDB', 'AWS']),
            status: 'active',
            projectUrl: 'https://medicare.example.com',
            thumbnail: null,
            images: null,
            createdAt: new Date().toISOString(),
        },
        {
            title: 'Real Estate Marketplace',
            description: 'Property listing and management platform',
            clientName: 'Property Plus',
            category: 'Real Estate',
            technologies: JSON.stringify(['Vue.js', 'Laravel', 'MySQL']),
            status: 'archived',
            projectUrl: null,
            thumbnail: null,
            images: null,
            createdAt: new Date().toISOString(),
        }
    ];

    await db.insert(portfolio).values(samplePortfolio);
    
    console.log('✅ Portfolio seeder completed successfully');
}

main().catch((error) => {
    console.error('❌ Seeder failed:', error);
});