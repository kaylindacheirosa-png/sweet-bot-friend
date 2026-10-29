ALTER TABLE public.typing_battle_settings ADD COLUMN next_run_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.typing_battle_settings ALTER COLUMN frequency_minutes SET DEFAULT 30;
CREATE TABLE public.telegram_typing_rounds (
 chat_id bigint PRIMARY KEY REFERENCES public.typing_battle_settings(chat_id) ON DELETE CASCADE,
 token uuid NOT NULL DEFAULT gen_random_uuid(),
 game text NOT NULL CHECK (game IN ('sinopse','peitoral')),
 round_id uuid REFERENCES public.sinopse_rounds(id) ON DELETE CASCADE,
 snapshot jsonb NOT NULL,
 status text NOT NULL DEFAULT 'sending' CHECK (status IN ('sending','open','won','failed')),
 message_id bigint,
 started_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 winner_id bigint
);
GRANT ALL ON public.telegram_typing_rounds TO service_role;
ALTER TABLE public.telegram_typing_rounds ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.telegram_typing_settings_changed() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_OP='INSERT' OR NEW.enabled IS DISTINCT FROM OLD.enabled OR NEW.style IS DISTINCT FROM OLD.style OR NEW.frequency_minutes IS DISTINCT FROM OLD.frequency_minutes THEN
  NEW.next_run_at := now();
  DELETE FROM public.telegram_typing_rounds WHERE chat_id=NEW.chat_id;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER typing_settings_changed BEFORE INSERT OR UPDATE ON public.typing_battle_settings FOR EACH ROW EXECUTE FUNCTION public.telegram_typing_settings_changed();
CREATE FUNCTION public.telegram_typing_prepare(p_chat_id bigint,p_game text,p_round_id uuid,p_snapshot jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.typing_battle_settings; r public.telegram_typing_rounds; minutes integer;
BEGIN
 SELECT * INTO s FROM public.typing_battle_settings WHERE chat_id=p_chat_id FOR UPDATE;
 IF NOT FOUND OR NOT s.enabled OR s.next_run_at>now() OR NOT (s.style=p_game OR s.style='ambos') THEN RETURN NULL; END IF;
 minutes := CASE WHEN s.frequency_minutes IN (30,60,120,300) THEN s.frequency_minutes ELSE 30 END;
 INSERT INTO public.telegram_typing_rounds(chat_id,game,round_id,snapshot,expires_at) VALUES(p_chat_id,p_game,p_round_id,p_snapshot,now()+make_interval(mins=>minutes))
 ON CONFLICT(chat_id) DO UPDATE SET token=gen_random_uuid(),game=excluded.game,round_id=excluded.round_id,snapshot=excluded.snapshot,status='sending',message_id=NULL,started_at=now(),expires_at=excluded.expires_at,winner_id=NULL RETURNING * INTO r;
 UPDATE public.typing_battle_settings SET next_run_at=now()+make_interval(mins=>minutes) WHERE chat_id=p_chat_id;
 RETURN to_jsonb(r);
END $$;
CREATE FUNCTION public.telegram_typing_claim(p_chat_id bigint,p_token uuid,p_user_id bigint,p_message_date bigint) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 UPDATE public.telegram_typing_rounds r SET status='won',winner_id=p_user_id
 WHERE r.chat_id=p_chat_id AND r.token=p_token AND r.status='open' AND r.expires_at>now() AND p_message_date>=floor(extract(epoch from r.started_at))
 AND EXISTS(SELECT 1 FROM public.typing_battle_settings s WHERE s.chat_id=r.chat_id AND s.enabled AND (s.style=r.game OR s.style='ambos'));
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.telegram_typing_prepare(bigint,text,uuid,jsonb),public.telegram_typing_claim(bigint,uuid,bigint,bigint),public.telegram_typing_settings_changed() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.telegram_typing_prepare(bigint,text,uuid,jsonb),public.telegram_typing_claim(bigint,uuid,bigint,bigint) TO service_role;