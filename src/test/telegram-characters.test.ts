import { describe, expect, it } from "vitest";
import {
  characterKey,
  gemAmount,
  characterDraft,
  characterUpdateSchema,
} from "@/lib/telegram-characters.server";

describe("entradas dos personagens", () => {
  it("procura o nome exato ignorando acentos, caixa e espaços extras", () => {
    expect(characterKey("  Álpha   Trauma ")).toBe("alpha trauma");
    expect(characterKey("Alpha")).not.toBe(characterKey("Alpha Trauma"));
  });
  it("Gems não permitem presentes negativos, fracionários ou vazios", () => {
    for (const value of ["", "0", "-100", "1.5", "abc"])
      expect(gemAmount.safeParse(value).success).toBe(false);
    expect(gemAmount.parse("200")).toBe(200);
  });
  it("cadastro exige nome, obra, preço positivo e foto", () => {
    const draft = { name: "Personagem", work: "Obra", base_price: 200, photo_file_id: "foto" };
    expect(characterDraft.safeParse(draft).success).toBe(true);
    for (const key of Object.keys(draft))
      expect(characterDraft.safeParse({ ...draft, [key]: "" }).success).toBe(false);
  });
  it("interpreta o preço 2.000 como 2000 Gems no cadastro", () => {
    const draft = characterDraft.parse({
      name: "Personagem",
      work: "Obra",
      base_price: "2.000",
      photo_file_id: "foto",
    });
    expect(draft.base_price).toBe(2000);
    expect(gemAmount.parse(" 2.000 ")).toBe(2000);
    expect(gemAmount.parse("1.000.000")).toBe(1000000);
    expect(gemAmount.parse("2000")).toBe(2000);
  });
  it("rejeita casas decimais e separadores de milhar malformados", () => {
    for (const value of ["2.0", "2.00", "2,5", "2.00.000", "1e3", "0x10"])
      expect(gemAmount.safeParse(value).success).toBe(false);
  });
  it("uma mensagem editada não vira uma nova compra", () => {
    const parsed = characterUpdateSchema.parse({
      update_id: 1,
      edited_message: { text: "/casar Personagem" },
    });
    expect(parsed.message).toBeUndefined();
  });
  it("rejeita identificadores inválidos fornecidos em mensagens", () => {
    expect(
      characterUpdateSchema.safeParse({
        update_id: 1,
        message: { chat: { id: 1, type: "private" }, from: { id: -1 } },
      }).success,
    ).toBe(false);
  });
});

import { formatCharacterResult } from "@/lib/telegram-characters.server";
describe("mensagens da economia", () => {
  it("casório negado mostra o saldo atual", () => {
    expect(formatCharacterResult({ code: "insufficient", balance: 40 })).toContain(
      "Seu saldo atual é 40 !!",
    );
  });
  it("casamento mostra nome em negrito e preço descontado", () => {
    const t = formatCharacterResult({ code: "married", character_name: "Kai", price: 2000 });
    expect(t).toContain("<b>Kai</b>");
    expect(t).toContain("custado 2000 Gems");
  });
  it("doação cita remetente, quantidade e destinatário", () => {
    expect(
      formatCharacterResult({ code: "gift", amount: 50, sender_username: "ana", target_username: "bia" }),
    ).toContain("@ana enviou 50 Gems para @bia");
  });
});
