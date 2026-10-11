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

import { applyTypingAction as ta, TYPING_FREQUENCIES, selectedTypingStyles } from "@/lib/telegram-responses.server";
describe("typing battle settings", () => {
  const base = { enabled: false, frequency_minutes: 30, style: "sinopse" };
  it("toggle liga/desliga", () => expect(ta(base, "toggle").enabled).toBe(true));
  it("frequências são apenas 30 min, 1 hora, 2 horas e 5 horas", () => {
    expect(TYPING_FREQUENCIES).toEqual([30, 60, 120, 300]);
    expect([30, 60, 120, 300].map(frequency_minutes => ta({ ...base, frequency_minutes }, "freq").frequency_minutes)).toEqual([60, 120, 300, 30]);
  });
  it("abrir estilos não muda a seleção", () => expect(ta(base, "style").style).toBe("sinopse"));
  it("cada estilo pode ser ligado ou desligado independentemente", () => {
    const both = ta(base, "style:peitoral");
    expect(selectedTypingStyles(both.style)).toEqual(["sinopse", "peitoral"]);
    const onlyPeitoral = ta(both, "style:sinopse");
    expect(selectedTypingStyles(onlyPeitoral.style)).toEqual(["peitoral"]);
    const none = ta(onlyPeitoral, "style:peitoral");
    expect(selectedTypingStyles(none.style)).toEqual([]);
    expect(selectedTypingStyles(ta(none, "style:sinopse").style)).toEqual(["sinopse"]);
  });
  it("frequências antigas voltam ao intervalo mínimo de 30 min", () => {
    expect(ta({ ...base, frequency_minutes: 10 }, "toggle").frequency_minutes).toBe(30);
  });
});
