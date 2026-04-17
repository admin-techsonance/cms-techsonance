import re
import os

target = 'src/app/dashboard/attendance/page.tsx'

with open(target, 'r') as f:
    content = f.read()

# 1. Rename Component
content = content.replace('export default function MyAccountPage() {', 'export default function AttendancePage() {')

# 2. Change page titles
content = content.replace('Employee Leave & Attendance Management', 'Employee Attendance Management')

# 3. Remove Tabs Triggers
content = re.sub(r'<TabsTrigger value="all-leaves">.*?</TabsTrigger>', '', content, flags=re.DOTALL)
content = re.sub(r'<TabsTrigger value="all-screens">.*?</TabsTrigger>', '', content, flags=re.DOTALL)
content = re.sub(r'<TabsTrigger value="leave">.*?</TabsTrigger>', '', content, flags=re.DOTALL)
content = re.sub(r'<TabsTrigger value="holidays">.*?</TabsTrigger>', '', content, flags=re.DOTALL)
content = content.replace('<TabsList className={isFullAccessUser ? "grid w-full grid-cols-5" : "grid w-full grid-cols-3"}>', '<TabsList className={isFullAccessUser ? "grid w-full grid-cols-2" : "grid w-full grid-cols-1"}>')

# 4. Remove TabsContents By Boundaries
content = re.sub(r'\{\/\* Admin\/Manager: All Leaves Tab \*\/}.*?<\/TabsContent>\n\s*\)\}', '', content, flags=re.DOTALL)
content = re.sub(r'\{\/\* Admin\/Manager: Screens Tab \*\/}.*?<\/TabsContent>\n\s*\)\}', '', content, flags=re.DOTALL)
content = re.sub(r'\{\/\* Employee: Leave Tab - Keep existing code \*\/}.*?<\/TabsContent>\n\s*\)\}', '', content, flags=re.DOTALL)
content = re.sub(r'\{\/\* Company Holidays Tab \*\/}.*?<\/TabsContent>\n', '', content, flags=re.DOTALL)

# Fallbacks for Exact Tabs content
content = re.sub(r'<TabsContent value="all-leaves">.*?</TabsContent>', '', content, flags=re.DOTALL)
content = re.sub(r'<TabsContent value="all-screens">.*?</TabsContent>', '', content, flags=re.DOTALL)
content = re.sub(r'<TabsContent value="leave">.*?</TabsContent>', '', content, flags=re.DOTALL)
content = re.sub(r'<TabsContent value="holidays">.*?</TabsContent>', '', content, flags=re.DOTALL)

with open(target, 'w') as f:
    f.write(content)

print(f"Refactored {target} successfully")
