import { db } from '@/db';
import { inquiries } from '@/db/schema';

async function main() {
    const sampleInquiries = [
        {
            aliasName: 'TechStart Solutions',
            tag: 'need_estimation',
            status: 'lead',
            dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            appStatus: 'open',
            isFavourite: false,
            createdBy: 1,
            createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
            updatedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        },
        {
            aliasName: 'HealthCare Plus',
            tag: 'need_estimation',
            status: 'follow_up',
            dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            appStatus: 'open',
            isFavourite: true,
            createdBy: 2,
            createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
            updatedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
        },
        {
            aliasName: 'FinanceFlow Inc',
            tag: 'need_estimation',
            status: 'lead',
            dueDate: null,
            appStatus: 'open',
            isFavourite: false,
            createdBy: 1,
            createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
            updatedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
        },
        {
            aliasName: 'EduLearn Platform',
            tag: 'rough_estimation',
            status: 'follow_up',
            dueDate: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            appStatus: 'open',
            isFavourite: true,
            createdBy: 2,
            createdAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
            updatedAt: new Date(Date.now() - 18 * 24 * 60 * 60 * 1000).toISOString(),
        },
        {
            aliasName: 'RetailHub Co',
            tag: 'rough_estimation',
            status: 'lead',
            dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            appStatus: 'open',
            isFavourite: false,
            createdBy: 1,
            createdAt: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString(),
            updatedAt: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString(),
        },
        {
            aliasName: 'LogisticsPro',
            tag: 'scheduling_meeting',
            status: 'hired',
            dueDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            appStatus: 'close',
            isFavourite: true,
            createdBy: 2,
            createdAt: new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString(),
            updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        },
        {
            aliasName: 'FoodDelivery App',
            tag: 'scheduling_meeting',
            status: 'rejected_client',
            dueDate: null,
            appStatus: 'close',
            isFavourite: false,
            createdBy: 1,
            createdAt: new Date(Date.now() - 22 * 24 * 60 * 60 * 1000).toISOString(),
            updatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        },
        {
            aliasName: 'TravelBooking Site',
            tag: 'need_schedule_meeting',
            status: 'invite_lead',
            dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            appStatus: 'open',
            isFavourite: false,
            createdBy: 2,
            createdAt: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString(),
            updatedAt: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString(),
        },
        {
            aliasName: 'RealEstate Portal',
            tag: 'hired_someone_else',
            status: 'hired_someone_else',
            dueDate: null,
            appStatus: 'close',
            isFavourite: false,
            createdBy: 1,
            createdAt: new Date(Date.now() - 18 * 24 * 60 * 60 * 1000).toISOString(),
            updatedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
        },
        {
            aliasName: 'FitnessTracker App',
            tag: 'hired',
            status: 'budget_low',
            dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            appStatus: 'open',
            isFavourite: false,
            createdBy: 2,
            createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
            updatedAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
        },
    ];

    await db.insert(inquiries).values(sampleInquiries);
    
    console.log('✅ Inquiries seeder completed successfully');
}

main().catch((error) => {
    console.error('❌ Seeder failed:', error);
});