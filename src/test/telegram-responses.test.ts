import { describe, expect, it } from "vitest";
import { buildSettingsPage, findReply } from "@/lib/telegram-responses.server";

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

describe("página inicial do /settings", () => {
  const menu = buildSettingsPage("menu");

  it("mostra os dois emojis premium e o texto de boas-vindas", () => {
    expect(menu.text).toContain('emoji-id="5420462475189432571"');
    expect(menu.text).toContain('emoji-id="4904936030232117798"');
    expect(menu.text).toContain("Yaoitopic cσmandos");
    expect(menu.text).toContain("área de suporte do bot Yaoitopic");
    expect(menu.text).toContain("se divertir o bastante!");
  });

  it("mantém os botões de navegação", () => {
    const labels = menu.keyboard.flat().map((b) => b.callback_data);
    expect(labels).toEqual(
      expect.arrayContaining(["settings:jogos", "settings:controles", "settings:horario", "settings:contato"]),
    );
  });

  it("página desconhecida volta para a mensagem de boas-vindas", () => {
    expect(buildSettingsPage("inexistente").text).toBe(menu.text);
  });
});

import { applyTypingAction as ta } from "@/lib/telegram-responses.server";
describe("typing battle settings", () => {
  const base = { enabled: false, frequency_minutes: 10, style: "sinopse" };
  it("toggle liga/desliga", () => expect(ta(base, "toggle").enabled).toBe(true));
  it("frequência cicla 10 -> 15 e 60 -> 5", () => {
    expect(ta(base, "freq").frequency_minutes).toBe(15);
    expect(ta({ ...base, frequency_minutes: 60 }, "freq").frequency_minutes).toBe(5);
  });
  it("estilo cicla sinopse -> peitoral", () => expect(ta(base, "style").style).toBe("peitoral"));
});
