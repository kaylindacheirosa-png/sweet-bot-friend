CREATE OR REPLACE FUNCTION public.telegram_typing_settings_changed() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  NEW.next_run_at := now();
 ELSIF NEW.enabled IS DISTINCT FROM OLD.enabled OR NEW.style IS DISTINCT FROM OLD.style THEN
  NEW.next_run_at := now();
  DELETE FROM public.telegram_typing_rounds WHERE chat_id=NEW.chat_id;
 ELSIF NEW.frequency_minutes IS DISTINCT FROM OLD.frequency_minutes THEN
  NEW.next_run_at := now() + make_interval(mins => CASE WHEN NEW.frequency_minutes IN (30,60,120,300) THEN NEW.frequency_minutes ELSE 30 END);
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.telegram_typing_settings_changed() FROM PUBLIC,anon,authenticated;