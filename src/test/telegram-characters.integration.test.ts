import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { characterKey, handleCharacterUpdate } from "@/lib/telegram-characters.server";

const enabled = process.env["RUN_CHARACTER_DB_TESTS"] === "1";
const url = process.env["SUPABASE_URL"] ?? "http://localhost";
const key = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "unused";
const sb = createClient<Database>(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: (input, init) => {
      const headers = new Headers(init?.headers);
      if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`)
        headers.delete("Authorization");
      headers.set("apikey", key);
      return fetch(input, { ...init, headers });
    },
  },
});
vi.mock("@/integrations/supabase/client.server", () => ({
  get supabaseAdmin() {
    return sb;
  },
}));
const token = `check_${Date.now()}`;
const a = 880000000000 + Math.floor(Math.random() * 1000000);
const b = a + 1;
const outsider = a + 2;
let sequence = 0;
const ids: string[] = [];
const names: string[] = [];
const action = async (
  user: number,
  name: string,
  args: Record<string, Json> = {},
  receipt?: string,
) => {
  const { data, error } = await sb.rpc("telegram_character_action", {
    p_user_id: user,
    p_username: `${token}_${user === a ? "a" : user === b ? "b" : "x"}`,
    p_action: name,
    p_args: args,
    p_event_key: receipt ?? `${token}:${++sequence}`,
  });
  if (error) throw new Error(error.message);
  return data as { ok: boolean; message: string; trade_id?: string };
};
const balance = async (user: number) => {
  const { data, error } = await sb
    .from("telegram_gens")
    .select("balance")
    .eq("telegram_user_id", user)
    .single();
  if (error) throw new Error(error.message);
  return data.balance;
};

describe.skipIf(!enabled)("economia real de personagens (dados temporários)", () => {
  beforeAll(async () => {
    for (const user of [a, b, outsider]) await action(user, "register");
    const { error } = await sb
      .from("telegram_gens")
      .update({ balance: 10000 })
      .in("telegram_user_id", [a, b]);
    if (error) throw error;
    for (let i = 0; i < 6; i++) {
      const name = `${token}_personagem_${i}`;
      names.push(name);
      const { data, error } = await sb
        .from("telegram_characters")
        .insert({
          name,
          name_key: characterKey(name),
          work: "Obra temporária",
          base_price: i === 1 ? 200 : 100,
          photo_file_id: "temporary-test-photo",
        })
        .select("id")
        .single();
      if (error) throw error;
      ids.push(data.id);
    }
  });
  afterAll(async () => {
    const queries = [
      sb.from("telegram_trades").delete().eq("proposer_id", a),
      sb.from("telegram_wishes").delete().in("user_id", [a, b, outsider]),
      sb.from("telegram_character_sessions").delete().in("user_id", [a, b, outsider]),
      sb.from("telegram_characters").delete().in("id", ids),
      sb.from("telegram_economy_events").delete().like("event_key", `${token}:%`),
      sb.from("telegram_economy_events").delete().in("user_id", [a, b, outsider]),
      sb.from("telegram_gens").delete().in("telegram_user_id", [a, b, outsider]),
    ];
    for (const query of queries) {
      const { error } = await query;
      if (error) throw error;
    }
  });
  it("cadastro só é permitido à dona", async () => {
    expect((await action(a, "add", { name: "not allowed" })).ok).toBe(false);
  });
  it("limita a 5 desejos mesmo com solicitações simultâneas", async () => {
    const results = await Promise.all(
      names.map((name) => action(a, "wish", { name_key: characterKey(name) })),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(5);
    const { count } = await sb
      .from("telegram_wishes")
      .select("*", { head: true, count: "exact" })
      .eq("user_id", a);
    expect(count).toBe(5);
  });
  it("aumenta 10% do valor inicial por desejo e atualiza posição", async () => {
    // Remove existing test wishes so the assertion has an exact baseline.
    await sb.from("telegram_wishes").delete().eq("user_id", a);
    await action(a, "wish", { name_key: characterKey(names[0] ?? "") });
    const { data } = await sb
      .from("telegram_character_catalog")
      .select("price,wish_count,position")
      .eq("id", ids[0] ?? "")
      .single();
    expect(data?.price).toBe(110);
    expect(data?.wish_count).toBe(1);
    expect(data?.position).toBeGreaterThan(0);
  });
  it("/casar desconta e /im lê a foto, preço e comprador persistidos", async () => {
    const outputs: { text: string; photo?: string }[] = [];
    const io = {
      send: async (_chat: number, text: string) => {
        outputs.push({ text });
      },
      photo: async (_chat: number, photo: string, text: string) => {
        outputs.push({ text, photo });
      },
      answer: async () => {},
    };
    const before = await balance(a);
    for (const text of [`/casar ${names[0]}`, `/im ${names[0]}`]) {
      expect(
        await handleCharacterUpdate(
          {
            update_id: a + ++sequence,
            message: {
              chat: { id: a, type: "private" },
              from: { id: a, username: `${token}_a` },
              text,
            },
          },
          io,
        ),
      ).toBe(true);
    }
    expect(await balance(a)).toBe(before - 110);
    const card = outputs.find((x) => x.photo);
    expect(card?.photo).toBe("temporary-test-photo");
    expect(card?.text).toContain(`@${token}_a`);
    const { data } = await sb
      .from("telegram_character_catalog")
      .select("price,purchases")
      .eq("id", ids[0] ?? "")
      .single();
    expect(data?.price).toBe(120);
    expect(data?.purchases).toBe(1);
  });
  it("não permite comprar personagem ocupado nem gastar mais que o saldo", async () => {
    expect((await action(b, "buy", { name_key: characterKey(names[0] ?? "") })).ok).toBe(false);
    expect((await action(outsider, "buy", { name_key: characterKey(names[2] ?? "") })).ok).toBe(
      false,
    );
    expect(await balance(outsider)).toBe(0);
  });
  it("presentes descontam e creditam uma só vez no replay", async () => {
    const beforeA = await balance(a),
      beforeB = await balance(b);
    const receipt = `${token}:gift_once`;
    for (let i = 0; i < 2; i++)
      expect((await action(a, "give", { target_id: b, amount: 50 }, receipt)).ok).toBe(true);
    expect(await balance(a)).toBe(beforeA - 50);
    expect(await balance(b)).toBe(beforeB + 50);
    expect((await action(a, "give", { target_id: b, amount: -1 })).ok).toBe(false);
  });
  it("troca exige aceite e propriedade e transfere ambos juntos", async () => {
    await action(b, "buy", { name_key: characterKey(names[1] ?? "") });
    const invite = await action(a, "trade_start", { target_username: `${token}_b`, chat_id: a });
    expect(invite.ok).toBe(true);
    expect(
      (await action(outsider, "trade_accept", { trade_id: invite.trade_id ?? "", chat_id: a })).ok,
    ).toBe(false);
    expect(
      (await action(b, "trade_accept", { trade_id: invite.trade_id ?? "", chat_id: a })).ok,
    ).toBe(true);
    expect(
      (await action(a, "trade_select", { name_key: characterKey(names[1] ?? ""), chat_id: a })).ok,
    ).toBe(false);
    await action(a, "trade_select", { name_key: characterKey(names[0] ?? ""), chat_id: a });
    await action(b, "trade_select", { name_key: characterKey(names[1] ?? ""), chat_id: a });
    const pending = await sb.from("telegram_characters").select("owner_id").eq("id", ids[0] ?? "").single();
    expect(pending.data?.owner_id).toBe(a);
    await action(a, "trade_confirm", { trade_id: invite.trade_id ?? "", chat_id: a });
    await action(b, "trade_confirm", { trade_id: invite.trade_id ?? "", chat_id: a });
    const { data } = await sb
      .from("telegram_characters")
      .select("id,owner_id")
      .in("id", ids.slice(0, 2));
    expect(data?.find((c) => c.id === ids[0])?.owner_id).toBe(b);
    expect(data?.find((c) => c.id === ids[1])?.owner_id).toBe(a);
  });
  it("divórcio devolve integralmente o casamento e não reembolsa duas vezes", async () => {
    const before = await balance(a);
    const result = await action(a, "divorce", { name_key: characterKey(names[1] ?? "") });
    expect(result.ok).toBe(true);
    expect(await balance(a)).toBe(before + 200);
    expect((await action(a, "divorce", { name_key: characterKey(names[1] ?? "") })).ok).toBe(false);
    expect(await balance(a)).toBe(before + 200);
  });
  it("só uma pessoa compra o mesmo personagem em disputa simultânea", async () => {
    const beforeA = await balance(a),
      beforeB = await balance(b);
    const results = await Promise.all(
      [a, b].map((user) => action(user, "buy", { name_key: characterKey(names[2] ?? "") })),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(beforeA + beforeB - ((await balance(a)) + (await balance(b)))).toBe(100);
  });
  it("reembolsa os 100 Gems efetivamente pagos antes do aumento de preço", async () => {
    const before = await balance(a);
    expect((await action(a, "buy", { name_key: characterKey(names[3] ?? "") })).ok).toBe(true);
    expect(await balance(a)).toBe(before - 100);
    expect((await action(a, "divorce", { name_key: characterKey(names[3] ?? "") })).ok).toBe(true);
    expect(await balance(a)).toBe(before);
  });
  it("recusar a troca não muda donos", async () => {
    const invite = await action(a, "trade_start", { target_username: `${token}_b`, chat_id: a });
    expect(invite.ok).toBe(true);
    expect(
      (await action(b, "trade_reject", { trade_id: invite.trade_id ?? "", chat_id: a })).ok,
    ).toBe(true);
    expect(
      (await action(b, "trade_accept", { trade_id: invite.trade_id ?? "", chat_id: a })).ok,
    ).toBe(false);
    const { data } = await sb
      .from("telegram_characters")
      .select("owner_id")
      .eq("id", ids[0] ?? "")
      .single();
    expect(data?.owner_id).toBe(b);
  });
});
