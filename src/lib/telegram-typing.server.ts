import { z } from "zod";
import { selectedTypingStyles } from "@/lib/telegram-responses.server";
import { buildSinopseRound, buildCorrectMessage, normalize, parseAnswers, toRounds } from "@/lib/telegram-sinopse.server";

const roundSchema = z.object({
  id: z.string().uuid(), synopsis: z.string(), answer: z.string(),
  photo_file_id: z.string().nullable().optional(),
});
type Round = z.infer<typeof roundSchema>;
type Game = "sinopse" | "peitoral";
export type TypingTransport = {
  send: (chat: number, text: string) => Promise<number | null>;
  photo: (chat: number, photo: string, text: string) => Promise<number | null>;
};

export function matchesTypingAnswer(answer: string, guess: string) {
  const value = normalize(guess);
  return Boolean(value) && parseAnswers(answer).some(a => normalize(a) === value);
}

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function send(method: string, payload: Record<string, unknown>): Promise<number | null> {
  const response = await fetch(`https://connector-gateway.lovable.dev/telegram/${method}`, {
    method: "POST", headers: {
      Authorization: `Bearer ${process.env["LOVABLE_API_KEY"]}`,
      "X-Connection-Api-Key": process.env["TELEGRAM_API_KEY"] ?? "",
      "Content-Type": "application/json",
    }, body: JSON.stringify({ ...payload, parse_mode: "HTML" }), signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`Typing Battle Telegram delivery failed: ${response.status}`);
  const data = await response.json() as { ok?: boolean; result?: { message_id?: number } };
  return data.result?.message_id ?? null;
}
export const typingTransport: TypingTransport = {
  send: (chat, text) => send("sendMessage", { chat_id: chat, text }),
  photo: (chat, photo, caption) => send("sendPhoto", { chat_id: chat, photo, caption }),
};

/** One durable single-round battle per due chat; concurrent jobs claim it atomically. */
export async function dispatchTypingBattles(io: TypingTransport = typingTransport, chatId?: number) {
  const sb = await db();
  let query = sb.from("typing_battle_settings").select("chat_id,style").eq("enabled", true).lte("next_run_at", new Date().toISOString()).order("next_run_at").limit(20);
  if (chatId !== undefined) query = query.eq("chat_id", chatId);
  const { data: chats, error } = await query;
  if (error) throw error;
  let sent = 0;
  for (const chat of chats ?? []) {
    const styles = selectedTypingStyles(chat.style) as Game[];
    if (!styles.length) continue;
    const { data: rows, error: loadError } = await sb.from("sinopse_rounds").select("id,synopsis,answer,photo_file_id,game").in("game", styles);
    if (loadError) throw loadError;
    const valid = (rows ?? []).filter(r => parseAnswers(r.answer).length > 0);
    if (!valid.length) continue;
    const available = styles.filter(style => valid.some(r => r.game === style));
    const game = available[Math.floor(Math.random() * available.length)];
    if (!game) continue;
    const pool = valid.filter(r => r.game === game);
    const row = pool[Math.floor(Math.random() * pool.length)];
    if (!row) continue;
    const { data: prepared, error: prepareError } = await sb.rpc("telegram_typing_prepare", {
      p_chat_id: chat.chat_id, p_game: game, p_round_id: row.id, p_snapshot: row,
    });
    if (prepareError) throw prepareError;
    const claim = z.object({ token: z.string().uuid() }).safeParse(prepared);
    if (!claim.success) continue;
    try {
      const round = toRounds([row])[0];
      if (!round) continue;
      // Explicit default distinguishes text sinopse rounds from peitoral rounds.
      const state = game === "peitoral"
        ? { order: [0], position: 0, players: [], rounds: [round], game: "peitoral" as const }
        : { order: [0], position: 0, players: [], rounds: [round] };
      const text = buildSinopseRound(state);
      const messageId = row.photo_file_id
        ? await io.photo(chat.chat_id, row.photo_file_id, text)
        : await io.send(chat.chat_id, text);
      if (messageId === null) throw new Error("Typing Battle question was not delivered");
      const { data: opened, error: openError } = await sb.from("telegram_typing_rounds").update({ status: "open", message_id: messageId }).eq("chat_id", chat.chat_id).eq("token", claim.data.token).select("chat_id");
      if (openError) throw openError;
      if (opened?.length) {
        const { recordContentMessage } = await import("@/lib/telegram-content.server");
        await recordContentMessage(chat.chat_id, messageId, "round", row.id);
        sent++;
      }
    } catch (deliveryError) {
      console.error("Typing Battle delivery failed", deliveryError instanceof Error ? deliveryError.message : "unknown");
      await sb.from("telegram_typing_rounds").update({ status: "failed" }).eq("chat_id", chat.chat_id).eq("token", claim.data.token);
    }
  }
  return { sent };
}

const messageSchema = z.object({ message: z.object({
  text: z.string(), date: z.number().int(), chat: z.object({ id: z.number().int() }),
  from: z.object({ id: z.number().int(), is_bot: z.boolean().optional(), first_name: z.string().optional(), last_name: z.string().optional(), username: z.string().optional() }),
}) });

export async function handleTypingGuess(update: unknown, io: TypingTransport): Promise<boolean> {
  const parsed = messageSchema.safeParse(update);
  if (!parsed.success) return false;
  const message = parsed.data.message;
  if (message.from.is_bot || message.text.trim().startsWith("/")) return false;
  const sb = await db();
  const { data: active, error } = await sb.from("telegram_typing_rounds").select("token,snapshot").eq("chat_id", message.chat.id).eq("status", "open").gt("expires_at", new Date().toISOString()).maybeSingle();
  if (error) throw error;
  if (!active) return false;
  const round = roundSchema.safeParse(active.snapshot);
  if (!round.success || !matchesTypingAnswer(round.data.answer, message.text)) return true;
  const { data: won, error: claimError } = await sb.rpc("telegram_typing_claim", {
    p_chat_id: message.chat.id, p_token: active.token, p_user_id: message.from.id, p_message_date: message.date,
  });
  if (claimError) throw claimError;
  if (won) {
    const name = [message.from.first_name, message.from.last_name].filter(Boolean).join(" ") || message.from.username || "Participante";
    await io.send(message.chat.id, buildCorrectMessage(name, round.data.answer));
  }
  return true;
}