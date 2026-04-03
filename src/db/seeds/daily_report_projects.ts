import { db } from '@/db';
import { dailyReportProjects } from '@/db/schema';

async function main() {
    const sampleDailyReportProjects = [
        // Daily Report 1 (2024-01-15) - 3 projects
        {
            dailyReportId: 1,
            projectId: 1,
            description: 'Implemented user authentication with JWT tokens and refresh token mechanism',
            trackerTime: 240,
            isCoveredWork: true,
            isExtraWork: false,
            createdAt: new Date('2024-01-15').toISOString(),
        },
        {
            dailyReportId: 1,
            projectId: 3,
            description: 'Fixed payment gateway integration bugs related to webhook handling',
            trackerTime: 180,
            isCoveredWork: true,
            isExtraWork: false,
            createdAt: new Date('2024-01-15').toISOString(),
        },
        {
            dailyReportId: 1,
            projectId: 1,
            description: 'Code review and bug fixes for product catalog module',
            trackerTime: 60,
            isCoveredWork: true,
            isExtraWork: true,
            createdAt: new Date('2024-01-15').toISOString(),
        },
        
        // Daily Report 2 (2024-01-16) - 2 projects
        {
            dailyReportId: 2,
            projectId: 3,
            description: 'Developed REST API endpoints for product catalog with pagination and filters',
            trackerTime: 300,
            isCoveredWork: true,
            isExtraWork: false,
            createdAt: new Date('2024-01-16').toISOString(),
        },
        {
            dailyReportId: 2,
            projectId: 1,
            description: 'Database optimization and query improvements for user dashboard',
            trackerTime: 180,
            isCoveredWork: true,
            isExtraWork: false,
            createdAt: new Date('2024-01-16').toISOString(),
        },
        
        // Daily Report 3 (2024-01-17) - 3 projects
        {
            dailyReportId: 3,
            projectId: 1,
            description: 'Created dashboard components with React and implemented real-time updates',
            trackerTime: 270,
            isCoveredWork: true,
            isExtraWork: false,
            createdAt: new Date('2024-01-17').toISOString(),
        },
        {
            dailyReportId: 3,
            projectId: 3,
            description: 'Implemented customer management API with CRUD operations',
            trackerTime: 150,
            isCoveredWork: true,
            isExtraWork: false,
            createdAt: new Date('2024-01-17').toISOString(),
        },
        {
            dailyReportId: 3,
            projectId: 1,
            description: 'Fixed responsive design issues on mobile devices',
            trackerTime: 60,
            isCoveredWork: false,
            isExtraWork: true,
            createdAt: new Date('2024-01-17').toISOString(),
        },
        
        // Daily Report 4 (2024-01-18) - 2 projects
        {
            dailyReportId: 4,
            projectId: 3,
            description: 'Unit tests for CRM modules and integration testing',
            trackerTime: 210,
            isCoveredWork: true,
            isExtraWork: false,
            createdAt: new Date('2024-01-18').toISOString(),
        },
        {
            dailyReportId: 4,
            projectId: 1,
            description: 'Implemented email notification system with template engine',
            trackerTime: 270,
            isCoveredWork: true,
            isExtraWork: false,
            createdAt: new Date('2024-01-18').toISOString(),
        },
        
        // Daily Report 5 (2024-01-19) - 3 projects
        {
            dailyReportId: 5,
            projectId: 1,
            description: 'Performance optimization for image upload and processing',
            trackerTime: 180,
            isCoveredWork: true,
            isExtraWork: false,
            createdAt: new Date('2024-01-19').toISOString(),
        },
        {
            dailyReportId: 5,
            projectId: 3,
            description: 'Implemented search functionality with Elasticsearch integration',
            trackerTime: 240,
            isCoveredWork: true,
            isExtraWork: false,
            createdAt: new Date('2024-01-19').toISOString(),
        },
        {
            dailyReportId: 5,
            projectId: 1,
            description: 'Documentation updates and API endpoint testing',
            trackerTime: 60,
            isCoveredWork: true,
            isExtraWork: false,
            createdAt: new Date('2024-01-19').toISOString(),
        },
    ];

    await db.insert(dailyReportProjects).values(sampleDailyReportProjects);
    
    console.log('✅ Daily report projects seeder completed successfully');
}

main().catch((error) => {
    console.error('❌ Seeder failed:', error);
});