ALTER TABLE public.sinopse_rounds ADD COLUMN IF NOT EXISTS game text NOT NULL DEFAULT 'sinopse';
ALTER TABLE public.sinopse_rounds ADD COLUMN IF NOT EXISTS photo_file_id text;
ALTER TABLE public.bot_add_sessions ADD COLUMN IF NOT EXISTS game text;