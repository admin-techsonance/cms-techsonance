'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import {
  LayoutDashboard,
  Users,
  FolderKanban,
  UserCog,
  DollarSign,
  FileText,
  Settings,
  Building2,
  Kanban,
  ClipboardList,
  Search,
  UserCircle,
  HelpCircle,
  Wallet,
  Receipt,
  Fingerprint,
  Wifi,
  Calendar,
  Clock,
} from 'lucide-react';
import { User } from '@/lib/auth';

interface DashboardSidebarProps {
  user: User;
}

function normalizeRole(role: string) {
  const value = role.trim();
  const canonical = value.toLowerCase();

  switch (canonical) {
    case 'superadmin':
    case 'admin':
      return 'admin';
    case 'manager':
      return 'project_manager';
    case 'employee':
      return 'developer';
    case 'viewer':
      return 'client';
    default:
      return canonical;
  }
}

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, roles: ['admin', 'project_manager', 'developer', 'client'] },
  { name: 'Clients', href: '/dashboard/clients', icon: Users, roles: ['admin'] },
  { name: 'Projects', href: '/dashboard/projects', icon: FolderKanban, roles: ['admin', 'project_manager', 'developer'] },
  { name: 'Tasks', href: '/dashboard/tasks', icon: Kanban, roles: ['admin', 'project_manager', 'developer'] },
  { name: 'Team', href: '/dashboard/team', icon: UserCog, roles: ['admin'] },
  { name: 'Finance', href: '/dashboard/finance', icon: DollarSign, roles: ['admin'] },
  { name: 'Payroll', href: '/dashboard/payroll', icon: Wallet, roles: ['admin'] },
  { name: 'Content', href: '/dashboard/content', icon: FileText, roles: ['admin'] },
  { name: 'Settings', href: '/dashboard/settings', icon: Settings, roles: ['admin'] },

  // Admin gets full access to all pages
  { name: 'Daily Updates', href: '/dashboard/daily-update', icon: ClipboardList, roles: ['admin', 'project_manager', 'developer'] },
  { name: 'Leaves', href: '/dashboard/leaves', icon: Calendar, roles: ['admin', 'project_manager', 'developer', 'client'] },
  { name: 'Attendance', href: '/dashboard/attendance', icon: Clock, roles: ['admin', 'project_manager', 'developer', 'client'] },

  { name: 'Help Desk', href: '/dashboard/help-desk', icon: HelpCircle, roles: ['admin', 'project_manager', 'developer'] },
  { name: 'Inquiry', href: '/dashboard/inquiry', icon: Search, roles: ['admin', 'project_manager', 'business_development', 'developer', 'hr_manager', 'employee', 'cms_administrator', 'qa_engineer', 'devops_engineer', 'ui_ux_designer', 'digital_marketing', 'business_analyst'] },
  { name: 'Reimbursements', href: '/dashboard/reimbursements', icon: Receipt, roles: ['admin', 'hr_manager', 'cms_administrator', 'project_manager', 'business_development', 'developer', 'qa_engineer', 'devops_engineer', 'ui_ux_designer', 'digital_marketing', 'business_analyst'] },
];

export function DashboardSidebar({ user }: DashboardSidebarProps) {
  const pathname = usePathname();
  const normalizedRole = normalizeRole(user.role);

  const filteredNavigation = navigation.filter(item =>
    item.roles.includes(normalizedRole)
  );

  return (
    <aside className="hidden lg:flex lg:flex-col w-64 border-r bg-card h-full">
      <div className="flex items-center gap-2 h-16 px-6 border-b">
        {/* Using logo-icon.png for the icon and keeping text for scalability/readability */}
        <div className="relative h-8 w-8">
          <Image src="/logo-icon.png" alt="TechSonance" fill className="object-contain" />
        </div>
        <span className="font-bold text-lg">TechSonance InfoTech</span>
      </div>

      <nav className="flex-1 overflow-y-auto p-4">
        <ul className="space-y-1">
          {filteredNavigation.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            const Icon = item.icon;

            return (
              <li key={item.name}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {item.name}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t p-4">
        <Link href="/dashboard/profile" className="flex items-center gap-3 px-3 hover:bg-accent rounded-lg transition-colors">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
            {user.firstName[0]}{user.lastName[0]}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">
              {user.firstName} {user.lastName}
            </p>
            <p className="text-xs text-muted-foreground truncate capitalize">
              {normalizedRole.replaceAll('_', ' ')}
            </p>
          </div>
        </Link>
      </div>
    </aside>
  );
}
