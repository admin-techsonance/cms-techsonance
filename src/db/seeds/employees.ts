import { db } from '@/db';
import { employees } from '@/db/schema';

async function main() {
    const currentTimestamp = new Date().toISOString();
    
    const sampleEmployees = [
        {
            userId: 1,
            employeeId: 'EMP001',
            department: 'Management',
            designation: 'CEO',
            dateOfJoining: '2020-01-01',
            dateOfBirth: '1985-05-15',
            skills: JSON.stringify(['Leadership', 'Strategy', 'Management']),
            salary: 120000,
            status: 'active',
            createdAt: currentTimestamp,
            updatedAt: currentTimestamp,
        },
        {
            userId: 2,
            employeeId: 'EMP002',
            department: 'Operations',
            designation: 'Project Manager',
            dateOfJoining: '2021-03-15',
            dateOfBirth: '1988-08-22',
            skills: JSON.stringify(['Project Management', 'Agile', 'Scrum']),
            salary: 85000,
            status: 'active',
            createdAt: currentTimestamp,
            updatedAt: currentTimestamp,
        },
        {
            userId: 3,
            employeeId: 'EMP003',
            department: 'Development',
            designation: 'Senior Developer',
            dateOfJoining: '2021-06-01',
            dateOfBirth: '1990-12-10',
            skills: JSON.stringify(['React', 'Node.js', 'TypeScript']),
            salary: 95000,
            status: 'active',
            createdAt: currentTimestamp,
            updatedAt: currentTimestamp,
        },
        {
            userId: 4,
            employeeId: 'EMP004',
            department: 'Development',
            designation: 'Full Stack Developer',
            dateOfJoining: '2022-02-15',
            dateOfBirth: '1992-03-25',
            skills: JSON.stringify(['Next.js', 'Python', 'PostgreSQL']),
            salary: 90000,
            status: 'active',
            createdAt: currentTimestamp,
            updatedAt: currentTimestamp,
        }
    ];

    await db.insert(employees).values(sampleEmployees);
    
    console.log('✅ Employees seeder completed successfully');
}

main().catch((error) => {
    console.error('❌ Seeder failed:', error);
});