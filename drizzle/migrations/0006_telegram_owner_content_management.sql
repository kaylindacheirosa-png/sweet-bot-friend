CREATE TABLE public.telegram_content_messages (
 chat_id bigint NOT NULL, message_id bigint NOT NULL, kind text NOT NULL CHECK(kind IN ('character','round')), target_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(chat_id,message_id)
);
GRANT ALL ON public.telegram_content_messages TO service_role;
ALTER TABLE public.telegram_content_messages ENABLE ROW LEVEL SECURITY;
CREATE INDEX telegram_content_messages_target ON public.telegram_content_messages(kind,target_id);
CREATE TABLE public.telegram_content_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id bigint NOT NULL, chat_id bigint NOT NULL, kind text NOT NULL CHECK(kind IN ('character','round')), target_id uuid NOT NULL, operation text NOT NULL CHECK(operation IN ('delete','edit')), field text, prompt_message_id bigint, expires_at timestamptz NOT NULL DEFAULT (now()+interval '15 minutes'), UNIQUE(user_id,chat_id)
);
GRANT ALL ON public.telegram_content_sessions TO service_role;
ALTER TABLE public.telegram_content_sessions ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.telegram_manage_content(p_user_id bigint,p_chat_id bigint,p_session_id uuid,p_action text,p_value jsonb,p_prompt_id bigint,p_event_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.telegram_content_sessions%rowtype; c public.telegram_characters%rowtype; v_text text; v_price bigint; r jsonb;
BEGIN
 IF p_user_id IS DISTINCT FROM 6733728637 THEN RETURN jsonb_build_object('ok',false,'message','Não autorizado.'); END IF;
 PERFORM pg_advisory_xact_lock(873264112);
 IF p_event_key IS NULL OR length(p_event_key)>200 THEN RAISE EXCEPTION 'invalid event'; END IF;
 SELECT result INTO r FROM public.telegram_economy_events WHERE event_key=p_event_key AND user_id=p_user_id AND action='manage_content';
 IF FOUND THEN RETURN r; END IF;
 SELECT * INTO s FROM public.telegram_content_sessions WHERE id=p_session_id AND user_id=p_user_id AND chat_id=p_chat_id FOR UPDATE;
 IF NOT FOUND OR s.expires_at<=now() OR s.prompt_message_id IS DISTINCT FROM p_prompt_id THEN RETURN jsonb_build_object('ok',false,'message','Essa solicitação expirou. Responda ao perfil ou à rodada novamente.'); END IF;
 IF p_action='cancel' THEN
  DELETE FROM public.telegram_content_sessions WHERE id=s.id;
  r:=jsonb_build_object('ok',true,'message','Operação cancelada.');
 ELSIF p_action='delete' AND s.operation='delete' THEN
  IF s.kind='character' THEN
   SELECT * INTO c FROM public.telegram_characters WHERE id=s.target_id FOR UPDATE;
   IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'message','Personagem não encontrado.'); END IF;
   IF c.owner_id IS NOT NULL THEN
    UPDATE public.telegram_gens SET balance=balance+c.paid_price,updated_at=now() WHERE telegram_user_id=c.owner_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'refund account missing'; END IF;
   END IF;
   UPDATE public.telegram_trades SET status=CASE WHEN status IN('pending','accepted') THEN 'cancelled' ELSE status END, proposer_character=CASE WHEN proposer_character=c.id THEN NULL ELSE proposer_character END, recipient_character=CASE WHEN recipient_character=c.id THEN NULL ELSE recipient_character END WHERE proposer_character=c.id OR recipient_character=c.id;
   DELETE FROM public.telegram_wishes WHERE character_id=c.id;
   DELETE FROM public.telegram_characters WHERE id=c.id;
   r:=jsonb_build_object('ok',true,'message','Personagem excluído.' || CASE WHEN c.owner_id IS NOT NULL THEN ' Foram devolvidos ' || c.paid_price || ' Gems à pessoa que estava casada com ele.' ELSE '' END);
  ELSE
   DELETE FROM public.sinopse_rounds WHERE id=s.target_id;
   IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'message','Rodada não encontrada.'); END IF;
   r:=jsonb_build_object('ok',true,'message','Rodada excluída.');
  END IF;
  DELETE FROM public.telegram_content_messages WHERE kind=s.kind AND target_id=s.target_id;
  DELETE FROM public.telegram_content_sessions WHERE kind=s.kind AND target_id=s.target_id;
 ELSIF p_action='save' AND s.operation='edit' THEN
  v_text:=btrim(p_value->>'text');
  IF s.kind='character' THEN
   IF s.field IN('name','work') THEN
    IF v_text IS NULL OR length(v_text)<1 OR length(v_text)>120 THEN RETURN jsonb_build_object('ok',false,'message','Envie um texto entre 1 e 120 caracteres.'); END IF;
    IF s.field='name' THEN
     IF p_value->>'name_key' IS NULL OR length(p_value->>'name_key')<1 THEN RAISE EXCEPTION 'invalid name key'; END IF;
     IF EXISTS(SELECT 1 FROM public.telegram_characters WHERE name_key=p_value->>'name_key' AND id<>s.target_id) THEN RETURN jsonb_build_object('ok',false,'message','Já existe um personagem com esse nome.'); END IF;
     UPDATE public.telegram_characters SET name=v_text,name_key=p_value->>'name_key' WHERE id=s.target_id;
    ELSE UPDATE public.telegram_characters SET work=v_text WHERE id=s.target_id; END IF;
   ELSIF s.field='base_price' THEN
    IF coalesce(p_value->>'amount','') !~ '^[0-9]{1,10}$' THEN RETURN jsonb_build_object('ok',false,'message','Envie um valor inteiro válido em Gems.'); END IF;
    v_price:=(p_value->>'amount')::bigint;
    IF v_price<1 OR v_price>1000000000 THEN RETURN jsonb_build_object('ok',false,'message','Envie um valor entre 1 e 1.000.000.000 Gems.'); END IF;
    UPDATE public.telegram_characters SET base_price=v_price WHERE id=s.target_id;
   ELSIF s.field='photo_file_id' THEN
    IF v_text IS NULL OR length(v_text)<1 OR length(v_text)>300 THEN RETURN jsonb_build_object('ok',false,'message','Envie uma foto válida.'); END IF;
    UPDATE public.telegram_characters SET photo_file_id=v_text WHERE id=s.target_id;
   ELSE RETURN jsonb_build_object('ok',false,'message','Campo inválido.'); END IF;
  ELSE
   IF s.field IN('synopsis','answer') THEN
    IF v_text IS NULL OR length(v_text)<1 OR length(v_text)>2000 OR (s.field='answer' AND v_text !~ '[^/[:space:]]') THEN RETURN jsonb_build_object('ok',false,'message','Envie um texto válido de até 2000 caracteres.'); END IF;
    IF s.field='synopsis' THEN UPDATE public.sinopse_rounds SET synopsis=v_text WHERE id=s.target_id;
    ELSE UPDATE public.sinopse_rounds SET answer=v_text WHERE id=s.target_id; END IF;
   ELSIF s.field='photo_file_id' THEN
    IF v_text IS NULL OR length(v_text)<1 OR length(v_text)>300 THEN RETURN jsonb_build_object('ok',false,'message','Envie uma foto válida.'); END IF;
    UPDATE public.sinopse_rounds SET photo_file_id=v_text WHERE id=s.target_id;
   ELSE RETURN jsonb_build_object('ok',false,'message','Campo inválido.'); END IF;
  END IF;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'message','Esse conteúdo não existe mais.'); END IF;
  DELETE FROM public.telegram_content_sessions WHERE id=s.id;
  r:=jsonb_build_object('ok',true,'message','Alteração salva.','kind',s.kind,'target_id',s.target_id);
 ELSE RETURN jsonb_build_object('ok',false,'message','Operação inválida.'); END IF;
 INSERT INTO public.telegram_economy_events(event_key,user_id,action,result) VALUES(p_event_key,p_user_id,'manage_content',r);
 RETURN r;
END;
$$;
REVOKE ALL ON FUNCTION public.telegram_manage_content(bigint,bigint,uuid,text,jsonb,bigint,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.telegram_manage_content(bigint,bigint,uuid,text,jsonb,bigint,text) TO service_role;