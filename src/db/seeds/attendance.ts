import { db } from '@/db';
import { attendance } from '@/db/schema';

async function main() {
    const sampleAttendance = [
        // Employee 1 - March 1st
        {
            employeeId: 1,
            date: '2024-03-01',
            checkIn: '09:00:00',
            checkOut: '18:00:00',
            status: 'present',
            notes: null,
        },
        // Employee 1 - March 4th
        {
            employeeId: 1,
            date: '2024-03-04',
            checkIn: '09:15:00',
            checkOut: '18:30:00',
            status: 'present',
            notes: 'Worked on project deadline',
        },
        // Employee 1 - March 5th
        {
            employeeId: 1,
            date: '2024-03-05',
            checkIn: '09:00:00',
            checkOut: '13:00:00',
            status: 'half_day',
            notes: 'Medical appointment in the afternoon',
        },
        // Employee 2 - March 1st
        {
            employeeId: 2,
            date: '2024-03-01',
            checkIn: '08:45:00',
            checkOut: '17:45:00',
            status: 'present',
            notes: null,
        },
        // Employee 2 - March 4th
        {
            employeeId: 2,
            date: '2024-03-04',
            checkIn: null,
            checkOut: null,
            status: 'leave',
            notes: 'Annual leave approved',
        },
        // Employee 2 - March 5th
        {
            employeeId: 2,
            date: '2024-03-05',
            checkIn: '09:00:00',
            checkOut: '18:15:00',
            status: 'present',
            notes: 'Client meeting attended',
        },
        // Employee 3 - March 1st
        {
            employeeId: 3,
            date: '2024-03-01',
            checkIn: '09:30:00',
            checkOut: '18:00:00',
            status: 'present',
            notes: 'Late due to traffic',
        },
        // Employee 3 - March 4th
        {
            employeeId: 3,
            date: '2024-03-04',
            checkIn: '09:00:00',
            checkOut: '18:45:00',
            status: 'present',
            notes: 'Extended hours for sprint completion',
        },
        // Employee 3 - March 5th
        {
            employeeId: 3,
            date: '2024-03-05',
            checkIn: '09:00:00',
            checkOut: '18:00:00',
            status: 'present',
            notes: null,
        },
        // Employee 4 - March 1st
        {
            employeeId: 4,
            date: '2024-03-01',
            checkIn: '09:00:00',
            checkOut: '14:00:00',
            status: 'half_day',
            notes: 'Personal emergency',
        },
        // Employee 4 - March 4th
        {
            employeeId: 4,
            date: '2024-03-04',
            checkIn: '08:50:00',
            checkOut: '18:10:00',
            status: 'present',
            notes: 'Team standup and code review',
        },
        // Employee 4 - March 5th
        {
            employeeId: 4,
            date: '2024-03-05',
            checkIn: '09:05:00',
            checkOut: '18:00:00',
            status: 'present',
            notes: null,
        },
    ];

    await db.insert(attendance).values(sampleAttendance);
    
    console.log('✅ Attendance seeder completed successfully');
}

main().catch((error) => {
    console.error('❌ Seeder failed:', error);
});