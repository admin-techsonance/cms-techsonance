import { db } from '@/db';
import { inquiryFeeds } from '@/db/schema';

async function main() {
    const sampleInquiryFeeds = [
        {
            inquiryId: 1,
            commentedBy: 1,
            technology: 'React, Node.js, MongoDB',
            description: 'Client wants a complete e-commerce solution with payment integration',
            createdAt: new Date('2025-11-01T09:00:00').toISOString(),
        },
        {
            inquiryId: 1,
            commentedBy: 2,
            technology: null,
            description: 'Budget discussed: $50,000 - $80,000',
            createdAt: new Date('2025-11-02T10:30:00').toISOString(),
        },
        {
            inquiryId: 2,
            commentedBy: 1,
            technology: 'Next.js, PostgreSQL',
            description: 'Meeting scheduled for next Tuesday at 2 PM',
            createdAt: new Date('2025-11-03T11:00:00').toISOString(),
        },
        {
            inquiryId: 2,
            commentedBy: 3,
            technology: null,
            description: 'Client prefers React for frontend and Node.js for backend',
            createdAt: new Date('2025-11-04T14:20:00').toISOString(),
        },
        {
            inquiryId: 3,
            commentedBy: 2,
            technology: 'Vue.js, Laravel',
            description: 'Estimation sent: 3 months development time',
            createdAt: new Date('2025-11-05T09:45:00').toISOString(),
        },
        {
            inquiryId: 3,
            commentedBy: 1,
            technology: null,
            description: 'Client asked for additional features: chat support and analytics',
            createdAt: new Date('2025-11-06T15:30:00').toISOString(),
        },
        {
            inquiryId: 4,
            commentedBy: 3,
            technology: 'React Native, Firebase',
            description: 'Project timeline needs to be 2 months instead of 3',
            createdAt: new Date('2025-11-07T10:15:00').toISOString(),
        },
        {
            inquiryId: 4,
            commentedBy: 2,
            technology: null,
            description: 'Waiting for client response on proposal',
            createdAt: new Date('2025-11-08T13:00:00').toISOString(),
        },
        {
            inquiryId: 5,
            commentedBy: 1,
            technology: 'Angular, .NET Core',
            description: 'Client accepted the proposal, starting next week',
            createdAt: new Date('2025-11-09T11:30:00').toISOString(),
        },
        {
            inquiryId: 6,
            commentedBy: 2,
            technology: null,
            description: 'Client went with another agency',
            createdAt: new Date('2025-11-10T09:00:00').toISOString(),
        },
        {
            inquiryId: 6,
            commentedBy: 3,
            technology: 'Python Django, MySQL',
            description: 'Budget too low for project scope',
            createdAt: new Date('2025-11-11T14:45:00').toISOString(),
        },
        {
            inquiryId: 7,
            commentedBy: 1,
            technology: 'React, Node.js, MongoDB',
            description: 'Technical requirements clarified',
            createdAt: new Date('2025-11-12T10:00:00').toISOString(),
        },
        {
            inquiryId: 7,
            commentedBy: 2,
            technology: null,
            description: 'Sent rough estimation document',
            createdAt: new Date('2025-11-13T15:20:00').toISOString(),
        },
        {
            inquiryId: 8,
            commentedBy: 3,
            technology: 'Next.js, PostgreSQL',
            description: 'Follow-up call scheduled',
            createdAt: new Date('2025-11-14T11:15:00').toISOString(),
        },
        {
            inquiryId: 9,
            commentedBy: 1,
            technology: null,
            description: 'Project requirements finalized',
            createdAt: new Date('2025-11-15T09:30:00').toISOString(),
        },
    ];

    await db.insert(inquiryFeeds).values(sampleInquiryFeeds);
    
    console.log('✅ Inquiry feeds seeder completed successfully');
}

main().catch((error) => {
    console.error('❌ Seeder failed:', error);
});