import { afterAll, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { dispatchTypingBattles, handleTypingGuess, matchesTypingAnswer } from "@/lib/telegram-typing.server";

const enabled = process.env["RUN_TYPING_DB_TESTS"] === "1";
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

describe("respostas do Typing Battle", () => {
  it("aceita Carro ou Vela com acentos e espaços, nunca resposta parcial ou conjunta", () => {
    expect(matchesTypingAnswer("Carro/Vela", "  VÉLA  ")).toBe(true);
    expect(matchesTypingAnswer("Carro/Vela", "carro")).toBe(true);
    expect(matchesTypingAnswer("Carro/Vela", "Carr")).toBe(false);
    expect(matchesTypingAnswer("Carro/Vela", "Carro/Vela")).toBe(false);
    expect(matchesTypingAnswer(" / ", "")).toBe(false);
  });
});

const chat = -890000000000 - Math.floor(Math.random() * 1000000);
const outputs: { chat: number; text: string; photo?: string }[] = [];
const io = {
  send: async (chat: number, text: string) => { outputs.push({ chat, text }); return outputs.length + 100; },
  photo: async (chat: number, photo: string, text: string) => { outputs.push({ chat, text, photo }); return outputs.length + 100; },
};
async function check<T>(operation: PromiseLike<{ data: T; error: unknown }>) {
  const { data, error } = await operation;
  if (error) throw error;
  return data;
}
async function active() {
  const row = await check(sb.from("telegram_typing_rounds").select("*").eq("chat_id", chat).single());
  if (!row) throw new Error("Missing active round");
  return row;
}
async function configure(style: string, frequency_minutes = 30, enabled = true) {
  await check(sb.from("typing_battle_settings").upsert({ chat_id: chat, enabled, style, frequency_minutes }));
}
function guess(text: string, user = 123, date = Math.floor(Date.now() / 1000)) {
  return { message: { text, date, chat: { id: chat }, from: { id: user, first_name: "Teste" } } };
}

describe.skipIf(!enabled)("Typing Battle com banco real, sem enviar mensagens reais", () => {
  afterAll(async () => {
    await check(sb.from("telegram_content_messages").delete().eq("chat_id", chat));
    await check(sb.from("typing_battle_settings").delete().eq("chat_id", chat));
  });
  it("liga, publica uma única rodada de sinopse e guarda a rodada para outra execução", async () => {
    await configure("sinopse");
    await Promise.all([dispatchTypingBattles(io, chat), dispatchTypingBattles(io, chat)]);
    expect(outputs).toHaveLength(1);
    expect(await active()).toMatchObject({ status: "open", game: "sinopse", message_id: 101 });
    expect((await dispatchTypingBattles(io, chat)).sent).toBe(0);
    expect(outputs).toHaveLength(1);
  });
  for (const minutes of [30, 60, 120, 300]) {
    it(`agenda a próxima rodada em ${minutes} minutos`, async () => {
      await configure("sinopse", minutes);
      await check(sb.from("typing_battle_settings").update({ next_run_at: new Date(0).toISOString() }).eq("chat_id", chat));
      await dispatchTypingBattles(io, chat);
      const row = await active();
      const settings = await check(sb.from("typing_battle_settings").select("next_run_at").eq("chat_id", chat).single());
      if (!settings) throw new Error("Missing settings");
      expect(new Date(settings.next_run_at).getTime() - new Date(row.started_at).getTime()).toBe(minutes * 60000);
    });
  }
  it("erros ficam silenciosos e somente o primeiro acerto vence, mesmo simultaneamente", async () => {
    const row = await active();
    const snapshot = row.snapshot as { answer: string };
    const before = outputs.length;
    expect(await handleTypingGuess(guess("Resposta errada deliberada"), io)).toBe(true);
    expect(outputs).toHaveLength(before);
    const answer = snapshot.answer.split("/")[0] ?? "";
    await Promise.all([handleTypingGuess(guess(answer, 321), io), handleTypingGuess(guess(answer, 654), io)]);
    expect(outputs).toHaveLength(before + 1);
    const won = await active();
    expect(won.status).toBe("won");
    expect([321, 654]).toContain(won.winner_id);
    await handleTypingGuess(guess(answer, 321), io);
    expect(outputs).toHaveLength(before + 1);
  });
  it("seleção de peitoral publica a foto e comandos não contam como resposta", async () => {
    await configure("peitoral");
    await dispatchTypingBattles(io, chat);
    expect((await active()).game).toBe("peitoral");
    expect(outputs.at(-1)?.photo).toBeTruthy();
    expect(await handleTypingGuess(guess("/daily"), io)).toBe(false);
    expect(await handleTypingGuess({ edited_message: guess("teste").message }, io)).toBe(false);
  });
  it("mensagens antigas não podem vencer uma rodada nova", async () => {
    const row = await active();
    const won = await check(sb.rpc("telegram_typing_claim", { p_chat_id: chat, p_token: row.token, p_user_id: 123, p_message_date: 1 }));
    expect(won).toBe(false);
    expect((await active()).status).toBe("open");
  });
  it("desativar ou selecionar nenhum estilo impede novos envios", async () => {
    await configure("peitoral", 30, false);
    expect((await dispatchTypingBattles(io, chat)).sent).toBe(0);
    expect(await handleTypingGuess(guess("qualquer"), io)).toBe(false);
    await configure("nenhum");
    expect((await dispatchTypingBattles(io, chat)).sent).toBe(0);
  });
  it("falha de envio não deixa uma rodada invisível aberta", async () => {
    await configure("sinopse");
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const result = await dispatchTypingBattles({ send: async () => null, photo: async () => null }, chat);
      expect(result.sent).toBe(0);
      expect((await active()).status).toBe("failed");
    } finally { quiet.mockRestore(); }
  });
});