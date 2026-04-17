import re

target = 'src/app/dashboard/leaves/page.tsx'

with open(target, 'r') as f:
    content = f.read()

# Rename Component
content = content.replace('export default function MyAccountPage() {', 'export default function LeavesPage() {')

# Change page titles
content = content.replace('Employee Leave & Attendance Management', 'Leave & Holidays Management')

# Remove Tabs Triggers
content = re.sub(r'<TabsTrigger value="all-attendance">.*?</TabsTrigger>', '', content, flags=re.DOTALL)
content = re.sub(r'<TabsTrigger value="all-screens">.*?</TabsTrigger>', '', content, flags=re.DOTALL)
content = re.sub(r'<TabsTrigger value="attendance">.*?</TabsTrigger>', '', content, flags=re.DOTALL)
content = content.replace('<TabsList className={isFullAccessUser ? "grid w-full grid-cols-5" : "grid w-full grid-cols-3"}>', '<TabsList className={isFullAccessUser ? "grid w-full grid-cols-3" : "grid w-full grid-cols-2"}>')

# Remove TabsContents By Boundaries
content = re.sub(r'\{\/\* Admin\/Manager: All Attendance Tab \*\/}.*?<\/TabsContent>\n\s*\)\}', '', content, flags=re.DOTALL)
content = re.sub(r'\{\/\* Admin\/Manager: Screens Tab \*\/}.*?<\/TabsContent>\n\s*\)\}', '', content, flags=re.DOTALL)
content = re.sub(r'\{\/\* Attendance Tab \(Personal\) \*\/}.*?<\/TabsContent>\n\s*\)\}', '', content, flags=re.DOTALL)

# Fallbacks for Exact Tabs content
content = re.sub(r'<TabsContent value="all-attendance">.*?</TabsContent>', '', content, flags=re.DOTALL)
content = re.sub(r'<TabsContent value="all-screens">.*?</TabsContent>', '', content, flags=re.DOTALL)
content = re.sub(r'<TabsContent value="attendance">.*?</TabsContent>', '', content, flags=re.DOTALL)

with open(target, 'w') as f:
    f.write(content)

print(f"Refactored {target} successfully")
