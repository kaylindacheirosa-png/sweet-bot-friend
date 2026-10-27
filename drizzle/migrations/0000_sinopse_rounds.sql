CREATE TABLE public.sinopse_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  synopsis text NOT NULL,
  answer text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.sinopse_rounds TO service_role;
ALTER TABLE public.sinopse_rounds ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.bot_add_sessions (
  user_id bigint PRIMARY KEY,
  step text NOT NULL,
  synopsis text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.bot_add_sessions TO service_role;
ALTER TABLE public.bot_add_sessions ENABLE ROW LEVEL SECURITY;