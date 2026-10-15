-- Persistent Telegram Gens balance and atomic daily claim.
create table if not exists public.telegram_gens (
  telegram_user_id bigint primary key,
  username text,
  balance bigint not null default 0 check (balance >= 0),
  last_daily_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.telegram_gens enable row level security;

create or replace function public.claim_telegram_daily(p_user_id bigint, p_username text default null)
returns table(ok boolean, balance bigint, next_daily_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.telegram_gens%rowtype;
  v_now timestamptz := now();
begin
  insert into public.telegram_gens (telegram_user_id, username)
  values (p_user_id, p_username)
  on conflict (telegram_user_id) do nothing;

  select * into v_row
  from public.telegram_gens
  where telegram_user_id = p_user_id
  for update;

  if v_row.last_daily_at is not null and v_row.last_daily_at > v_now - interval '24 hours' then
    return query select false, v_row.balance, v_row.last_daily_at + interval '24 hours';
    return;
  end if;

  update public.telegram_gens
  set balance = balance + 200,
      last_daily_at = v_now,
      username = coalesce(p_username, username),
      updated_at = v_now
  where telegram_user_id = p_user_id
  returning * into v_row;

  return query select true, v_row.balance, v_row.last_daily_at + interval '24 hours';
end;
$$;

create or replace function public.get_telegram_gens(p_user_id bigint, p_username text default null)
returns table(balance bigint, next_daily_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.telegram_gens (telegram_user_id, username)
  values (p_user_id, p_username)
  on conflict (telegram_user_id) do nothing;

  return query
  select g.balance,
         case when g.last_daily_at is null then null
              else g.last_daily_at + interval '24 hours' end
  from public.telegram_gens g
  where g.telegram_user_id = p_user_id;
end;
$$;

revoke all on function public.claim_telegram_daily(bigint, text) from public, anon, authenticated;
revoke all on function public.get_telegram_gens(bigint, text) from public, anon, authenticated;
grant execute on function public.claim_telegram_daily(bigint, text) to service_role;
grant execute on function public.get_telegram_gens(bigint, text) to service_role;
