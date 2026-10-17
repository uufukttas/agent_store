-- P1: Lead Araştırmacı için çekirdek tablolar (ADR 0002 kuralları: org_id, RLS açık, politika yok).
-- Tüm erişim sunucudaki service role üzerinden olur. anon ve authenticated rollerin yetkileri
-- ayrıca geri alınır (RLS'e ek ikinci katman).

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Agent kaydı. MA tarafındaki kimlikler `pnpm ma:setup` ile doldurulur.
-- published_version: "Yayınla" işareti. Oturumlar ve zamanlanmış çalıştırmalar hep bu versiyona
-- sabitlenir; MA'nın "son versiyon"una güvenilmez (ADR 0001).
create table if not exists public.agents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id),
  slug text not null check (slug ~ '^[a-z0-9-]+$'),
  name text not null,
  ma_agent_id text unique,
  ma_environment_id text,
  published_version integer check (published_version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, slug)
);

-- Her agent versiyonunun spec'i kendi veritabanımızda da saklanır (MA'dan çıkış mümkün kalsın).
create table if not exists public.agent_versions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id),
  agent_id uuid not null references public.agents (id),
  version integer not null check (version >= 1),
  spec jsonb not null,
  note text,
  created_at timestamptz not null default now(),
  unique (agent_id, version)
);

-- Bir çalıştırma = bir MA oturumu.
create table if not exists public.runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id),
  agent_id uuid not null references public.agents (id),
  agent_version integer not null,
  ma_session_id text not null unique,
  status text not null default 'running'
    check (status in ('running', 'awaiting_tool', 'budget_reached', 'completed', 'failed', 'cancelled')),
  input jsonb not null,
  budget_cents integer not null check (budget_cents > 0),
  stop_reason text,
  error text,
  created_by uuid references auth.users (id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  last_synced_at timestamptz,
  foreign key (agent_id, agent_version) references public.agent_versions (agent_id, version)
);

create index if not exists runs_open_idx on public.runs (org_id, started_at desc)
  where status in ('running', 'awaiting_tool');

-- MA olaylarının ham kaydı: zaman çizelgesi bunlardan çizilir, tekrar işleme bunlarla engellenir.
-- handled_at: custom tool çağrısı çalıştırılıp sonucu MA'ya başarıyla gönderilince dolar.
create table if not exists public.run_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id),
  run_id uuid not null references public.runs (id) on delete cascade,
  ma_event_id text not null,
  type text not null,
  payload jsonb not null,
  occurred_at timestamptz,
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  unique (run_id, ma_event_id)
);

create index if not exists run_events_timeline_idx on public.run_events (run_id, created_at);
create index if not exists run_events_unhandled_idx on public.run_events (run_id)
  where handled_at is null and type = 'agent.custom_tool_use';

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id),
  run_id uuid references public.runs (id) on delete set null,
  company_name text not null,
  domain text not null check (domain = lower(domain) and domain !~ '[/:@[:space:]]'),
  city text,
  employee_estimate integer check (employee_estimate >= 0),
  contact_name text,
  contact_role text,
  score smallint not null check (score between 0 and 100),
  score_rationale jsonb not null default '[]'::jsonb,
  status text not null default 'new' check (status in ('new', 'qualified', 'rejected', 'contacted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, domain)
);

create index if not exists leads_run_idx on public.leads (run_id);
create index if not exists leads_score_idx on public.leads (org_id, score desc);

-- Her lead en az bir kaynağa bağlıdır (uygulama kaynaksız kaydı reddeder).
create table if not exists public.lead_sources (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id),
  lead_id uuid not null references public.leads (id) on delete cascade,
  url text not null check (url ~ '^https?://'),
  title text,
  quote text not null,
  fetched_at timestamptz not null default now(),
  unique (lead_id, url)
);

-- Çalıştırma başına bir satır; son değerlerle güncellenir. list_cost_cents, MA'nın liste
-- fiyatıyla hesapladığı maliyettir (faturalanan tutar değildir, ADR 0001).
create table if not exists public.usage_ledger (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id),
  run_id uuid not null unique references public.runs (id),
  agent_id uuid not null references public.agents (id),
  agent_version integer not null,
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  cache_creation_input_tokens bigint not null default 0 check (cache_creation_input_tokens >= 0),
  cache_read_input_tokens bigint not null default 0 check (cache_read_input_tokens >= 0),
  web_search_requests integer not null default 0 check (web_search_requests >= 0),
  list_cost_cents bigint not null default 0 check (list_cost_cents >= 0),
  active_seconds integer not null default 0 check (active_seconds >= 0),
  leads_count integer not null default 0 check (leads_count >= 0),
  drafts_count integer not null default 0 check (drafts_count >= 0),
  recorded_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace trigger agents_set_updated_at before update on public.agents
  for each row execute function public.set_updated_at();
create or replace trigger leads_set_updated_at before update on public.leads
  for each row execute function public.set_updated_at();
create or replace trigger usage_ledger_set_updated_at before update on public.usage_ledger
  for each row execute function public.set_updated_at();

alter table public.agents enable row level security;
alter table public.agent_versions enable row level security;
alter table public.runs enable row level security;
alter table public.run_events enable row level security;
alter table public.leads enable row level security;
alter table public.lead_sources enable row level security;
alter table public.usage_ledger enable row level security;

revoke all on public.orgs from anon, authenticated;
revoke all on public.agents from anon, authenticated;
revoke all on public.agent_versions from anon, authenticated;
revoke all on public.runs from anon, authenticated;
revoke all on public.run_events from anon, authenticated;
revoke all on public.leads from anon, authenticated;
revoke all on public.lead_sources from anon, authenticated;
revoke all on public.usage_ledger from anon, authenticated;
