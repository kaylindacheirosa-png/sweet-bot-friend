import { describe, expect, it } from "vitest";
import {
  DAILY_FIRST_BONUS,
  DAILY_FIRST_MESSAGE,
  DAILY_MESSAGES,
  DAILY_TIERS,
  buildDailyMessage,
  rollDailyAmount,
} from "@/lib/telegram-daily.server";

describe("sorteio do daily", () => {
  it("respeita as chances definidas pela dona (55/35/10/5/2)", () => {
    expect(DAILY_TIERS.map((t) => t.weight)).toEqual([55, 35, 10, 5, 2]);
  });

  it("cada faixa sorteia valores dentro dos seus limites", () => {
    // random() = 0 cai na primeira faixa e no valor mínimo dela
    expect(rollDailyAmount(() => 0)).toBe(0);
    // logo antes de 55/107 ainda é a faixa 0-150; segundo random() = 0.999... → máximo 150
    const quase55 = 54.999 / 107;
    let calls = 0;
    const amount = rollDailyAmount(() => (calls++ === 0 ? quase55 : 0.999999));
    expect(amount).toBeGreaterThanOrEqual(0);
    expect(amount).toBeLessThanOrEqual(150);
  });

  it("a última faixa premia exatamente 1000 Gems", () => {
    // random() = 0.999... cai na última faixa (1000 fixo)
    expect(rollDailyAmount(() => 0.999999)).toBe(1000);
  });

  it("nunca sorteia valor fora de 0 a 1000", () => {
    for (let i = 0; i < 500; i++) {
      const amount = rollDailyAmount();
      expect(amount).toBeGreaterThanOrEqual(0);
      expect(amount).toBeLessThanOrEqual(1000);
      expect(Number.isInteger(amount)).toBe(true);
    }
  });
});

describe("mensagens do daily", () => {
  it("a primeira recompensa é sempre 200 Gems com a mensagem de boas-vindas", () => {
    expect(DAILY_FIRST_BONUS).toBe(200);
    expect(DAILY_FIRST_MESSAGE).toContain("200 Gems de presente");
    expect(DAILY_FIRST_MESSAGE).toContain('emoji-id="5201914481671682382"');
  });

  it("existem 10 mensagens sorteadas, todas com emoji premium e {amount}", () => {
    expect(DAILY_MESSAGES).toHaveLength(10);
    for (const m of DAILY_MESSAGES) {
      expect(m).toContain("{amount}");
      expect(m).toContain("<tg-emoji emoji-id=");
    }
  });

  it("a mensagem final traz o valor sorteado no lugar de {amount}", () => {
    const msg = buildDailyMessage(777, () => 0);
    expect(msg).toContain("777 Gems");
    expect(msg).not.toContain("{amount}");
    expect(msg).toBe(DAILY_MESSAGES[0]!.replaceAll("{amount}", "777"));
  });
});
