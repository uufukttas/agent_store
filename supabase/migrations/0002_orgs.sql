-- Çok kiracılığa hazırlık: her tabloda org_id bulunur. İlk aşamada tek org var (GradeUp).
-- Müşterilere açılırken şema değişmez; yalnızca satır düzeyinde güvenlik (RLS) politikaları
-- ve faturalama eklenir.
--
-- Kural: public şemasındaki her tablo RLS açık oluşturulur. Politika yoksa anon ve
-- authenticated roller erişemez; yalnızca sunucudaki service role (RLS'i atlar) erişir.

create table if not exists public.orgs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null,
  created_at timestamptz not null default now()
);

alter table public.orgs enable row level security;

insert into public.orgs (id, slug, name)
values ('00000000-0000-0000-0000-000000000001', 'gradeup', 'GradeUp')
on conflict (slug) do nothing;
