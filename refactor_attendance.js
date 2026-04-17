const fs = require('fs');
const path = require('path');

const target = path.join(__dirname, 'src/app/dashboard/attendance/page.tsx');
let content = fs.readFileSync(target, 'utf8');

// 1. Rename Component
content = content.replace(/export default function MyAccountPage\(\) \{/g, 'export default function AttendancePage() {');

// 2. Change page titles
content = content.replace(/Employee Leave & Attendance Management/g, 'Employee Attendance Management');
content = content.replace(/Manage all employee leaves, attendance, and company holidays/g, 'Manage all employee attendance globally');
content = content.replace(/Manage your leaves, attendance, and view company holidays/g, 'Manage and view your attendance records');

// 3. Remove Tabs Triggers
content = content.replace(/<TabsTrigger value="all-leaves">.*?<\/TabsTrigger>/gs, '');
content = content.replace(/<TabsTrigger value="all-screens">.*?<\/TabsTrigger>/gs, '');
content = content.replace(/<TabsTrigger value="leave">.*?<\/TabsTrigger>/gs, '');
content = content.replace(/<TabsTrigger value="holidays">.*?<\/TabsTrigger>/gs, '');
content = content.replace(/<TabsList className=\{isFullAccessUser \? "grid w-full grid-cols-5" : "grid w-full grid-cols-3"\}>/g, '<TabsList className={isFullAccessUser ? "grid w-full grid-cols-2" : "grid w-full grid-cols-1"}>');

// 4. Remove TabsContents By Boundaries
const removeTabContent = (value) => {
    const regex = new RegExp(`\\{\\/\\*.*?\\*\\/\\}\\s*(\\{isFullAccessUser && \\(\\s*)?<TabsContent value="${value}">.*?<\\/TabsContent>(\\s*\\)\\})?`, 'gs');
    content = content.replace(regex, '');
};

// Instead of regex which might fail on nested, let's use a robust string cutter for known lines if regex fails.
// But RegExp with `.*?` (non-greedy) usually works since there are no nested <TabsContent>
content = content.replace(/\{\/\* Admin\/Manager: All Leaves Tab \*\/}.*?<\/TabsContent>\n\s*\)\}/gs, '');
content = content.replace(/\{\/\* Admin\/Manager: All Screens Tab \*\/}.*?<\/TabsContent>\n\s*\)\}/gs, '');
content = content.replace(/\{\/\* Employee: Leave Request Tab \*\/}.*?<\/TabsContent>/gs, '');
content = content.replace(/<TabsContent value="holidays">.*?<\/TabsContent>/gs, '');

// Wait, the regex might miss some things. Let me just replace the exact Tab blocks.
content = content.replace(/<TabsContent value="all-leaves">.*?<\/TabsContent>/gs, '');
content = content.replace(/<TabsContent value="all-screens">.*?<\/TabsContent>/gs, '');
content = content.replace(/<TabsContent value="leave">.*?<\/TabsContent>/gs, '');

// Also remove external LeaveRequestDialog
content = content.replace(/<LeaveRequestDialog.*?onSuccess=\{.*?\}\n\s*\/>/gs, '');

// Remove viewingLeave Dialog entirely 
content = content.replace(/<Dialog open=\{viewingLeave !== null}.*?<\/Dialog>/gs, '');

fs.writeFileSync(target, content, 'utf8');
console.log('Attendance initial cut applied.');
