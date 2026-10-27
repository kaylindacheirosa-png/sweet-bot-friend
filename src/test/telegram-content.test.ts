import { describe, expect, it } from "vitest";
import { mayManageContent, editValue, handleContentUpdate } from "@/lib/telegram-content.server";

describe("gerenciamento exclusivo da dona", () => {
  it("permite somente a conta 6733728637", () => {
    expect(mayManageContent(6733728637)).toBe(true);
    expect(mayManageContent(6733728638)).toBe(false);
  });
  it("ignora /delete e /editar de outras pessoas sem enviar mensagens", async () => {
    const sent: string[] = [];
    const io = { send: async (_chat: number, text: string) => { sent.push(text); }, answer: async () => {}, botId: async () => 123 };
    for (const text of ["/delete", "/editar"]) {
      expect(await handleContentUpdate({ update_id: 1, message: { message_id: 2, chat: { id: 3 }, from: { id: 6733728638 }, text } }, io)).toBe(true);
    }
    expect(sent).toHaveLength(0);
  });
  it("mantém 2.000 como 2000 Gems ao editar", () => {
    expect(editValue("base_price", "2.000")).toEqual({ amount: 2000 });
    expect(editValue("base_price", "-1")).toBeNull();
  });
  it("mantém alternativas de respostas separadas por barra", () => {
    expect(editValue("answer", "Carro/Vela")).toEqual({ text: "Carro/Vela" });
    expect(editValue("answer", " / ")).toBeNull();
  });
});