import { db } from '@/db';
import { tasks } from '@/db/schema';

async function main() {
    const currentTimestamp = new Date().toISOString();
    
    const sampleTasks = [
        // Project 1 (E-commerce Platform) - 3 tasks
        {
            projectId: 1,
            milestoneId: null,
            title: 'Implement user authentication system',
            description: 'Set up secure authentication with JWT tokens, password hashing, and session management. Include login, registration, and password reset functionality.',
            assignedTo: 3,
            status: 'todo',
            priority: 'high',
            dueDate: new Date('2024-12-20').toISOString(),
            createdAt: currentTimestamp,
            updatedAt: currentTimestamp,
        },
        {
            projectId: 1,
            milestoneId: null,
            title: 'Design and implement shopping cart database schema',
            description: 'Create database tables for shopping cart, cart items, and inventory management. Include proper relationships and indexing for optimal performance.',
            assignedTo: 4,
            status: 'in_progress',
            priority: 'high',
            dueDate: new Date('2024-12-18').toISOString(),
            createdAt: currentTimestamp,
            updatedAt: currentTimestamp,
        },
        {
            projectId: 1,
            milestoneId: null,
            title: 'Create REST API endpoints for product catalog',
            description: 'Build API endpoints for CRUD operations on products, categories, and inventory. Include filtering, sorting, and pagination support.',
            assignedTo: 3,
            status: 'review',
            priority: 'medium',
            dueDate: new Date('2024-12-15').toISOString(),
            createdAt: currentTimestamp,
            updatedAt: currentTimestamp,
        },
        
        // Project 3 (CRM System) - 3 tasks
        {
            projectId: 3,
            milestoneId: null,
            title: 'Build customer dashboard frontend components',
            description: 'Develop React components for customer management dashboard including customer list, detail view, and search functionality with responsive design.',
            assignedTo: 4,
            status: 'in_progress',
            priority: 'high',
            dueDate: new Date('2024-12-22').toISOString(),
            createdAt: currentTimestamp,
            updatedAt: currentTimestamp,
        },
        {
            projectId: 3,
            milestoneId: null,
            title: 'Implement contact management API',
            description: 'Create backend API for managing customer contacts, interactions, and communication history. Include email integration and activity tracking.',
            assignedTo: 3,
            status: 'review',
            priority: 'medium',
            dueDate: new Date('2024-12-19').toISOString(),
            createdAt: currentTimestamp,
            updatedAt: currentTimestamp,
        },
        {
            projectId: 3,
            milestoneId: null,
            title: 'Write comprehensive unit tests for CRM modules',
            description: 'Develop unit tests for customer management, contact tracking, and reporting modules. Achieve minimum 80% code coverage.',
            assignedTo: 4,
            status: 'done',
            priority: 'low',
            dueDate: new Date('2024-12-10').toISOString(),
            createdAt: currentTimestamp,
            updatedAt: currentTimestamp,
        },
        
        // Project 2 (Mobile App) - 2 tasks
        {
            projectId: 2,
            milestoneId: null,
            title: 'Design mobile app UI/UX screens',
            description: 'Create mockups and prototypes for all mobile app screens including onboarding, home, profile, and settings. Follow iOS and Android design guidelines.',
            assignedTo: 3,
            status: 'todo',
            priority: 'high',
            dueDate: new Date('2024-12-25').toISOString(),
            createdAt: currentTimestamp,
            updatedAt: currentTimestamp,
        },
        {
            projectId: 2,
            milestoneId: null,
            title: 'Set up mobile app development environment',
            description: 'Configure React Native development environment, set up CI/CD pipeline, and establish coding standards and documentation structure.',
            assignedTo: 4,
            status: 'todo',
            priority: 'medium',
            dueDate: new Date('2024-12-23').toISOString(),
            createdAt: currentTimestamp,
            updatedAt: currentTimestamp,
        },
        
        // Project 4 (Website Redesign) - 2 tasks
        {
            projectId: 4,
            milestoneId: null,
            title: 'Migrate existing content to new CMS',
            description: 'Transfer all pages, blog posts, and media files from old website to new content management system. Verify all links and formatting.',
            assignedTo: 3,
            status: 'done',
            priority: 'medium',
            dueDate: new Date('2024-12-08').toISOString(),
            createdAt: currentTimestamp,
            updatedAt: currentTimestamp,
        },
        {
            projectId: 4,
            milestoneId: null,
            title: 'Implement SEO optimization and analytics',
            description: 'Set up meta tags, structured data, XML sitemap, and integrate Google Analytics. Optimize page load times and mobile responsiveness.',
            assignedTo: 4,
            status: 'done',
            priority: 'low',
            dueDate: new Date('2024-12-05').toISOString(),
            createdAt: currentTimestamp,
            updatedAt: currentTimestamp,
        },
    ];

    await db.insert(tasks).values(sampleTasks);
    
    console.log('✅ Tasks seeder completed successfully');
}

main().catch((error) => {
    console.error('❌ Seeder failed:', error);
});