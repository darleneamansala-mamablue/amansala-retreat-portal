-- Amansala Retreat Portal — Supabase Setup
-- Run this in the Supabase SQL Editor

-- Main data store (bookings, rooms, registrations, etc.)
CREATE TABLE IF NOT EXISTS app_store (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL DEFAULT 'null',
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Transport submissions (from teachers/guests)
CREATE TABLE IF NOT EXISTS transport (
  id           TEXT PRIMARY KEY,
  booking_id   TEXT,
  data         JSONB NOT NULL,
  submitted_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE app_store ENABLE ROW LEVEL SECURITY;
ALTER TABLE transport  ENABLE ROW LEVEL SECURITY;

-- Allow full public access (small internal team, no login required)
CREATE POLICY "allow_all" ON app_store FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON transport  FOR ALL TO anon USING (true) WITH CHECK (true);
