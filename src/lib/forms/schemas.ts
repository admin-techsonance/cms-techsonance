import { z } from 'zod';

const phonePattern = /^\+?[\d\s\-()]+$/;

export const employeeRoleOptions = ['developer', 'project_manager', 'admin'] as const;
export const employeeDepartmentOptions = [
  'Engineering',
  'Design',
  'Marketing',
  'Sales',
  'HR',
  'Finance',
  'Operations',
] as const;
export const employeeStatusOptions = ['active', 'on_leave', 'inactive'] as const;
export const sprintStatusOptions = ['planning', 'active', 'completed'] as const;
export const taskStatusOptions = ['todo', 'in_progress', 'review', 'done'] as const;
export const taskPriorityOptions = ['low', 'medium', 'high'] as const;
export const taskStoryPointOptions = ['1', '2', '3', '5', '8', '13', '21'] as const;
export const clientStatusOptions = ['active', 'inactive', 'prospect'] as const;
export const projectMemberRoleOptions = ['lead', 'developer', 'designer', 'tester'] as const;
export const projectStatusOptions = ['planning', 'in_progress', 'on_hold', 'completed'] as const;
export const projectPriorityOptions = ['low', 'medium', 'high', 'critical'] as const;
export const leavePeriodOptions = ['full_day', 'half_day', 'hourly'] as const;
export const leaveTypeOptions = ['annual', 'sick', 'family', 'maternity', 'paternity', 'study', 'unpaid'] as const;
export const helpDeskSupportTypeOptions = ['it_support', 'hr_support'] as const;
export const helpDeskPriorityOptions = ['low', 'medium', 'high', 'urgent'] as const;
export const helpDeskStatusOptions = ['open', 'in_progress', 'resolved', 'closed'] as const;
export const reimbursementStatusOptions = ['draft', 'submitted', 'approved', 'rejected', 'returned'] as const;
export const inquiryTagOptions = ['need_estimation', 'rough_estimation', 'scheduling_meeting', 'need_schedule_meeting', 'hired_someone_else', 'hired'] as const;
export const inquiryStatusOptions = ['lead', 'no_reply', 'follow_up', 'hired', 'rejected_client', 'rejected_us', 'invite_lead', 'invite_hire', 'not_good_client', 'budget_low', 'cant_work', 'hired_someone_else'] as const;
export const inquiryAppStatusOptions = ['open', 'close'] as const;
export const dailyAvailabilityOptions = ['present', 'half_day', 'early_leave', 'on_leave'] as const;

const optionalDateField = z.string().optional().or(z.literal(''));

