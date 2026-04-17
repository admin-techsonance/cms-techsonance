-- 1. Create the Storage Bucket for Help Desk Attachments
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'helpdesk_attachments',
  'helpdesk_attachments',
  true,
  1048576, -- 1MB limit
  '{"image/jpeg", "image/png"}'
) ON CONFLICT (id) DO UPDATE SET 
  file_size_limit = 1048576,
  allowed_mime_types = '{"image/jpeg", "image/png"}';

-- Create Storage Policies (Public Read, Authenticated Upload)
CREATE POLICY "Public Read Access for Helpdesk Attachments"
ON storage.objects FOR SELECT
USING ( bucket_id = 'helpdesk_attachments' );

CREATE POLICY "Authenticated users can upload helpdesk attachments"
ON storage.objects FOR INSERT
TO authenticated 
WITH CHECK ( bucket_id = 'helpdesk_attachments' );

-- 2. Alter existing tickets table to support attachments
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS attachment_url TEXT;

-- 3. Create Help Desk Settings for Email Routing
CREATE TABLE IF NOT EXISTS public.helpdesk_settings (
    tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
    it_support_email TEXT,
    hr_support_email TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

ALTER TABLE public.helpdesk_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage helpdesk settings"
    ON public.helpdesk_settings FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = auth.uid() 
            AND role IN ('Admin', 'SuperAdmin', 'Manager') 
            AND tenant_id = helpdesk_settings.tenant_id
        )
    );

-- 4. Create the Comments (Chat) System Table
CREATE TABLE IF NOT EXISTS public.helpdesk_comments (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    ticket_id BIGINT NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Index for fast chat loading
CREATE INDEX IF NOT EXISTS idx_helpdesk_comments_ticket_id ON public.helpdesk_comments(ticket_id);

ALTER TABLE public.helpdesk_comments ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view comments on tickets they created, AND Admins can view all comments
CREATE POLICY "Users view relevant comments"
    ON public.helpdesk_comments FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.tickets t
            JOIN public.employees e ON e.id = t.client_id
            WHERE t.id = helpdesk_comments.ticket_id
            AND (
                e.user_id = auth.uid() 
                OR 
                EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('Admin', 'SuperAdmin', 'Manager'))
            )
        )
    );

-- Policy: Users can post comments on their own tickets, Admins can post on any
CREATE POLICY "Users can insert comments"
    ON public.helpdesk_comments FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.tickets t
            JOIN public.employees e ON e.id = t.client_id
            WHERE t.id = ticket_id
            AND (
                e.user_id = auth.uid() 
                OR 
                EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('Admin', 'SuperAdmin', 'Manager'))
            )
        )
    );
