CREATE TABLE IF NOT EXISTS public.tenant_attendance_settings (
    tenant_id UUID PRIMARY KEY,
    office_latitude DECIMAL(10, 8),
    office_longitude DECIMAL(11, 8),
    geofence_radius_meters INTEGER DEFAULT 500,
    allowed_ips TEXT, -- Comma-separated list of IP ranges like '192.168.1.1,10.0.0.5'
    standard_work_hours DECIMAL(4, 2) DEFAULT 9.0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Foreign key constraints 
ALTER TABLE public.tenant_attendance_settings
    ADD CONSTRAINT fk_attendance_settings_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

-- Enable RLS
ALTER TABLE public.tenant_attendance_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view and update attendance settings"
    ON public.tenant_attendance_settings FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = auth.uid() 
            AND role IN ('Admin', 'SuperAdmin', 'Manager') 
            AND tenant_id = tenant_attendance_settings.tenant_id
        )
    );

CREATE POLICY "Employees can view attendance settings"
    ON public.tenant_attendance_settings FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = auth.uid() 
            AND tenant_id = tenant_attendance_settings.tenant_id
        )
    );

-- Add overtime and violation columns to primary records
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS overtime_hours DECIMAL(5, 2);
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS violation_flags JSONB;

-- Add violation column to pending requests table
ALTER TABLE public.attendance_requests ADD COLUMN IF NOT EXISTS violation_flags JSONB;
