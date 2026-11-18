create extension if not exists pgcrypto;

create table if not exists public.scanned_documents (
  id uuid primary key default gen_random_uuid(),
  session_id varchar(100) not null,
  file_name varchar(255) default 'Scanned_Doc.pdf',
  page_count int default 1,
  filter_used varchar(50),
  category varchar(50),
  created_at timestamptz default now()
);

create index if not exists scanned_documents_created_at_idx
  on public.scanned_documents (created_at desc);

-- Telemetry is written only by the server using the service-role key.
-- No anonymous or authenticated browser access is granted.
alter table public.scanned_documents enable row level security;
revoke all on table public.scanned_documents from anon, authenticated;
grant insert on table public.scanned_documents to service_role;
