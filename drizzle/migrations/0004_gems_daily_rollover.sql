drop function if exists public.claim_telegram_daily(bigint, text);
drop function if exists public.get_telegram_gens(bigint, text);

create or replace function public.claim_telegram_daily(
  p_user_id bigint,
  p_username text default null,
  p_amount integer default 100,
  p_ignore_limit boolean default false
)
returns table(ok boolean, balance bigint, next_daily_at timestamptz, is_first boolean)
language plpgsql security definer set search_path = public
as $$
declare
  v_row public.telegram_gens%rowtype;
  v_now timestamptz := now();
  v_today_start timestamptz := (date_trunc('day', v_now at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo');
  v_next timestamptz := v_today_start + interval '1 day';
  v_first boolean;
begin
  insert into public.telegram_gens (telegram_user_id, username)
  values (p_user_id, p_username) on conflict (telegram_user_id) do nothing;
  select * into v_row from public.telegram_gens where telegram_user_id = p_user_id for update;
  v_first := v_row.last_daily_at is null;
  if not v_first and not p_ignore_limit and v_row.last_daily_at >= v_today_start then
    return query select false, v_row.balance, v_next, false;
    return;
  end if;
  update public.telegram_gens g
  set balance = g.balance + case when v_first then 200 else greatest(p_amount, 0) end,
      last_daily_at = v_now,
      username = coalesce(p_username, g.username),
      updated_at = v_now
  where g.telegram_user_id = p_user_id
  returning * into v_row;
  return query select true, v_row.balance, v_next, v_first;
end;
$$;

create or replace function public.get_telegram_gens(p_user_id bigint, p_username text default null)
returns table(balance bigint, next_daily_at timestamptz)
language plpgsql security definer set search_path = public
as $$
declare
  v_today_start timestamptz := (date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo');
begin
  insert into public.telegram_gens (telegram_user_id, username)
  values (p_user_id, p_username) on conflict (telegram_user_id) do nothing;
  return query
  select g.balance,
         case when g.last_daily_at is not null and g.last_daily_at >= v_today_start
              then v_today_start + interval '1 day' else null end
  from public.telegram_gens g where g.telegram_user_id = p_user_id;
end;
$$;

revoke all on function public.claim_telegram_daily(bigint, text, integer, boolean) from public, anon, authenticated;
revoke all on function public.get_telegram_gens(bigint, text) from public, anon, authenticated;
grant execute on function public.claim_telegram_daily(bigint, text, integer, boolean) to service_role;
grant execute on function public.get_telegram_gens(bigint, text) to service_role;