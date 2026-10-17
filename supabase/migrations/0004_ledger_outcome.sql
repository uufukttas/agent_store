-- ADR 0005: usage_ledger çekirdek tablosu lead'e özgü sütun taşımaz. Başarı ölçütü agent'a aittir
-- ve ad + sayı olarak yazılır. 0003 uygulanmış olduğundan düzeltme yeni migration ile yapılır.
-- drafts_count taslak paketi (P2) gelene kadar hiç yazılmadı; o paket kendi ölçütünü yazacak.

alter table public.usage_ledger
  add column if not exists outcome_label text check (outcome_label is null or length(outcome_label) > 0),
  add column if not exists outcome_count integer not null default 0 check (outcome_count >= 0);

update public.usage_ledger
  set outcome_label = 'lead', outcome_count = leads_count
  where outcome_label is null;

alter table public.usage_ledger
  drop column if exists leads_count,
  drop column if exists drafts_count;
