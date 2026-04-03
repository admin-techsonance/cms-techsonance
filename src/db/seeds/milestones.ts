import { db } from '@/db';
import { milestones } from '@/db/schema';

async function main() {
    const currentTimestamp = new Date().toISOString();
    
    const sampleMilestones = [
        {
            projectId: 1,
            title: 'Phase 1: Core Features',
            description: 'Development of essential features including user authentication, dashboard, and basic project management capabilities. This phase focuses on establishing the foundational functionality of the application.',
            dueDate: new Date('2024-03-15').toISOString(),
            status: 'in_progress',
            createdAt: currentTimestamp,
            updatedAt: currentTimestamp,
        },
        {
            projectId: 1,
            title: 'Phase 2: Payment Integration',
            description: 'Integration of payment gateway systems, invoice generation, and billing automation. This milestone includes setting up Stripe/PayPal integration and implementing subscription management.',
            dueDate: new Date('2024-04-30').toISOString(),
            status: 'pending',
            createdAt: currentTimestamp,
            updatedAt: currentTimestamp,
        },
        {
            projectId: 3,
            title: 'Database Design',
            description: 'Complete database schema design and implementation including tables, relationships, indexes, and optimization. All data models have been finalized and migration scripts are ready.',
            dueDate: new Date('2024-02-10').toISOString(),
            status: 'completed',
            createdAt: currentTimestamp,
            updatedAt: currentTimestamp,
        },
        {
            projectId: 3,
            title: 'API Development',
            description: 'RESTful API development with proper authentication, authorization, and data validation. Currently implementing CRUD operations for all major entities and setting up API documentation.',
            dueDate: new Date('2024-03-25').toISOString(),
            status: 'in_progress',
            createdAt: currentTimestamp,
            updatedAt: currentTimestamp,
        },
        {
            projectId: 2,
            title: 'Requirements Gathering',
            description: 'Comprehensive requirements analysis including stakeholder interviews, user story creation, and documentation of functional and non-functional requirements. All requirements have been reviewed and approved.',
            dueDate: new Date('2024-01-20').toISOString(),
            status: 'completed',
            createdAt: currentTimestamp,
            updatedAt: currentTimestamp,
        },
        {
            projectId: 2,
            title: 'UI/UX Design',
            description: 'Creation of wireframes, mockups, and interactive prototypes. This milestone includes user flow diagrams, design system creation, and high-fidelity designs for all major screens.',
            dueDate: new Date('2024-03-05').toISOString(),
            status: 'pending',
            createdAt: currentTimestamp,
            updatedAt: currentTimestamp,
        },
    ];

    await db.insert(milestones).values(sampleMilestones);
    
    console.log('✅ Milestones seeder completed successfully');
}

main().catch((error) => {
    console.error('❌ Seeder failed:', error);
});