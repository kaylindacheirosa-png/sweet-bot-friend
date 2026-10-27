import { z } from "zod";
import type { Json } from "@/integrations/supabase/types";

export const characterKey = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
export const gemAmount = z.coerce.number().int().min(1).max(1_000_000_000);
const field = z.string().trim().min(1).max(120);
export const characterDraft = z.object({
  name: field,
  work: field,
  base_price: gemAmount,
  photo_file_id: z.string().min(1).max(300),
});
const actorSchema = z.object({
  id: z.number().int().positive().safe(),
  username: z
    .string()
    .regex(/^[a-zA-Z0-9_]{1,32}$/)
    .optional(),
  is_bot: z.boolean().optional(),
});
const messageSchema = z.object({
  chat: z.object({ id: z.number().int().safe(), type: z.string() }),
  from: actorSchema.optional(),
  text: z.string().max(4096).optional(),
  caption: z.string().max(1024).optional(),
  photo: z.array(z.object({ file_id: z.string().min(1).max(300) })).optional(),
  reply_to_message: z.object({ from: actorSchema.optional() }).optional(),
});
export const characterUpdateSchema = z.object({
  update_id: z.number().int().safe(),
  message: messageSchema.optional(),
  callback_query: z
    .object({
      id: z.string(),
      from: actorSchema,
      data: z.string().max(64),
      message: messageSchema.optional(),
    })
    .optional(),
});

