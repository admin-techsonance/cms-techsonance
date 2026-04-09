import { sqliteTable, integer, text, real, index } from 'drizzle-orm/sqlite-core';

// Authentication & Users
export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  password: text('password').notNull(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  role: text('role').notNull(),
  avatarUrl: text('avatar_url'),
  phone: text('phone'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  lastLogin: text('last_login'),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  twoFactorEnabled: integer('two_factor_enabled', { mode: 'boolean' }).default(false),
  failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),
  lockedUntil: text('locked_until'),
}, (table) => ({
  usersRoleIdx: index('users_role_idx').on(table.role),
  usersActiveIdx: index('users_active_idx').on(table.isActive),
}));

export const sessions = sqliteTable('sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').references(() => users.id).notNull(),
  token: text('token').notNull().unique(),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => ({
  sessionsUserIdIdx: index('sessions_user_id_idx').on(table.userId),
  sessionsExpiresAtIdx: index('sessions_expires_at_idx').on(table.expiresAt),
}));

export const authRefreshSessions = sqliteTable('auth_refresh_sessions', {
  id: text('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  refreshTokenHash: text('refresh_token_hash').notNull().unique(),
  isPersistent: integer('is_persistent', { mode: 'boolean' }).notNull().default(true),
  userAgent: text('user_agent'),
  ipAddress: text('ip_address'),
  expiresAt: text('expires_at').notNull(),
  rotatedAt: text('rotated_at'),
  revokedAt: text('revoked_at'),
  createdAt: text('created_at').notNull(),
  lastUsedAt: text('last_used_at'),
}, (table) => ({
  authRefreshSessionsUserIdIdx: index('auth_refresh_sessions_user_id_idx').on(table.userId),
  authRefreshSessionsExpiresAtIdx: index('auth_refresh_sessions_expires_at_idx').on(table.expiresAt),
}));

export const tokenBlacklist = sqliteTable('token_blacklist', {
  id: text('id').primaryKey(),
  tokenId: text('token_id').notNull().unique(),
  userId: integer('user_id').references(() => users.id),
  reason: text('reason').notNull(),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => ({
  tokenBlacklistUserIdIdx: index('token_blacklist_user_id_idx').on(table.userId),
  tokenBlacklistExpiresAtIdx: index('token_blacklist_expires_at_idx').on(table.expiresAt),
}));

export const passwordResetOtps = sqliteTable('password_reset_otps', {
  id: text('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  email: text('email').notNull(),
  otpHash: text('otp_hash').notNull(),
  expiresAt: text('expires_at').notNull(),
  verifiedAt: text('verified_at'),
  consumedAt: text('consumed_at'),
  attempts: integer('attempts').notNull().default(0),
  createdAt: text('created_at').notNull(),
}, (table) => ({
  passwordResetOtpsUserIdIdx: index('password_reset_otps_user_id_idx').on(table.userId),
  passwordResetOtpsEmailIdx: index('password_reset_otps_email_idx').on(table.email),
  passwordResetOtpsExpiresAtIdx: index('password_reset_otps_expires_at_idx').on(table.expiresAt),
}));

export const auditLogs = sqliteTable('audit_logs', {
  id: text('id').primaryKey(),
  actorUserId: integer('actor_user_id').references(() => users.id),
  action: text('action').notNull(),
  resourceType: text('resource_type').notNull(),
  resourceId: text('resource_id'),
  method: text('method').notNull(),
  path: text('path').notNull(),
  correlationId: text('correlation_id'),
  details: text('details', { mode: 'json' }),
  createdAt: text('created_at').notNull(),
}, (table) => ({
  auditLogsActorUserIdIdx: index('audit_logs_actor_user_id_idx').on(table.actorUserId),
  auditLogsResourceIdx: index('audit_logs_resource_idx').on(table.resourceType, table.resourceId),
  auditLogsCreatedAtIdx: index('audit_logs_created_at_idx').on(table.createdAt),
}));

export const activityLogs = sqliteTable('activity_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').references(() => users.id).notNull(),
  action: text('action').notNull(),
  module: text('module').notNull(),
  details: text('details', { mode: 'json' }),
  ipAddress: text('ip_address'),
  createdAt: text('created_at').notNull(),
});

// Client Management
export const clients = sqliteTable('clients', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  companyName: text('company_name').notNull(),
  contactPerson: text('contact_person').notNull(),
  email: text('email').notNull(),
  phone: text('phone'),
  address: text('address'),
  industry: text('industry'),
  status: text('status').notNull().default('active'),
  createdBy: integer('created_by').references(() => users.id).notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  notes: text('notes'),
});

