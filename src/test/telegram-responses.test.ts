import { describe, expect, it } from "vitest";
import { findReply } from "@/lib/telegram-responses.server";

describe("respostas fixas do Telegram", () => {
  it("mensagens não reconhecidas não produzem resposta", () => {
    for (const text of ["oi pessoal", "Carro", "Vela", "", "/desconhecido"]) {
      expect(findReply(text)).toBeNull();
    }
  });
  it("ajuda continua disponível quando solicitada", () => {
    expect(findReply("/ajuda")).not.toBeNull();
    expect(findReply("/ajuda@MeuBot")).toEqual(findReply("/ajuda"));
  });
  it("comandos fixos existentes continuam disponíveis", () => {
    expect(findReply("/horario")).not.toBeNull();
    expect(findReply("/contato")).not.toBeNull();
  });
});