export interface CharacterCard {
  name: string;
  work: string;
  price: number;
  position: number;
  owner_id: number | null;
  owner_username: string | null;
}
export const escapeTelegram = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export function buildCharacterCard(c: CharacterCard) {
  const owner =
    c.owner_id === null
      ? "Ninguém"
      : c.owner_username
        ? `@${escapeTelegram(c.owner_username)}`
        : `<a href="tg://user?id=${c.owner_id}">Usuário</a>`;
  return `${escapeTelegram(c.name)} • #${c.position}\n\nㅤ⤷﹒꒰<tg-emoji emoji-id="6089093702406378434">🌸</tg-emoji>﹒${escapeTelegram(c.work)}﹒𖦹\n\n୨﹒𓏵︐﹕<tg-emoji emoji-id="5375296873982604963">💎</tg-emoji> ${c.price} gens\n\n﹒<tg-emoji emoji-id="5397931489071476571">💍</tg-emoji>ᰍ Casado com: ${owner}`;
}
export interface CharacterTransport {
  send: (
    chat: number,
    text: string,
    keyboard?: { text: string; callback_data: string }[][],
  ) => Promise<unknown>;
  photo: (chat: number, photo: string, caption: string) => Promise<unknown>;
  answer: (callback: string) => Promise<unknown>;
}
type ActionResult = { ok: boolean; message?: string; trade_id?: string };
export async function handleCharacterUpdate(
  raw: unknown,
  io: CharacterTransport,
): Promise<boolean> {
  const parsed = characterUpdateSchema.safeParse(raw);
  if (!parsed.success) return false;
  const update = parsed.data;
  const cb = update.callback_query;
  const msg = update.message;
  const actor = cb?.from ?? msg?.from;
  if (!actor || actor.is_bot) return false;
  const chat = cb?.message?.chat ?? msg?.chat;
  if (!chat) return false;
  const { supabaseAdmin: sb } = await import("@/integrations/supabase/client.server");
  const action = async (
    name: string,
    args: Record<string, Json | undefined> = {},
  ): Promise<ActionResult> => {
    const { data, error } = await sb.rpc("telegram_character_action", {
      p_user_id: actor.id,
      p_username: actor.username ?? "",
      p_action: name,
      p_args: args,
      p_event_key: `telegram:${update.update_id}:${name}`,
    });
    if (error) throw new Error(`Character action failed: ${error.message}`);
    return data as unknown as ActionResult;
  };
  const sendResult = async (name: string, args: Record<string, Json | undefined> = {}) => {
    const r = await action(name, args);
    if (r.message) await io.send(chat.id, escapeTelegram(r.message));
    return r;
  };
  try {
    if (cb?.data.startsWith("trade:")) {
      await io.answer(cb.id);
      const match = /^trade:(accept|reject):([0-9a-f-]{36})$/.exec(cb.data);
      if (match) await sendResult(`trade_${match[1]}`, { trade_id: match[2], chat_id: chat.id });
      return true;
    }
    if (!msg) return false;
    const text = (msg.text ?? msg.caption ?? "").trim();
    const command = text.split(/\s/)[0]?.split("@")[0]?.toLowerCase() ?? "";
    const argument = text.replace(/^\S+\s*/, "").trim();
    await action("register");
    const { data: session, error: sessionError } = await sb
      .from("telegram_character_sessions")
      .select("*")
      .eq("user_id", actor.id)
      .eq("chat_id", chat.id)
      .maybeSingle();
    if (sessionError) throw sessionError;
    if (command === "/cancelar" && session) {
      const { error } = await sb
        .from("telegram_character_sessions")
        .delete()
        .eq("user_id", actor.id);
      if (error) throw error;
      await io.send(chat.id, "Cadastro cancelado.");
      return true;
    }
    // /add restarts the existing owner-only menu; character selection is handled here.
    if (command === "/add" && actor.id === 6733728637 && chat.type === "private") {
      const { error } = await sb
        .from("telegram_character_sessions")
        .delete()
        .eq("user_id", actor.id);
      if (error) throw error;
      return false;
    }
    if (
      actor.id === 6733728637 &&
      chat.type === "private" &&
      !session &&
      ["4", "personagem", "personagens"].includes(characterKey(text))
    ) {
      const { data: menu } = await sb
        .from("bot_add_sessions")
        .select("step")
        .eq("user_id", actor.id)
        .maybeSingle();
      if (menu?.step === "game") {
        const { error } = await sb
          .from("telegram_character_sessions")
          .upsert({ user_id: actor.id, chat_id: chat.id, step: "name", draft: {} });
        if (error) throw error;
        const { error: removeError } = await sb
          .from("bot_add_sessions")
          .delete()
          .eq("user_id", actor.id);
        if (removeError) throw removeError;
        await io.send(chat.id, "Qual é o nome do personagem? (ou /cancelar)");
        return true;
      }
    }
    if (session && actor.id === 6733728637 && chat.type === "private" && !text.startsWith("/")) {
      const draft = z.record(z.unknown()).parse(session.draft);
      let next: string;
      let prompt: string;
      if (session.step === "name" || session.step === "work") {
        const value = field.safeParse(text);
        if (!value.success) {
          await io.send(chat.id, "Envie um texto entre 1 e 120 caracteres.");
          return true;
        }
        draft[session.step] = value.data;
        next = session.step === "name" ? "work" : "base_price";
        prompt = next === "work" ? "Qual é o nome da obra?" : "Qual é o valor inicial em Gems?";
      } else if (session.step === "base_price") {
        const amount = gemAmount.safeParse(text);
        if (!amount.success) {
          await io.send(chat.id, "Envie um valor inteiro entre 1 e 1.000.000.000 Gems.");
          return true;
        }
        draft["base_price"] = amount.data;
        next = "photo";
        prompt = "Agora envie a foto do personagem.";
      } else {
        const photo = msg.photo?.at(-1)?.file_id;
        if (!photo) {
          await io.send(chat.id, "Envie uma foto do personagem, não um arquivo ou link.");
          return true;
        }
        const complete = characterDraft.parse({ ...draft, photo_file_id: photo });
        const r = await sendResult("add", { ...complete, name_key: characterKey(complete.name) });
        if (r.ok) {
          const { error } = await sb
            .from("telegram_character_sessions")
            .delete()
            .eq("user_id", actor.id);
          if (error) throw error;
        }
        return true;
      }
      const { error } = await sb
        .from("telegram_character_sessions")
        .update({ draft: draft as Json, step: next, updated_at: new Date().toISOString() })
        .eq("user_id", actor.id);
      if (error) throw error;
      await io.send(chat.id, prompt);
      return true;
    }
    if (["/im", "/wish", "/casar", "/divórcio", "/divorcio"].includes(command)) {
      if (command === "/wish" && !argument) {
        const { data, error } = await sb
          .from("telegram_wishes")
          .select("character_id, telegram_characters(name)")
          .eq("user_id", actor.id)
          .order("created_at");
        if (error) throw error;
        await io.send(
          chat.id,
          `♡ Seus desejos (${data.length}/5)\n\n${data.map((w) => escapeTelegram(w.telegram_characters?.name ?? "")).join("\n") || "Nenhum personagem ainda."}\n\n/wish nome — adicionar ou remover`,
        );
        return true;
      }
      if (!argument || argument.length > 120) {
        await io.send(chat.id, `Envie ${command} seguido do nome do personagem.`);
        return true;
      }
      if (command === "/im") {
        const { data: c, error } = await sb
          .from("telegram_character_catalog")
          .select("*")
          .eq("name_key", characterKey(argument))
          .maybeSingle();
        if (error) throw error;
        if (!c || !c.name || !c.work || !c.photo_file_id || c.price === null || c.position === null)
          await io.send(chat.id, "Personagem não encontrado.");
        else
          await io.photo(
            chat.id,
            c.photo_file_id,
            buildCharacterCard({
              name: c.name,
              work: c.work,
              price: c.price,
              position: c.position,
              owner_id: c.owner_id,
              owner_username: c.owner_username,
            }),
          );
      } else
        await sendResult(command === "/wish" ? "wish" : command === "/casar" ? "buy" : "divorce", {
          name_key: characterKey(argument),
        });
      return true;
    }
    if (command === "/dar") {
      const target = msg.reply_to_message?.from;
      const amount = gemAmount.safeParse(argument);
      if (!target || target.is_bot || target.id === actor.id || !amount.success)
        await io.send(
          chat.id,
          "Responda à mensagem de outra pessoa com /dar quantidade (ex.: /dar 100).",
        );
      else
        await sendResult("give", {
          target_id: target.id,
          target_username: target.username ?? null,
          amount: amount.data,
        });
      return true;
    }
    if (command === "/trocar") {
      if (!/^@[a-zA-Z0-9_]{1,32}$/.test(argument)) {
        await io.send(chat.id, "Envie /trocar @usuario para convidar alguém.");
        return true;
      }
      const r = await action("trade_start", {
        target_username: argument.slice(1),
        chat_id: chat.id,
      });
      await io.send(
        chat.id,
        escapeTelegram(r.message ?? ""),
        r.ok && r.trade_id
          ? [
              [
                { text: "✅ Aceitar", callback_data: `trade:accept:${r.trade_id}` },
                { text: "❌ Recusar", callback_data: `trade:reject:${r.trade_id}` },
              ],
            ]
          : undefined,
      );
      return true;
    }
    const { data: trade, error } = await sb
      .from("telegram_trades")
      .select("id,status")
      .eq("chat_id", chat.id)
      .in("status", ["pending", "accepted"])
      .gt("expires_at", new Date().toISOString())
      .or(`proposer_id.eq.${actor.id},recipient_id.eq.${actor.id}`)
      .maybeSingle();
    if (error) throw error;
    if (trade && command === "/cancelar") {
      await sendResult("trade_cancel", { chat_id: chat.id });
      return true;
    }
    if (trade?.status === "accepted" && text && !text.startsWith("/")) {
      await sendResult("trade_select", { chat_id: chat.id, name_key: characterKey(text) });
      return true;
    }
    return false;
  } catch (error) {
    console.error("Character command failed", error);
    await io.send(chat.id, "Não consegui concluir essa ação agora. Tente novamente em instantes.");
    return true;
  }
}
