CREATE TABLE public.typing_battle_settings (
  chat_id BIGINT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT false,
  frequency_minutes INT NOT NULL DEFAULT 10,
  style TEXT NOT NULL DEFAULT 'sinopse',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.typing_battle_settings TO service_role;
ALTER TABLE public.typing_battle_settings ENABLE ROW LEVEL SECURITY;