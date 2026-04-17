-- Run this script in your Supabase SQL Editor to permanently fix the auto-increment sequence issue for attendance_records
-- It synchronizes the underlying Postgres sequence with the actual maximum ID in the table.

SELECT setval(
  pg_get_serial_sequence('attendance_records', 'id'), 
  coalesce(max(id), 0) + 1, 
  false
) FROM attendance_records;
