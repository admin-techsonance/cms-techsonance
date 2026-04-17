-- ============================================================
-- Expense Claims Enhancement Migration
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. Add new columns to the existing reimbursements table
ALTER TABLE public.reimbursements 
  ADD COLUMN IF NOT EXISTS billing_status TEXT DEFAULT 'non_billable',
  ADD COLUMN IF NOT EXISTS cost_category TEXT,
  ADD COLUMN IF NOT EXISTS qty INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS project TEXT DEFAULT 'TechSonance Infotech',
  ADD COLUMN IF NOT EXISTS for_company TEXT DEFAULT 'TechSonance Infotech',
  ADD COLUMN IF NOT EXISTS division TEXT DEFAULT 'IND',
  ADD COLUMN IF NOT EXISTS reason_for_claim TEXT;

-- 2. Create the Supabase Storage bucket for receipt uploads
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'reimbursement_receipts',
  'reimbursement_receipts',
  true,
  5242880, -- 5MB
  ARRAY['image/jpeg', 'image/png', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- 3. Storage RLS policies
CREATE POLICY "Authenticated users can upload receipts"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK ( bucket_id = 'reimbursement_receipts' );

CREATE POLICY "Public can view receipts"
  ON storage.objects FOR SELECT
  TO public
  USING ( bucket_id = 'reimbursement_receipts' );

-- 4. Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_reimbursements_cost_category ON public.reimbursements(cost_category);
CREATE INDEX IF NOT EXISTS idx_reimbursements_billing_status ON public.reimbursements(billing_status);
