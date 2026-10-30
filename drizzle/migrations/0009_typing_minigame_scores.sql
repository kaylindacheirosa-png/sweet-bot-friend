CREATE TABLE public.telegram_group_scores (
 board text NOT NULL CHECK (board IN ('typing','games')),
 chat_id bigint NOT NULL,
 user_id bigint NOT NULL,
 name text NOT NULL,
 username text,
 points integer NOT NULL DEFAULT 0,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (board, chat_id, user_id)
);
GRANT ALL ON public.telegram_group_scores TO service_role;
ALTER TABLE public.telegram_group_scores ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.telegram_typing_prepare(p_chat_id bigint,p_game text,p_round_id uuid,p_snapshot jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.typing_battle_settings; r public.telegram_typing_rounds; minutes integer;
BEGIN
 SELECT * INTO s FROM public.typing_battle_settings WHERE chat_id=p_chat_id FOR UPDATE;
 IF NOT FOUND OR NOT s.enabled OR s.next_run_at>now() OR NOT (s.style=p_game OR s.style='ambos') THEN RETURN NULL; END IF;
 minutes := CASE WHEN s.frequency_minutes IN (30,60,120,300) THEN s.frequency_minutes ELSE 30 END;
 INSERT INTO public.telegram_typing_rounds(chat_id,game,round_id,snapshot,expires_at) VALUES(p_chat_id,p_game,p_round_id,p_snapshot,now()+interval '10 minutes')
 ON CONFLICT(chat_id) DO UPDATE SET token=gen_random_uuid(),game=excluded.game,round_id=excluded.round_id,snapshot=excluded.snapshot,status='sending',message_id=NULL,started_at=now(),expires_at=excluded.expires_at,winner_id=NULL RETURNING * INTO r;
 UPDATE public.typing_battle_settings SET next_run_at=now()+make_interval(mins=>minutes) WHERE chat_id=p_chat_id;
 RETURN to_jsonb(r);
END $$;

CREATE FUNCTION public.telegram_typing_claim_points(p_chat_id bigint,p_token uuid,p_user_id bigint,p_message_date bigint,p_name text,p_username text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.telegram_typing_rounds; elapsed integer; pts integer;
BEGIN
 UPDATE public.telegram_typing_rounds t SET status='won',winner_id=p_user_id
 WHERE t.chat_id=p_chat_id AND t.token=p_token AND t.status='open' AND t.expires_at>now() AND p_message_date>=floor(extract(epoch from t.started_at))
 AND EXISTS(SELECT 1 FROM public.typing_battle_settings s WHERE s.chat_id=t.chat_id AND s.enabled AND (s.style=t.game OR s.style='ambos'))
 RETURNING * INTO r;
 IF NOT FOUND THEN RETURN NULL; END IF;
 elapsed := greatest(0, p_message_date - floor(extract(epoch from r.started_at))::bigint);
 pts := CASE WHEN elapsed<=120 THEN 7 WHEN elapsed<=240 THEN 5 WHEN elapsed<=480 THEN 4 ELSE 2 END;
 INSERT INTO public.telegram_group_scores(board,chat_id,user_id,name,username,points) VALUES('typing',p_chat_id,p_user_id,p_name,p_username,pts)
 ON CONFLICT(board,chat_id,user_id) DO UPDATE SET points=telegram_group_scores.points+excluded.points,name=excluded.name,username=excluded.username,updated_at=now();
 RETURN jsonb_build_object('elapsed',elapsed,'points',pts);
END $$;

CREATE FUNCTION public.telegram_add_game_points(p_chat_id bigint,p_user_id bigint,p_name text,p_username text,p_points integer) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 INSERT INTO public.telegram_group_scores(board,chat_id,user_id,name,username,points) VALUES('games',p_chat_id,p_user_id,p_name,p_username,p_points)
 ON CONFLICT(board,chat_id,user_id) DO UPDATE SET points=telegram_group_scores.points+excluded.points,name=excluded.name,username=excluded.username,updated_at=now();
$$;
REVOKE ALL ON FUNCTION public.telegram_typing_claim_points(bigint,uuid,bigint,bigint,text,text),public.telegram_add_game_points(bigint,bigint,text,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.telegram_typing_claim_points(bigint,uuid,bigint,bigint,text,text),public.telegram_add_game_points(bigint,bigint,text,text,integer) TO service_role;