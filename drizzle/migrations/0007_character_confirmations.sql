CREATE TABLE public.telegram_pending_confirmations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id bigint NOT NULL, chat_id bigint NOT NULL,
 action text NOT NULL CHECK (action IN ('buy','divorce','give')),
 args jsonb NOT NULL DEFAULT '{}'::jsonb,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','cancelled')),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now() + interval '10 minutes');
GRANT ALL ON public.telegram_pending_confirmations TO service_role;
ALTER TABLE public.telegram_pending_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_trades ADD COLUMN proposer_confirmed boolean NOT NULL DEFAULT false, ADD COLUMN recipient_confirmed boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION public.telegram_character_action(p_user_id bigint, p_username text, p_action text, p_args jsonb, p_event_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.telegram_pending_confirmations%rowtype; c record; t public.telegram_trades%rowtype; r jsonb; v_target bigint; v_amount bigint; v_balance bigint; v_id uuid; other_c public.telegram_characters%rowtype;
BEGIN
 PERFORM pg_advisory_xact_lock(873264112);
 IF p_event_key IS NULL OR length(p_event_key) > 200 THEN RAISE EXCEPTION 'invalid event'; END IF;
 SELECT result INTO r FROM public.telegram_economy_events WHERE event_key = p_event_key;
 IF FOUND THEN RETURN r; END IF;
 INSERT INTO public.telegram_gens(telegram_user_id, username) VALUES(p_user_id, nullif(p_username,'')) ON CONFLICT(telegram_user_id) DO UPDATE SET username = coalesce(nullif(EXCLUDED.username,''), telegram_gens.username);
 r := jsonb_build_object('ok',true);
 IF p_action = 'register' THEN RETURN r;
 ELSIF p_action = 'add' THEN
  IF p_user_id <> 6733728637 THEN RETURN jsonb_build_object('ok',false,'message','Cadastro não autorizado.'); END IF;
  INSERT INTO public.telegram_characters(name,name_key,work,base_price,photo_file_id) VALUES(p_args->>'name',p_args->>'name_key',p_args->>'work',(p_args->>'base_price')::bigint,p_args->>'photo_file_id') ON CONFLICT(name_key) DO NOTHING RETURNING id INTO v_id;
  r := jsonb_build_object('ok',v_id IS NOT NULL,'message',CASE WHEN v_id IS NULL THEN 'Já existe um personagem com esse nome.' ELSE 'Personagem cadastrado! Use /im com o nome para vê-lo.' END);
 ELSIF p_action IN ('wish','buy','divorce') THEN
  SELECT * INTO c FROM public.telegram_character_catalog WHERE name_key = p_args->>'name_key';
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'message','Personagem não encontrado.'); END IF;
  IF p_action = 'wish' THEN
   IF EXISTS(SELECT 1 FROM public.telegram_wishes WHERE user_id=p_user_id AND character_id=c.id) THEN
    DELETE FROM public.telegram_wishes WHERE user_id=p_user_id AND character_id=c.id;
    r := jsonb_build_object('ok',true,'message','Personagem removido dos seus desejos.');
   ELSIF (SELECT count(*) FROM public.telegram_wishes WHERE user_id=p_user_id) >= 5 THEN
    r := jsonb_build_object('ok',false,'message','Você já tem 5 desejos. Remova um usando /wish com o nome antes de adicionar outro.');
   ELSE
    INSERT INTO public.telegram_wishes(user_id,character_id) VALUES(p_user_id,c.id);
    r := jsonb_build_object('ok',true,'message','Personagem adicionado aos seus desejos!');
   END IF;
  ELSIF p_action = 'buy' THEN
   SELECT balance INTO v_balance FROM public.telegram_gens WHERE telegram_user_id=p_user_id FOR UPDATE;
   IF c.owner_id IS NOT NULL THEN r:=jsonb_build_object('ok',false,'message','Esse personagem já está casado.');
   ELSIF v_balance < c.price THEN r:=jsonb_build_object('ok',false,'message','Gems insuficientes.','code','insufficient','balance',v_balance,'price',c.price);
   ELSE
    UPDATE public.telegram_gens SET balance=balance-c.price,updated_at=now() WHERE telegram_user_id=p_user_id;
    UPDATE public.telegram_characters SET owner_id=p_user_id,paid_price=c.price,purchases=purchases+1 WHERE id=c.id;
    r:=jsonb_build_object('ok',true,'message','Casamento realizado.','code','married','character_name',c.name,'price',c.price,'character_id',c.id);
   END IF;
  ELSE
   IF c.owner_id IS DISTINCT FROM p_user_id THEN r:=jsonb_build_object('ok',false,'message','Esse personagem não está casado com você.');
   ELSE
    UPDATE public.telegram_gens SET balance=balance+c.paid_price,updated_at=now() WHERE telegram_user_id=p_user_id;
    UPDATE public.telegram_characters SET owner_id=NULL,paid_price=0 WHERE id=c.id;
    r:=jsonb_build_object('ok',true,'message','Divórcio realizado.','code','divorced','character_name',c.name,'refund',c.paid_price);
   END IF;
  END IF;
 ELSIF p_action = 'give' THEN
  v_target := (p_args->>'target_id')::bigint; v_amount := (p_args->>'amount')::bigint;
  IF v_target=p_user_id OR v_amount<=0 OR v_amount>1000000000 THEN RETURN jsonb_build_object('ok',false,'message','Escolha outra pessoa e uma quantidade válida de Gems.'); END IF;
  INSERT INTO public.telegram_gens(telegram_user_id,username) VALUES(v_target,p_args->>'target_username') ON CONFLICT(telegram_user_id) DO UPDATE SET username=coalesce(EXCLUDED.username,telegram_gens.username);
  PERFORM telegram_user_id FROM public.telegram_gens WHERE telegram_user_id IN(p_user_id,v_target) ORDER BY telegram_user_id FOR UPDATE;
  SELECT balance INTO v_balance FROM public.telegram_gens WHERE telegram_user_id=p_user_id;
  IF v_balance<v_amount THEN r:=jsonb_build_object('ok',false,'message','Gems insuficientes para esse presente.');
  ELSE
   UPDATE public.telegram_gens SET balance=balance-v_amount,updated_at=now() WHERE telegram_user_id=p_user_id;
   UPDATE public.telegram_gens SET balance=balance+v_amount,updated_at=now() WHERE telegram_user_id=v_target;
   r:=jsonb_build_object('ok',true,'message','Presente enviado.','code','gift','amount',v_amount,'target_id',v_target,'target_username',(SELECT username FROM public.telegram_gens WHERE telegram_user_id=v_target),'sender_username',(SELECT username FROM public.telegram_gens WHERE telegram_user_id=p_user_id));
  END IF;
 ELSIF p_action = 'trade_start' THEN
  SELECT telegram_user_id INTO v_target FROM public.telegram_gens WHERE lower(username)=lower(p_args->>'target_username') AND telegram_user_id<>p_user_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'message','Não encontrei essa pessoa. Peça para ela enviar um comando ao bot e tente novamente.'); END IF;
  IF EXISTS(SELECT 1 FROM public.telegram_trades WHERE status IN('pending','accepted') AND expires_at>now() AND (proposer_id IN(p_user_id,v_target) OR recipient_id IN(p_user_id,v_target))) THEN RETURN jsonb_build_object('ok',false,'message','Uma das pessoas já tem uma troca em andamento.'); END IF;
  INSERT INTO public.telegram_trades(chat_id,proposer_id,recipient_id) VALUES((p_args->>'chat_id')::bigint,p_user_id,v_target) RETURNING id INTO v_id;
  r:=jsonb_build_object('ok',true,'message','@' || (p_args->>'target_username') || ', você aceita trocar personagens?','trade_id',v_id);
 ELSIF p_action IN('trade_accept','trade_reject','trade_select') THEN
  IF p_action='trade_select' THEN
   SELECT * INTO t FROM public.telegram_trades WHERE status='accepted' AND expires_at>now() AND chat_id=(p_args->>'chat_id')::bigint AND p_user_id IN(proposer_id,recipient_id) ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  ELSE
   SELECT * INTO t FROM public.telegram_trades WHERE id=(p_args->>'trade_id')::uuid AND chat_id=(p_args->>'chat_id')::bigint FOR UPDATE;
  END IF;
  IF NOT FOUND OR t.expires_at<=now() OR t.status NOT IN('pending','accepted') THEN RETURN jsonb_build_object('ok',false,'message','Essa troca terminou ou expirou.'); END IF;
  IF p_action IN('trade_accept','trade_reject') THEN
   IF t.recipient_id<>p_user_id OR t.status<>'pending' THEN RETURN jsonb_build_object('ok',false,'message','Só a pessoa convidada pode responder a essa troca.'); END IF;
   UPDATE public.telegram_trades SET status=CASE WHEN p_action='trade_accept' THEN 'accepted' ELSE 'rejected' END WHERE id=t.id;
   r:=jsonb_build_object('ok',true,'message',CASE WHEN p_action='trade_accept' THEN 'Troca aceita! Cada pessoa deve enviar o nome do seu personagem neste chat. Use /cancelar para desistir.' ELSE 'Troca recusada.' END);
  ELSE
   SELECT * INTO c FROM public.telegram_characters WHERE name_key=p_args->>'name_key';
   IF NOT FOUND OR c.owner_id IS DISTINCT FROM p_user_id THEN RETURN jsonb_build_object('ok',false,'message','Escolha um personagem que esteja casado com você.'); END IF;
   UPDATE public.telegram_trades SET proposer_character=CASE WHEN p_user_id=t.proposer_id THEN c.id ELSE proposer_character END,recipient_character=CASE WHEN p_user_id=t.recipient_id THEN c.id ELSE recipient_character END,proposer_confirmed=false,recipient_confirmed=false WHERE id=t.id RETURNING * INTO t;
   IF t.proposer_character IS NOT NULL AND t.recipient_character IS NOT NULL THEN
    SELECT * INTO c FROM public.telegram_characters WHERE id=t.proposer_character;
    SELECT * INTO other_c FROM public.telegram_characters WHERE id=t.recipient_character;
    r:=jsonb_build_object('ok',true,'code','trade_confirm','trade_id',t.id,'message','Personagens escolhidos: ' || c.name || ' ⇄ ' || other_c.name || '. As duas pessoas precisam confirmar a troca.');
   ELSE r:=jsonb_build_object('ok',true,'message','Personagem escolhido. Aguardando a outra pessoa.'); END IF;
  END IF;
 ELSIF p_action='trade_confirm' THEN
  SELECT * INTO t FROM public.telegram_trades WHERE id=(p_args->>'trade_id')::uuid AND chat_id=(p_args->>'chat_id')::bigint FOR UPDATE;
  IF NOT FOUND OR t.expires_at<=now() OR t.status<>'accepted' OR t.proposer_character IS NULL OR t.recipient_character IS NULL THEN RETURN jsonb_build_object('ok',false,'message','Essa troca terminou ou expirou.'); END IF;
  IF p_user_id NOT IN(t.proposer_id,t.recipient_id) THEN RETURN jsonb_build_object('ok',false,'message','Só as pessoas da troca podem confirmá-la.'); END IF;
  UPDATE public.telegram_trades SET proposer_confirmed=proposer_confirmed OR p_user_id=proposer_id,recipient_confirmed=recipient_confirmed OR p_user_id=recipient_id WHERE id=t.id RETURNING * INTO t;
  IF t.proposer_confirmed AND t.recipient_confirmed THEN
    PERFORM id FROM public.telegram_characters WHERE id IN(t.proposer_character,t.recipient_character) ORDER BY id FOR UPDATE;
    SELECT * INTO c FROM public.telegram_characters WHERE id=t.proposer_character;
    SELECT * INTO other_c FROM public.telegram_characters WHERE id=t.recipient_character;
    IF c.owner_id IS DISTINCT FROM t.proposer_id OR other_c.owner_id IS DISTINCT FROM t.recipient_id THEN
     UPDATE public.telegram_trades SET status='cancelled' WHERE id=t.id;
     r:=jsonb_build_object('ok',false,'message','Troca cancelada: um personagem mudou de dono.');
    ELSE
     UPDATE public.telegram_characters SET owner_id=CASE WHEN id=t.proposer_character THEN t.recipient_id ELSE t.proposer_id END WHERE id IN(t.proposer_character,t.recipient_character);
     UPDATE public.telegram_trades SET status='completed' WHERE id=t.id;
     r:=jsonb_build_object('ok',true,'message','Troca concluída! ' || c.name || ' e ' || other_c.name || ' trocaram de cônjuge.');
    END IF;
  ELSE r:=jsonb_build_object('ok',true,'message','Confirmação registrada. Aguardando a outra pessoa.'); END IF;
 ELSIF p_action='confirm_request' THEN
  IF p_args->>'action' NOT IN('buy','divorce','give') THEN RAISE EXCEPTION 'invalid confirmation'; END IF;
  IF p_args->>'action'='give' THEN
   v_amount := (p_args->'args'->>'amount')::bigint;
   SELECT balance INTO v_balance FROM public.telegram_gens WHERE telegram_user_id=p_user_id;
   IF v_balance<v_amount THEN RETURN jsonb_build_object('ok',false,'message','Gems insuficientes para esse presente.'); END IF;
   r:=jsonb_build_object('ok',true,'message','Deseja enviar ' || v_amount || ' Gems de presente?');
  ELSE
   SELECT * INTO c FROM public.telegram_character_catalog WHERE name_key=p_args->'args'->>'name_key';
   IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'message','Personagem não encontrado.'); END IF;
   IF p_args->>'action'='buy' THEN
    SELECT balance INTO v_balance FROM public.telegram_gens WHERE telegram_user_id=p_user_id;
    IF c.owner_id IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'message','Esse personagem já está casado.'); END IF;
    IF v_balance<c.price THEN RETURN jsonb_build_object('ok',false,'message','Gems insuficientes.','code','insufficient','balance',v_balance,'price',c.price); END IF;
    r:=jsonb_build_object('ok',true,'message','Deseja se casar com ' || c.name || ' por ' || c.price || ' Gems?');
   ELSE
    IF c.owner_id IS DISTINCT FROM p_user_id THEN RETURN jsonb_build_object('ok',false,'message','Esse personagem não está casado com você.'); END IF;
    r:=jsonb_build_object('ok',true,'message','Deseja mesmo se divorciar de ' || c.name || '? Você receberá ' || c.paid_price || ' Gems de volta.');
   END IF;
  END IF;
  INSERT INTO public.telegram_pending_confirmations(user_id,chat_id,action,args) VALUES(p_user_id,(p_args->>'chat_id')::bigint,p_args->>'action',p_args->'args') RETURNING id INTO v_id;
  r:=r || jsonb_build_object('code','confirm','confirmation_id',v_id);
 ELSIF p_action='confirm' THEN
  SELECT * INTO p FROM public.telegram_pending_confirmations WHERE id=(p_args->>'confirmation_id')::uuid FOR UPDATE;
  IF NOT FOUND OR p.user_id<>p_user_id OR p.chat_id<>(p_args->>'chat_id')::bigint THEN RETURN jsonb_build_object('ok',false,'message','Só quem pediu pode confirmar essa ação.'); END IF;
  IF p.status<>'pending' OR p.expires_at<=now() THEN RETURN jsonb_build_object('ok',false,'message','Essa confirmação expirou. Envie o comando novamente.'); END IF;
  UPDATE public.telegram_pending_confirmations SET status=CASE WHEN p_args->>'decision'='yes' THEN 'confirmed' ELSE 'cancelled' END WHERE id=p.id;
  IF p_args->>'decision'='yes' THEN r:=public.telegram_character_action(p_user_id,p_username,p.action,p.args,left(p_event_key,190) || ':run');
  ELSE r:=jsonb_build_object('ok',true,'message','Ação cancelada.'); END IF;
 ELSIF p_action='trade_cancel' THEN
  UPDATE public.telegram_trades SET status='cancelled' WHERE status IN('pending','accepted') AND chat_id=(p_args->>'chat_id')::bigint AND p_user_id IN(proposer_id,recipient_id);
  r:=jsonb_build_object('ok',true,'message','Troca cancelada.');
 ELSE RAISE EXCEPTION 'unknown action'; END IF;
 INSERT INTO public.telegram_economy_events(event_key,user_id,action,result) VALUES(p_event_key,p_user_id,p_action,r);
 RETURN r;
END;
$$;
REVOKE ALL ON FUNCTION public.telegram_character_action(bigint,text,text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.telegram_character_action(bigint,text,text,jsonb,text) TO service_role;