export const clientCommunications = sqliteTable('client_communications', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  clientId: integer('client_id').references(() => clients.id).notNull(),
  userId: integer('user_id').references(() => users.id).notNull(),
  message: text('message').notNull(),
  attachments: text('attachments', { mode: 'json' }),
  createdAt: text('created_at').notNull(),
  isRead: integer('is_read', { mode: 'boolean' }).default(false),
});

// Project Management
export const projects = sqliteTable('projects', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  description: text('description'),
  clientId: integer('client_id').references(() => clients.id).notNull(),
  status: text('status').notNull().default('planning'),
  priority: text('priority').notNull().default('medium'),
  startDate: text('start_date'),
  endDate: text('end_date'),
  budget: integer('budget'),
  createdBy: integer('created_by').references(() => users.id).notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
});

export const projectMembers = sqliteTable('project_members', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectId: integer('project_id').references(() => projects.id).notNull(),
  userId: integer('user_id').references(() => users.id).notNull(),
  role: text('role').notNull(),
  assignedAt: text('assigned_at').notNull(),
});

export const milestones = sqliteTable('milestones', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectId: integer('project_id').references(() => projects.id).notNull(),
  title: text('title').notNull(),
  description: text('description'),
  dueDate: text('due_date').notNull(),
  status: text('status').notNull().default('pending'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const sprints = sqliteTable('sprints', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectId: integer('project_id').references(() => projects.id).notNull(),
  name: text('name').notNull(),
  goal: text('goal'),
  startDate: text('start_date').notNull(),
  endDate: text('end_date').notNull(),
  status: text('status').notNull().default('planning'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const tasks = sqliteTable('tasks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectId: integer('project_id').references(() => projects.id).notNull(),
  milestoneId: integer('milestone_id').references(() => milestones.id),
  sprintId: integer('sprint_id').references(() => sprints.id),
  title: text('title').notNull(),
  description: text('description'),
  assignedTo: integer('assigned_to').references(() => users.id).notNull(),
  status: text('status').notNull().default('todo'),
  priority: text('priority').notNull().default('medium'),
  storyPoints: integer('story_points'),
  dueDate: text('due_date'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const timeTracking = sqliteTable('time_tracking', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  taskId: integer('task_id').references(() => tasks.id).notNull(),
  userId: integer('user_id').references(() => users.id).notNull(),
  hours: integer('hours').notNull(),
  date: text('date').notNull(),
  description: text('description'),
  createdAt: text('created_at').notNull(),
});

export const projectDocuments = sqliteTable('project_documents', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectId: integer('project_id').references(() => projects.id).notNull(),
  name: text('name').notNull(),
  fileUrl: text('file_url').notNull(),
  uploadedBy: integer('uploaded_by').references(() => users.id).notNull(),
  uploadedAt: text('uploaded_at').notNull(),
});

// Employee/Team Management
export const employees = sqliteTable('employees', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').references(() => users.id).notNull(),
  employeeId: text('employee_id').notNull().unique(),
  nfcCardId: text('nfc_card_id').unique(),
  department: text('department').notNull(),
  designation: text('designation').notNull(),
  dateOfJoining: text('date_of_joining').notNull(),
  dateOfBirth: text('date_of_birth'),
  skills: text('skills', { mode: 'json' }),
  salary: integer('salary'),
  status: text('status').notNull().default('active'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const attendance = sqliteTable('attendance', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  employeeId: integer('employee_id').references(() => employees.id).notNull(),
  date: text('date').notNull(),
  checkIn: text('check_in'),
  checkOut: text('check_out'),
  status: text('status').notNull(),
  notes: text('notes'),
});

export const leaveRequests = sqliteTable('leave_requests', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  employeeId: integer('employee_id').references(() => employees.id).notNull(),
  leaveType: text('leave_type').notNull(),
  startDate: text('start_date').notNull(),
  endDate: text('end_date').notNull(),
  reason: text('reason').notNull(),
  status: text('status').notNull().default('pending'),
  leavePeriod: text('leave_period').notNull().default('full_day'),
  actualDays: real('actual_days').notNull().default(1),
  approvedBy: integer('approved_by').references(() => users.id),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const performanceReviews = sqliteTable('performance_reviews', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  employeeId: integer('employee_id').references(() => employees.id).notNull(),
  reviewerId: integer('reviewer_id').references(() => users.id).notNull(),
  rating: integer('rating').notNull(),
  reviewPeriod: text('review_period').notNull(),
  comments: text('comments'),
  createdAt: text('created_at').notNull(),
});

export const payroll = sqliteTable('payroll', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  employeeId: integer('employee_id').references(() => employees.id).notNull(),
  month: text('month').notNull(), // Format: "YYYY-MM"
  year: integer('year').notNull(),
  baseSalary: integer('base_salary').notNull(),
  presentDays: integer('present_days').notNull().default(0),
  absentDays: integer('absent_days').notNull().default(0),
  halfDays: integer('half_days').notNull().default(0),
  leaveDays: integer('leave_days').notNull().default(0),
  totalWorkingDays: integer('total_working_days').notNull(),
  calculatedSalary: integer('calculated_salary').notNull(),
  deductions: integer('deductions').default(0),
  bonuses: integer('bonuses').default(0),
  netSalary: integer('net_salary').notNull(),
  status: text('status').notNull().default('draft'), // 'draft', 'approved', 'paid'
  generatedBy: integer('generated_by').references(() => users.id).notNull(),
  generatedAt: text('generated_at').notNull(),
  approvedBy: integer('approved_by').references(() => users.id),
  approvedAt: text('approved_at'),
  paidAt: text('paid_at'),
  notes: text('notes'),
});

export const payrollJobs = sqliteTable('payroll_jobs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  jobKey: text('job_key').notNull().unique(),
  month: text('month').notNull(),
  year: integer('year').notNull(),
  employeeScope: text('employee_scope', { mode: 'json' }).notNull(),
  status: text('status').notNull().default('pending'),
  requestedBy: integer('requested_by').references(() => users.id).notNull(),
  requestedAt: text('requested_at').notNull(),
  startedAt: text('started_at'),
  completedAt: text('completed_at'),
  result: text('result', { mode: 'json' }),
  error: text('error'),
}, (table) => ({
  payrollJobsStatusIdx: index('payroll_jobs_status_idx').on(table.status),
  payrollJobsMonthIdx: index('payroll_jobs_month_idx').on(table.month, table.year),
}));

// Finance & Billing
export const invoices = sqliteTable('invoices', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  invoiceNumber: text('invoice_number').notNull().unique(),
  clientId: integer('client_id').references(() => clients.id).notNull(),
  projectId: integer('project_id').references(() => projects.id),
  amount: integer('amount').notNull(),
  tax: integer('tax').notNull(),
  totalAmount: integer('total_amount').notNull(),
  status: text('status').notNull().default('draft'),
  dueDate: text('due_date').notNull(),
  paidDate: text('paid_date'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  notes: text('notes'),
  termsAndConditions: text('terms_and_conditions'),
  paymentTerms: text('payment_terms'),
});

export const invoiceItems = sqliteTable('invoice_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  invoiceId: integer('invoice_id').references(() => invoices.id).notNull(),
  description: text('description').notNull(),
  quantity: integer('quantity').notNull(),
  unitPrice: integer('unit_price').notNull(),
  amount: integer('amount').notNull(),
});

export const payments = sqliteTable('payments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  invoiceId: integer('invoice_id').references(() => invoices.id).notNull(),
  amount: integer('amount').notNull(),
  paymentMethod: text('payment_method').notNull(),
  transactionId: text('transaction_id'),
  paymentDate: text('payment_date').notNull(),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
});

export const expenses = sqliteTable('expenses', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  category: text('category').notNull(),
  description: text('description').notNull(),
  amount: integer('amount').notNull(),
  projectId: integer('project_id').references(() => projects.id),
  employeeId: integer('employee_id').references(() => employees.id),
  date: text('date').notNull(),
  receiptUrl: text('receipt_url'),
  status: text('status').notNull().default('pending'),
  createdAt: text('created_at').notNull(),
});

