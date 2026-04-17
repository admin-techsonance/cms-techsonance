-- Add documents JSONB column to clients table to support Document Vault

ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS documents JSONB DEFAULT '[]'::jsonb;
