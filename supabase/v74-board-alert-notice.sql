-- DalTownMap V74: 게시판 공지 필드 추가
-- Supabase SQL Editor에서 한 번 실행하세요.

DO $$
BEGIN
  IF to_regclass('public.posts') IS NOT NULL THEN
    ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS is_alert_notice boolean NOT NULL DEFAULT false;
    ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS alert_order integer NOT NULL DEFAULT 999;
    CREATE INDEX IF NOT EXISTS posts_alert_notice_idx
      ON public.posts (region, is_alert_notice, alert_order, created_at DESC)
      WHERE is_alert_notice = true AND is_active = true;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.board_posts') IS NOT NULL THEN
    ALTER TABLE public.board_posts ADD COLUMN IF NOT EXISTS is_alert_notice boolean NOT NULL DEFAULT false;
    ALTER TABLE public.board_posts ADD COLUMN IF NOT EXISTS alert_order integer NOT NULL DEFAULT 999;
    CREATE INDEX IF NOT EXISTS board_posts_alert_notice_idx
      ON public.board_posts (region, is_alert_notice, alert_order, created_at DESC)
      WHERE is_alert_notice = true AND is_active = true;
  END IF;
END $$;