export const expenseCategories = sqliteTable('expense_categories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  description: text('description'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const vendors = sqliteTable('vendors', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  contactPerson: text('contact_person'),
  email: text('email'),
  phone: text('phone'),
  address: text('address'),
  status: text('status').notNull().default('active'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const purchases = sqliteTable('purchases', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  vendorId: integer('vendor_id').references(() => vendors.id).notNull(),
  date: text('date').notNull(),
  amount: integer('amount').notNull(),
  description: text('description'),
  status: text('status').notNull().default('pending'),
  billUrl: text('bill_url'),
  dueDate: text('due_date'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// Content Management
export const pages = sqliteTable('pages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  slug: text('slug').notNull().unique(),
  content: text('content'),
  metaTitle: text('meta_title'),
  metaDescription: text('meta_description'),
  metaKeywords: text('meta_keywords'),
  status: text('status').notNull().default('draft'),
  createdBy: integer('created_by').references(() => users.id).notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  publishedAt: text('published_at'),
});

export const blogs = sqliteTable('blogs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  slug: text('slug').notNull().unique(),
  content: text('content').notNull(),
  excerpt: text('excerpt'),
  featuredImage: text('featured_image'),
  authorId: integer('author_id').references(() => users.id).notNull(),
  category: text('category').notNull(),
  tags: text('tags', { mode: 'json' }),
  status: text('status').notNull().default('draft'),
  views: integer('views').default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  publishedAt: text('published_at'),
});

export const mediaLibrary = sqliteTable('media_library', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  fileUrl: text('file_url').notNull(),
  fileType: text('file_type').notNull(),
  fileSize: integer('file_size').notNull(),
  uploadedBy: integer('uploaded_by').references(() => users.id).notNull(),
  createdAt: text('created_at').notNull(),
});

export const portfolio = sqliteTable('portfolio', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  description: text('description'),
  clientName: text('client_name').notNull(),
  projectUrl: text('project_url'),
  thumbnail: text('thumbnail'),
  images: text('images', { mode: 'json' }),
  technologies: text('technologies', { mode: 'json' }),
  category: text('category').notNull(),
  status: text('status').notNull().default('active'),
  createdAt: text('created_at').notNull(),
});

