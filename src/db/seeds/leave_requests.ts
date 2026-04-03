import { db } from '@/db';
import { leaveRequests } from '@/db/schema';

async function main() {
    const currentTimestamp = new Date().toISOString();
    
    const sampleLeaveRequests = [
        {
            employeeId: 2,
            leaveType: 'vacation',
            startDate: '2024-04-15',
            endDate: '2024-04-19',
            reason: 'Family vacation',
            status: 'approved',
            approvedBy: 1,
            createdAt: currentTimestamp,
            updatedAt: currentTimestamp,
        },
        {
            employeeId: 3,
            leaveType: 'sick',
            startDate: '2024-03-10',
            endDate: '2024-03-11',
            reason: 'Medical appointment',
            status: 'approved',
            approvedBy: 2,
            createdAt: currentTimestamp,
            updatedAt: currentTimestamp,
        },
        {
            employeeId: 4,
            leaveType: 'casual',
            startDate: '2024-04-01',
            endDate: '2024-04-01',
            reason: 'Personal errands',
            status: 'pending',
            approvedBy: null,
            createdAt: currentTimestamp,
            updatedAt: currentTimestamp,
        },
        {
            employeeId: 3,
            leaveType: 'vacation',
            startDate: '2024-05-20',
            endDate: '2024-05-24',
            reason: 'Summer vacation',
            status: 'pending',
            approvedBy: null,
            createdAt: currentTimestamp,
            updatedAt: currentTimestamp,
        },
    ];

    await db.insert(leaveRequests).values(sampleLeaveRequests);
    
    console.log('✅ Leave requests seeder completed successfully');
}

main().catch((error) => {
    console.error('❌ Seeder failed:', error);
});