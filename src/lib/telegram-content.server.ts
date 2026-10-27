import { z } from "zod";
import { characterKey, gemAmount, escapeTelegram } from "./telegram-characters.server";
import type { Json } from "@/integrations/supabase/types";

export const CONTENT_OWNER_ID = 6733728637;
const actor = z.object({ id: z.number().int().safe(), is_bot: z.boolean().optional() });
const reply = z.object({ message_id: z.number().int(), from: actor.optional(), text: z.string().optional(), caption: z.string().optional() });
const message = z.object({
  message_id: z.number().int(), chat: z.object({ id: z.number().int().safe() }),
  from: actor.optional(), text: z.string().max(4096).optional(),
  photo: z.array(z.object({ file_id: z.string().min(1).max(300) })).optional(),
  reply_to_message: reply.optional(),
});
const schema = z.object({
  update_id: z.number().int().safe(), message: message.optional(),
  callback_query: z.object({ id: z.string(), from: actor, data: z.string().max(64), message: message.optional() }).optional(),
});
export const mayManageContent = (id: number) => id === CONTENT_OWNER_ID;
export function editValue(field: string, text: string, photo?: string): Record<string, Json> | null {
  if (field === "base_price") {
    const amount = gemAmount.safeParse(text);
    return amount.success ? { amount: amount.data } : null;
  }
  if (field === "photo_file_id") return photo ? { text: photo } : null;
  const value = text.trim();
  if (!value || value.length > (["name", "work"].includes(field) ? 120 : 2000)) return null;
  if (field === "answer" && !value.split("/").some((part) => part.trim())) return null;
  return field === "name" ? { text: value, name_key: characterKey(value) } : { text: value };
}
export interface ContentTransport {
  send: (chat: number, text: string, keyboard?: { text: string; callback_data: string }[][]) => Promise<unknown>;
  answer: (id: string) => Promise<unknown>;
  botId: () => Promise<number | null>;
}
async function db() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}
export async function recordContentMessage(chat: number, result: unknown, kind: "character" | "round", target: string) {
  if (typeof result !== "number") return;
  const { error } = await (await db()).from("telegram_content_messages").upsert({ chat_id: chat, message_id: result, kind, target_id: target });
  if (error) throw error;
}
export async function handleContentUpdate(raw: unknown, io: ContentTransport): Promise<boolean> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return false;
  const u = parsed.data, cb = u.callback_query, msg = u.message;
  const text = msg?.text?.trim() ?? "";
  const command = text.split(/[@\s]/)[0]?.toLowerCase() ?? "";
  const isCommand = command === "/delete" || command === "/editar";
  const isCallback = cb?.data.startsWith("content:") ?? false;
  const user = cb?.from ?? msg?.from;
  if (!user || user.is_bot) return false;
  if (!mayManageContent(user.id)) {
    if (isCallback && cb) await io.answer(cb.id);
    return isCommand || isCallback;
  }
  const chat = cb?.message?.chat.id ?? msg?.chat.id;
  if (chat === undefined) return false;
  try {
    const sb = await db();
    const { data: session, error: sessionError } = await sb.from("telegram_content_sessions").select("*").eq("user_id", user.id).eq("chat_id", chat).maybeSingle();
    if (sessionError) throw sessionError;
    const act = async (s: NonNullable<typeof session>, action: string, value: Record<string, Json> = {}) => {
      const { data, error } = await sb.rpc("telegram_manage_content", {
        p_user_id: user.id, p_chat_id: chat, p_session_id: s.id, p_action: action, p_value: value,
        p_prompt_id: s.prompt_message_id ?? -1, p_event_key: `telegram:${u.update_id}:content`,
      });
      if (error) throw error;
      const result = data as { ok: boolean; message?: string };
      await io.send(chat, escapeTelegram(result.message ?? "Operação concluída."));
    };
    if (isCallback && cb) {
      await io.answer(cb.id);
      const parts = cb.data.split(":");
      if (!session || parts[2] !== session.id || cb.message?.message_id !== session.prompt_message_id || new Date(session.expires_at).getTime() <= Date.now()) {
        await io.send(chat, "Essa solicitação expirou. Responda ao perfil ou à rodada novamente.");
        return true;
      }
      if (parts[1] === "cancel") await act(session, "cancel");
      else if (parts[1] === "delete") await act(session, "delete");
      else if (parts[1] === "field" && session.operation === "edit") {
        const field = parts[3];
        const allowed = session.kind === "character" ? ["name", "work", "base_price", "photo_file_id"] : ["synopsis", "answer", "photo_file_id"];
        if (!field || !allowed.includes(field)) return true;
        const prompts: Record<string, string> = {
          name: "Responda a esta mensagem com o novo nome do personagem.",
          work: "Responda a esta mensagem com o novo nome da obra.",
          base_price: "Responda a esta mensagem com o novo valor inicial em Gems (ex.: 2.000).",
          photo_file_id: "Responda a esta mensagem enviando a nova foto.",
          synopsis: "Responda a esta mensagem com a nova sinopse ou sequência de emojis.",
          answer: "Responda a esta mensagem com a nova resposta. Use / para separar alternativas.",
        };
        const id = await io.send(chat, prompts[field] ?? "Envie o novo valor.");
        if (typeof id === "number") {
          const { error } = await sb.from("telegram_content_sessions").update({ field, prompt_message_id: id }).eq("id", session.id);
          if (error) throw error;
        }
      }
      return true;
    }
    if (isCommand && msg) {
      if (!msg.reply_to_message) {
        await io.send(chat, `Responda à mensagem do bot com o perfil de um personagem ou uma rodada usando ${command}.`);
        return true;
      }
      const replied = msg.reply_to_message;
      if (replied.from?.id !== await io.botId()) {
        await io.send(chat, "Responda a uma mensagem deste bot com um perfil ou uma rodada.");
        return true;
      }
      const { data: stored, error } = await sb.from("telegram_content_messages").select("kind,target_id").eq("chat_id", chat).eq("message_id", replied.message_id).maybeSingle();
      if (error) throw error;
      let target = stored;
      // Older character cards can be identified by the bot's exact profile header.
      if (!target) {
        const header = (replied.caption ?? replied.text ?? "").split("\n")[0] ?? "";
        const match = /^(.*?) • #\d+$/.exec(header);
        if (match?.[1]) {
          const { data: c, error: lookupError } = await sb.from("telegram_characters").select("id").eq("name_key", characterKey(match[1])).maybeSingle();
          if (lookupError) throw lookupError;
          if (c) target = { kind: "character", target_id: c.id };
        }
      }
      if (!target) {
        await io.send(chat, "Não consegui identificar esse conteúdo. Para personagens, envie /im nome e responda ao perfil; para rodadas, responda a uma rodada enviada após esta atualização.");
        return true;
      }
      const kind = target.kind === "character" ? "character" : "round";
      const { data: item, error: lookupError } = kind === "character"
        ? await sb.from("telegram_characters").select("name,owner_id,paid_price").eq("id", target.target_id).maybeSingle()
        : await sb.from("sinopse_rounds").select("game").eq("id", target.target_id).maybeSingle();
      if (lookupError) throw lookupError;
      if (!item) { await io.send(chat, "Esse conteúdo não existe mais."); return true; }
      const operation = command === "/delete" ? "delete" : "edit";
      const { data: s, error: createError } = await sb.from("telegram_content_sessions").upsert({
        user_id: user.id, chat_id: chat, kind, target_id: target.target_id, operation, field: null,
        prompt_message_id: null, expires_at: new Date(Date.now() + 15 * 60000).toISOString(),
      }, { onConflict: "user_id,chat_id" }).select("*").single();
      if (createError) throw createError;
      const label = "name" in item ? `o personagem ${escapeTelegram(item.name)}` : "esta rodada";
      const refund = "owner_id" in item && item.owner_id !== null ? `\nO valor pago no casamento será devolvido à pessoa que está casada com ele.` : "";
      const fields = kind === "character" ? [["Nome", "name"], ["Obra", "work"], ["Valor inicial", "base_price"], ["Foto", "photo_file_id"]] : [["Sinopse / emojis", "synopsis"], ["Resposta", "answer"], ["Foto", "photo_file_id"]];
      const keyboard = operation === "delete"
        ? [[{ text: "✅ Sim, excluir", callback_data: `content:delete:${s.id}` }, { text: "❌ Cancelar", callback_data: `content:cancel:${s.id}` }]]
        : [...fields.map(([label, field]) => [{ text: label ?? "Campo", callback_data: `content:field:${s.id}:${field}` }]), [{ text: "❌ Cancelar", callback_data: `content:cancel:${s.id}` }]];
      const id = await io.send(chat, operation === "delete" ? `Tem certeza de que deseja excluir ${label}?${refund}` : `O que deseja editar em ${label}?`, keyboard);
      if (typeof id === "number") {
        const { error: updateError } = await sb.from("telegram_content_sessions").update({ prompt_message_id: id }).eq("id", s.id);
        if (updateError) throw updateError;
      }
      return true;
    }
    if (session && command === "/cancelar") { await act(session, "cancel"); return true; }
    if (session?.operation === "edit" && session.field && msg && !text.startsWith("/")) {
      if (msg.reply_to_message?.message_id !== session.prompt_message_id) return false;
      const value = editValue(session.field, text, msg.photo?.at(-1)?.file_id);
      if (!value) { await io.send(chat, session.field === "photo_file_id" ? "Envie uma foto respondendo à mensagem anterior." : "Valor inválido. Responda à mensagem anterior com um valor válido."); return true; }
      await act(session, "save", value);
      return true;
    }
    return false;
  } catch (error) {
    console.error("Content management failed", error);
    await io.send(chat, "Não consegui concluir essa operação. Tente novamente em instantes.");
    return true;
  }
}