// Communication & Support
export const tickets = sqliteTable('tickets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ticketNumber: text('ticket_number').notNull().unique(),
  clientId: integer('client_id').references(() => clients.id).notNull(),
  subject: text('subject').notNull(),
  description: text('description').notNull(),
  priority: text('priority').notNull().default('medium'),
  status: text('status').notNull().default('open'),
  assignedTo: integer('assigned_to').references(() => users.id),
  createdBy: integer('created_by').references(() => users.id),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const ticketResponses = sqliteTable('ticket_responses', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ticketId: integer('ticket_id').references(() => tickets.id).notNull(),
  userId: integer('user_id').references(() => users.id).notNull(),
  message: text('message').notNull(),
  attachments: text('attachments', { mode: 'json' }),
  createdAt: text('created_at').notNull(),
});

export const notifications = sqliteTable('notifications', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').references(() => users.id).notNull(),
  title: text('title').notNull(),
  message: text('message').notNull(),
  type: text('type').notNull(),
  link: text('link'),
  isRead: integer('is_read', { mode: 'boolean' }).default(false),
  createdAt: text('created_at').notNull(),
});

export const chatMessages = sqliteTable('chat_messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  senderId: integer('sender_id').references(() => users.id).notNull(),
  receiverId: integer('receiver_id').references(() => users.id),
  roomId: text('room_id'),
  message: text('message').notNull(),
  attachments: text('attachments', { mode: 'json' }),
  createdAt: text('created_at').notNull(),
  isRead: integer('is_read', { mode: 'boolean' }).default(false),
});

// Settings
export const companySettings = sqliteTable('company_settings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  companyName: text('company_name').notNull(),
  logoUrl: text('logo_url'),
  primaryColor: text('primary_color'),
  secondaryColor: text('secondary_color'),
  email: text('email').notNull(),
  phone: text('phone'),
  address: text('address'),
  website: text('website'),
  smtpHost: text('smtp_host'),
  smtpPort: integer('smtp_port'),
  smtpUser: text('smtp_user'),
  smtpPassword: text('smtp_password'),
  updatedAt: text('updated_at').notNull(),
});

// Developer Features - Daily Reports
export const dailyReports = sqliteTable('daily_reports', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').references(() => users.id).notNull(),
  date: text('date').notNull(),
  availableStatus: text('available_status').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const dailyReportProjects = sqliteTable('daily_report_projects', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  dailyReportId: integer('daily_report_id').references(() => dailyReports.id).notNull(),
  projectId: integer('project_id').references(() => projects.id).notNull(),
  description: text('description').notNull(),
  trackerTime: integer('tracker_time').notNull(),
  isCoveredWork: integer('is_covered_work', { mode: 'boolean' }),
  isExtraWork: integer('is_extra_work', { mode: 'boolean' }),
  createdAt: text('created_at').notNull(),
});

