const fs = require('fs');
const path = require('path');

const components = [
  'PageHeaderSkeleton',
  'StatsSkeleton',
  'TableSkeleton',
  'KanbanSkeleton',
  'TabsSkeleton',
  'DetailedPageSkeleton',
  'ContentSkeleton',
  'ProfileSkeleton',
  'InlineTableSkeleton',
  'MetricCardGridSkeleton',
  'DashboardCompositeSkeleton',
  'ProjectSummarySkeleton',
  'QuickActionsSkeleton'
];

function checkDirectory(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      checkDirectory(fullPath);
    } else if (file.endsWith('.tsx')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      const usedComponents = components.filter(c => content.includes(c) && !content.includes(`import { ${c}`) && !content.includes(`, ${c}`) && !content.includes(`${c}, `));
      
      const importLineMatch = content.match(/import \{.*\} from '@\/components\/ui\/dashboard-skeleton'/);
      
      if (usedComponents.length > 0) {
        console.log(`File: ${fullPath}`);
        console.log(`Used but not imported: ${usedComponents.join(', ')}`);
        if (importLineMatch) {
          console.log(`Found import line: ${importLineMatch[0]}`);
        } else {
          console.log(`No import line found for dashboard-skeleton`);
        }
        console.log('---');
      }
    }
  }
}

checkDirectory(path.join(process.cwd(), 'src/app/dashboard'));
