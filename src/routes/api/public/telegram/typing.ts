import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { z } from "zod";

export const Route = createFileRoute("/api/public/telegram/typing")({
  server: { handlers: { POST: async ({ request }) => {
    const failure = await authenticateCronRequest(request);
    if (failure) return failure;
    const body = z.object({ kind: z.literal("typing-battle") }).safeParse(await request.json().catch(() => null));
    if (!body.success) return Response.json({ ok: false }, { status: 400 });
    const { dispatchTypingBattles } = await import("@/lib/telegram-typing.server");
    return Response.json(await dispatchTypingBattles());
  } } },
});