// Inquiries
export const inquiries = sqliteTable('inquiries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  aliasName: text('alias_name').notNull(),
  tag: text('tag').notNull(),
  status: text('status').notNull(),
  dueDate: text('due_date'),
  appStatus: text('app_status'),
  isFavourite: integer('is_favourite', { mode: 'boolean' }).default(false),
  createdBy: integer('created_by').references(() => users.id).notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const inquiryFeeds = sqliteTable('inquiry_feeds', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  inquiryId: integer('inquiry_id').references(() => inquiries.id).notNull(),
  commentedBy: integer('commented_by').references(() => users.id).notNull(),
  technology: text('technology'),
  description: text('description').notNull(),
  createdAt: text('created_at').notNull(),
});

// Company Holidays
export const companyHolidays = sqliteTable('company_holidays', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  date: text('date').notNull(),
  reason: text('reason').notNull(),
  year: integer('year').notNull(),
  createdAt: text('created_at').notNull(),
});

// Settings
export const businessSettings = sqliteTable('business_settings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  businessName: text('business_name').notNull(),
  email: text('email'),
  phone: text('contact_number'),
  address: text('address'),
  gstNo: text('gst_no'),
  pan: text('pan'),
  tan: text('tan'),
  registrationNo: text('registration_no'),
  termsAndConditions: text('terms_and_conditions'),
  notes: text('notes'),
  paymentTerms: text('payment_terms'),
  logoUrl: text('logo_url'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// Reimbursement Management
export const reimbursementCategories = sqliteTable('reimbursement_categories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  description: text('description'),
  maxAmount: integer('max_amount'), // Optional limit per request in paise
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const reimbursements = sqliteTable('reimbursements', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  requestId: text('request_id').notNull().unique(), // Auto-generated: RMB-YYYY-XXXX
  employeeId: integer('employee_id').references(() => employees.id).notNull(),
  categoryId: integer('category_id').references(() => reimbursementCategories.id).notNull(),
  amount: integer('amount').notNull(), // Store in paise (smallest currency unit)
  currency: text('currency').default('INR'),
  expenseDate: text('expense_date').notNull(),
  description: text('description').notNull(),
  receiptUrl: text('receipt_url'), // Path to uploaded file
  status: text('status').notNull(), // draft, submitted, approved, rejected, returned
  submittedAt: text('submitted_at'),
  reviewedBy: integer('reviewed_by').references(() => users.id),
  reviewedAt: text('reviewed_at'),
  adminComments: text('admin_comments'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// NFC & IOT Devices Schema Integration

export const nfcTags = sqliteTable('nfc_tags', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tagUid: text('tag_uid').notNull().unique(),
  employeeId: integer('employee_id').references(() => employees.id),
  status: text('status').notNull(),
  enrolledAt: text('enrolled_at').notNull(),
  enrolledBy: integer('enrolled_by').references(() => users.id),
  lastUsedAt: text('last_used_at'),
  readerId: text('reader_id'),
  createdAt: text('created_at').notNull(),
});

export const attendanceRecords = sqliteTable('attendance_records', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  employeeId: integer('employee_id').notNull().references(() => employees.id),
  date: text('date').notNull(),
  timeIn: text('time_in').notNull(),
  timeOut: text('time_out'),
  locationLatitude: real('location_latitude'),
  locationLongitude: real('location_longitude'),
  duration: integer('duration'),
  status: text('status').notNull(),
  checkInMethod: text('check_in_method').notNull(),
  readerId: text('reader_id'),
  location: text('location'),
  tagUid: text('tag_uid'),
  idempotencyKey: text('idempotency_key').unique(),
  syncedAt: text('synced_at'),
  metadata: text('metadata'),
  createdAt: text('created_at').notNull(),
});

export const readerDevices = sqliteTable('reader_devices', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  readerId: text('reader_id').notNull().unique(),
  name: text('name').notNull(),
  location: text('location').notNull(),
  type: text('type').notNull(),
  status: text('status').notNull(),
  ipAddress: text('ip_address'),
  lastHeartbeat: text('last_heartbeat'),
  config: text('config'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});
