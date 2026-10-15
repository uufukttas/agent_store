-- Yalnızca izinli alan adındaki e-postalar auth.users'a eklenebilir veya güncellenebilir.
-- Uygulama katmanı atlansa bile (örn. doğrudan Supabase API'sine kayıt isteği) veritabanı reddeder.
-- Alan adını değiştirmek için bu fonksiyonu yeni bir migration ile güncelle.

create or replace function public.enforce_allowed_email_domain()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is null
     or new.email !~ '^[^@]+@[^@]+$'
     or lower(split_part(new.email, '@', 2)) <> 'gradeup.solutions' then
    raise exception 'Yalnızca @gradeup.solutions adresleri kullanılabilir.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_allowed_email_domain on auth.users;
create trigger enforce_allowed_email_domain
  before insert or update of email on auth.users
  for each row execute function public.enforce_allowed_email_domain();