export const employeeCreateFormSchema = z.object({
  firstName: z.string().trim().min(2, 'First name must be at least 2 characters'),
  lastName: z.string().trim().min(2, 'Last name must be at least 2 characters'),
  email: z.string().trim().email('Invalid email format'),
  phone: z
    .string()
    .trim()
    .optional()
    .or(z.literal(''))
    .refine((value) => !value || phonePattern.test(value), 'Invalid phone number format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  employeeId: z.string().trim().min(1, 'Employee ID is required'),
  department: z.enum(employeeDepartmentOptions, { error: 'Department is required' }),
  designation: z.string().trim().min(1, 'Designation is required'),
  dateOfJoining: z.string().min(1, 'Date of joining is required'),
  dateOfBirth: optionalDateField,
  salary: z
    .string()
    .optional()
    .or(z.literal(''))
    .refine((value) => !value || (!Number.isNaN(Number(value)) && Number(value) >= 0), 'Salary must be a valid positive number'),
  skills: z.string().optional().or(z.literal('')),
  role: z.enum(employeeRoleOptions, { error: 'Role is required' }),
});

export const employeeEditFormSchema = employeeCreateFormSchema.omit({ password: true }).extend({
  status: z.enum(employeeStatusOptions),
});

export const taskFormSchema = z.object({
  projectId: z.string().min(1, 'Project is required'),
  sprintId: z.string().optional().or(z.literal('')),
  title: z.string().trim().min(3, 'Title must be at least 3 characters'),
  description: z.string().optional().or(z.literal('')),
  assignedTo: z.string().min(1, 'Assignee is required'),
  status: z.enum(taskStatusOptions),
  priority: z.enum(taskPriorityOptions),
  storyPoints: z
    .string()
    .optional()
    .or(z.literal(''))
    .refine((value) => !value || taskStoryPointOptions.includes(value as (typeof taskStoryPointOptions)[number]), 'Story points must be 1, 2, 3, 5, 8, 13, or 21'),
  dueDate: optionalDateField,
});

export const sprintFormSchema = z
  .object({
    projectId: z.string().min(1, 'Project is required'),
    name: z.string().trim().min(3, 'Sprint name must be at least 3 characters'),
    goal: z.string().optional().or(z.literal('')),
    startDate: z.string().min(1, 'Start date is required'),
    endDate: z.string().min(1, 'End date is required'),
    status: z.enum(sprintStatusOptions),
  })
  .refine((values) => {
    if (!values.startDate || !values.endDate) {
      return true;
    }

    return new Date(values.endDate) > new Date(values.startDate);
  }, {
    message: 'End date must be after start date',
    path: ['endDate'],
  });

export const clientFormSchema = z.object({
  companyName: z.string().trim().min(1, 'Company name is required'),
  contactPerson: z.string().trim().min(1, 'Contact person is required'),
  email: z.string().trim().email('Invalid email format'),
  phone: z
    .string()
    .trim()
    .optional()
    .or(z.literal(''))
    .refine((value) => !value || phonePattern.test(value), 'Invalid phone number format'),
  address: z.string().optional().or(z.literal('')),
  industry: z.string().optional().or(z.literal('')),
  status: z.enum(clientStatusOptions),
  notes: z.string().optional().or(z.literal('')),
});

export const assignProjectFormSchema = z.object({
  projectId: z.string().min(1, 'Please select a project'),
  role: z.enum(projectMemberRoleOptions),
});

export const projectFormSchema = z
  .object({
    name: z.string().trim().min(3, 'Project name must be at least 3 characters').max(100, 'Project name must not exceed 100 characters'),
    description: z.string().optional().or(z.literal('')),
    clientId: z.string().min(1, 'Please select a client'),
    status: z.enum(projectStatusOptions),
    priority: z.enum(projectPriorityOptions),
    startDate: optionalDateField,
    endDate: optionalDateField,
    budget: z
      .string()
      .optional()
      .or(z.literal(''))
      .refine((value) => !value || (!Number.isNaN(Number(value)) && Number(value) >= 0 && Number(value) <= 999999999), 'Budget must be a valid positive number'),
    isActive: z.boolean(),
  })
  .refine((values) => {
    if (!values.startDate || !values.endDate) {
      return true;
    }

    return new Date(values.endDate) >= new Date(values.startDate);
  }, {
    message: 'End date must be after start date',
    path: ['endDate'],
  });

export const leaveRequestFormSchema = z
  .object({
    period: z.enum(leavePeriodOptions),
    type: z.enum(leaveTypeOptions),
    from: z.string().min(1, 'Please select a start date'),
    to: z.string().min(1, 'Please select an end date'),
    reason: z.string().trim().min(10, 'Reason must be at least 10 characters'),
  })
  .refine((values) => new Date(values.to) >= new Date(values.from), {
    message: 'End date must be on or after start date',
    path: ['to'],
  });

export const helpDeskTicketFormSchema = z.object({
  supportType: z.enum(helpDeskSupportTypeOptions),
  subject: z.string().trim().min(3, 'Subject must be at least 3 characters'),
  description: z.string().trim().min(10, 'Description must be at least 10 characters'),
  priority: z.enum(['low', 'medium', 'high']),
});

export const helpDeskTicketUpdateFormSchema = z.object({
  status: z.enum(helpDeskStatusOptions),
  priority: z.enum(helpDeskPriorityOptions),
});

export const passwordChangeFormSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(6, 'New password must be at least 6 characters long'),
  confirmPassword: z.string().min(1, 'Please confirm your new password'),
}).refine((values) => values.newPassword === values.confirmPassword, {
  message: 'New passwords do not match',
  path: ['confirmPassword'],
});

export const reimbursementRequestFormSchema = z.object({
  categoryId: z.string().min(1, 'Please select a category'),
  amount: z.string().refine((value) => value.trim().length > 0 && !Number.isNaN(Number(value)) && Number(value) > 0, 'Please enter a valid amount'),
  expenseDate: z.string().min(1, 'Please select an expense date'),
  description: z.string().trim().min(5, 'Please provide a description'),
  receiptUrl: z.string().optional().or(z.literal('')),
});

export const reimbursementReviewFormSchema = z.object({
  adminComments: z.string().optional().or(z.literal('')),
});

export const inquiryFormSchema = z.object({
  aliasName: z.string().trim().min(1, 'Please enter alias name'),
  tag: z.enum(inquiryTagOptions),
  status: z.enum(inquiryStatusOptions),
  dueDate: z.string().optional().or(z.literal('')),
  appStatus: z.enum(inquiryAppStatusOptions),
});

