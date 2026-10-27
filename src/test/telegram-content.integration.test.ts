import { afterAll, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { handleContentUpdate, recordContentMessage } from "@/lib/telegram-content.server";
import { handleCharacterUpdate } from "@/lib/telegram-characters.server";

const enabled = process.env["RUN_CHARACTER_DB_TESTS"] === "1";
const key = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "unused";
const sb = createClient<Database>(process.env["SUPABASE_URL"] ?? "http://localhost", key, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (input, init) => {
    const headers = new Headers(init?.headers);
    if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
    headers.set("apikey", key);
    return fetch(input, { ...init, headers });
  } },
});
vi.mock("@/integrations/supabase/client.server", () => ({ get supabaseAdmin() { return sb; } }));
const tag = `manage_${Date.now()}`;
const chat = -880000000000 - Math.floor(Math.random() * 1000000);
const buyer = -chat;
const owner = 6733728637;
let characterId = "", roundId = "", seq = 100;
const outputs: { id: number; text: string; keyboard?: { text: string; callback_data: string }[][] }[] = [];
const io = {
  send: async (_chat: number, text: string, keyboard?: { text: string; callback_data: string }[][]) => { const id = ++seq; outputs.push({ id, text, ...(keyboard ? { keyboard } : {}) }); return id; },
  photo: async (_chat: number, _photo: string, text: string) => { const id = ++seq; outputs.push({ id, text }); return id; },
  answer: async () => {}, botId: async () => 123,
};
function update(text: string, replyId: number, user = owner, photo?: string) {
  return { update_id: buyer + ++seq, message: { message_id: ++seq, chat: { id: chat, type: "private" }, from: { id: user }, text, reply_to_message: { message_id: replyId, from: { id: 123, is_bot: true } }, ...(photo ? { photo: [{ file_id: photo }] } : {}) } };
}
function callback(data: string, messageId: number, user = owner) {
  return { update_id: buyer + ++seq, callback_query: { id: String(seq), from: { id: user }, data, message: { message_id: messageId, chat: { id: chat } } } };
}
function last() { const value = outputs.at(-1); if (!value) throw new Error("No bot response"); return value; }
async function storedPrice() { const { data, error } = await sb.from("telegram_characters").select("base_price,paid_price,owner_id").eq("id", characterId).single(); if (error) throw error; return data; }

describe.skipIf(!enabled)("gerenciar conteúdos com banco real e mensagens temporárias", () => {
  afterAll(async () => {
    for (const query of [
      sb.from("telegram_content_messages").delete().eq("chat_id", chat),
      sb.from("telegram_content_sessions").delete().eq("chat_id", chat),
      sb.from("telegram_characters").delete().eq("id", characterId || "00000000-0000-0000-0000-000000000000"),
      sb.from("sinopse_rounds").delete().eq("id", roundId || "00000000-0000-0000-0000-000000000000"),
      sb.from("telegram_economy_events").delete().like("event_key", `${tag}%`),
      sb.from("telegram_economy_events").delete().like("event_key", `telegram:${buyer}%`),
      sb.from("telegram_gens").delete().eq("telegram_user_id", buyer),
    ]) { const { error } = await query; if (error) throw error; }
  });
  it("edita pela resposta, recusa outras contas e preserva o reembolso original", async () => {
    const { error: balanceError } = await sb.from("telegram_gens").insert({ telegram_user_id: buyer, balance: 5000 });
    if (balanceError) throw balanceError;
    const { data: c, error } = await sb.from("telegram_characters").insert({ name: tag, name_key: tag, work: "Obra teste", base_price: 100, photo_file_id: "test-photo" }).select("id").single();
    if (error) throw error;
    characterId = c.id;
    const { error: buyError } = await sb.rpc("telegram_character_action", { p_user_id: buyer, p_username: "", p_action: "buy", p_args: { name_key: tag }, p_event_key: `${tag}:buy` });
    if (buyError) throw buyError;
    await handleCharacterUpdate(update(`/im ${tag}`, 1, buyer), io);
    const card = last();
    await handleContentUpdate(update("/editar", card.id), io);
    const menu = last();
    const field = menu.keyboard?.flat().find((b) => b.callback_data.endsWith(":base_price"));
    if (!field) throw new Error("Missing price action");
    await handleContentUpdate(callback(field.callback_data, menu.id, buyer), io);
    expect((await storedPrice()).base_price).toBe(100);
    await handleContentUpdate(callback(field.callback_data, menu.id), io);
    await handleContentUpdate(update("2.000", last().id), io);
    expect(await storedPrice()).toMatchObject({ base_price: 2000, paid_price: 100, owner_id: buyer });
    await handleCharacterUpdate(update(`/im ${tag}`, 1, buyer), io);
    expect(last().text).toContain("2200 Gems");
  }, 20000);
  it("não exclui antes da confirmação e devolve exatamente 100 Gems apenas uma vez", async () => {
    await handleContentUpdate(update("/delete", last().id), io);
    const prompt = last();
    const data = prompt.keyboard?.[0]?.[0]?.callback_data;
    if (!data) throw new Error("Missing confirmation");
    expect((await storedPrice()).owner_id).toBe(buyer);
    await handleContentUpdate(callback(data, prompt.id, buyer), io);
    expect((await storedPrice()).owner_id).toBe(buyer);
    const confirm = callback(data, prompt.id);
    await handleContentUpdate(confirm, io);
    await handleContentUpdate(confirm, io);
    const { data: c } = await sb.from("telegram_characters").select("id").eq("id", characterId).maybeSingle();
    const { data: balance } = await sb.from("telegram_gens").select("balance").eq("telegram_user_id", buyer).single();
    expect(c).toBeNull();
    expect(balance?.balance).toBe(5000);
  });
  it("edita uma rodada e cancelar a exclusão mantém a rodada", async () => {
    const { data: r, error } = await sb.from("sinopse_rounds").insert({ game: "emoji", synopsis: "🌸", answer: "Teste" }).select("id").single();
    if (error) throw error;
    roundId = r.id;
    await recordContentMessage(chat, 900, "round", roundId);
    await handleContentUpdate(update("/editar", 900), io);
    const menu = last();
    const button = menu.keyboard?.flat().find((b) => b.callback_data.endsWith(":answer"));
    if (!button) throw new Error("Missing answer edit");
    await handleContentUpdate(callback(button.callback_data, menu.id), io);
    await handleContentUpdate(update("Carro/Vela", last().id), io);
    const { data: saved } = await sb.from("sinopse_rounds").select("answer").eq("id", roundId).single();
    expect(saved?.answer).toBe("Carro/Vela");
    await handleContentUpdate(update("/delete", 900), io);
    const prompt = last();
    const cancel = prompt.keyboard?.[0]?.[1]?.callback_data;
    if (!cancel) throw new Error("Missing cancel");
    await handleContentUpdate(callback(cancel, prompt.id), io);
    const { data: remains } = await sb.from("sinopse_rounds").select("id").eq("id", roundId).single();
    expect(remains?.id).toBe(roundId);
    const { data: denied } = await sb.rpc("telegram_manage_content", { p_user_id: buyer, p_chat_id: chat, p_session_id: roundId, p_action: "delete", p_value: {}, p_prompt_id: prompt.id, p_event_key: `${tag}:denied` });
    expect(denied).toMatchObject({ ok: false });
  });
});