export const inquiryFeedFormSchema = z.object({
  technology: z.string().optional().or(z.literal('')),
  description: z.string().trim().min(1, 'Please enter description'),
});

export const dailyProjectReportFormSchema = z.object({
  id: z.string(),
  projectId: z.number().int().positive('Please select a project'),
  description: z.string().trim().min(1, 'Please describe the work completed'),
  trackerTime: z.number().int().positive('Tracker time must be greater than 0'),
  isCoveredWork: z.boolean(),
  isExtraWork: z.boolean(),
});

export const dailyReportSubmissionSchema = z.object({
  date: z.string().min(1, 'Please select a date'),
  availableStatus: z.enum(dailyAvailabilityOptions),
  projectReports: z.array(dailyProjectReportFormSchema).min(1, 'Add at least one project report'),
});

export const financeVendorSchema = z.object({
  name: z.string().trim().min(1, 'Vendor name is required'),
  contactPerson: z.string().trim().min(1, 'Contact person is required'),
  email: z.string().trim().email('Please enter a valid email'),
  phone: z.string().trim().min(1, 'Phone is required'),
});

export const financePurchaseSchema = z.object({
  vendorId: z.string().min(1, 'Please select a vendor'),
  date: z.string().min(1, 'Please select a date'),
  amount: z.string().refine((value) => value.trim().length > 0 && !Number.isNaN(Number(value)) && Number(value) > 0, 'Please enter a valid amount'),
  description: z.string().trim().min(1, 'Description is required'),
});

export const financeExpenseSchema = z.object({
  category: z.string().trim().min(1, 'Please select a category'),
  description: z.string().trim().min(1, 'Description is required'),
  amount: z.string().refine((value) => value.trim().length > 0 && !Number.isNaN(Number(value)) && Number(value) > 0, 'Please enter a valid amount'),
  date: z.string().min(1, 'Please select a date'),
});

export const financeCategorySchema = z.object({
  name: z.string().trim().min(1, 'Category name is required'),
  description: z.string().optional().or(z.literal('')),
});

export const financeInvoiceSchema = z.object({
  clientId: z.string().min(1, 'Please select a client'),
  invoiceNumber: z.string().trim().min(1, 'Invoice number is required'),
  amount: z.string().refine((value) => value.trim().length > 0 && !Number.isNaN(Number(value)) && Number(value) >= 0, 'Please enter a valid amount'),
  tax: z.string().refine((value) => value.trim().length > 0 && !Number.isNaN(Number(value)) && Number(value) >= 0, 'Please enter a valid tax amount'),
  dueDate: z.string().min(1, 'Please select a due date'),
  termsAndConditions: z.string().optional().or(z.literal('')),
  notes: z.string().optional().or(z.literal('')),
  paymentTerms: z.string().optional().or(z.literal('')),
});

export type EmployeeCreateFormValues = z.infer<typeof employeeCreateFormSchema>;
export type EmployeeEditFormValues = z.infer<typeof employeeEditFormSchema>;
export type TaskFormValues = z.infer<typeof taskFormSchema>;
export type SprintFormValues = z.infer<typeof sprintFormSchema>;
export type ClientFormValues = z.infer<typeof clientFormSchema>;
export type AssignProjectFormValues = z.infer<typeof assignProjectFormSchema>;
export type ProjectFormValues = z.infer<typeof projectFormSchema>;
export type LeaveRequestFormValues = z.infer<typeof leaveRequestFormSchema>;
export type HelpDeskTicketFormValues = z.infer<typeof helpDeskTicketFormSchema>;
export type HelpDeskTicketUpdateFormValues = z.infer<typeof helpDeskTicketUpdateFormSchema>;
export type PasswordChangeFormValues = z.infer<typeof passwordChangeFormSchema>;
export type ReimbursementRequestFormValues = z.infer<typeof reimbursementRequestFormSchema>;
export type ReimbursementReviewFormValues = z.infer<typeof reimbursementReviewFormSchema>;
export type InquiryFormValues = z.infer<typeof inquiryFormSchema>;
export type InquiryFeedFormValues = z.infer<typeof inquiryFeedFormSchema>;
export type FinanceVendorFormValues = z.infer<typeof financeVendorSchema>;
export type FinancePurchaseFormValues = z.infer<typeof financePurchaseSchema>;
export type FinanceCategoryFormValues = z.infer<typeof financeCategorySchema>;
export type FinanceInvoiceFormValues = z.infer<typeof financeInvoiceSchema>;
