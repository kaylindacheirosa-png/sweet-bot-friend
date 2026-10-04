import { describe, expect, it } from "vitest";
import {
  SINOPSE_ROUNDS,
  normalize,
  isCorrectAnswer,
  applyGuess,
  parseSinopseState,
  buildSinopseRound,
  buildSinopseFinal,
  skipRound,
} from "@/lib/telegram-sinopse.server";

describe("game_sinopse", () => {
  it("tem 13 rodadas", () => expect(SINOPSE_ROUNDS).toHaveLength(13));

  it("normaliza maiúsculas, acentos e espaços", () => {
    expect(normalize("  ÁLPHA   Tráuma ")).toBe("alpha trauma");
  });

  it("rodada 1 aceita Alpha trauma com variações", () => {
    expect(isCorrectAnswer(0, "alpha TRAUMA")).toBe(true);
    expect(isCorrectAnswer(0, "  Álpha   trauma  ")).toBe(true);
  });

  it("rodada 1 recusa respostas diferentes", () => {
    expect(isCorrectAnswer(0, "Alpha")).toBe(false);
    expect(isCorrectAnswer(0, "Alpha trauma 2")).toBe(false);
    expect(isCorrectAnswer(0, "")).toBe(false);
  });

  it("rodadas sem resposta cadastrada não aceitam nada", () => {
    expect(isCorrectAnswer(1, "Alpha trauma")).toBe(false);
  });

  it("erro não muda o estado", () => {
    expect(applyGuess({ roundIndex: 0, players: [] }, { id: 1, name: "Ana" }, "outra")).toEqual({
      correct: false,
    });
  });

  it("acerto dá +1 ao participante e avança a rodada", () => {
    const r = applyGuess(
      {
        roundIndex: 0,
        players: [
          { id: 1, name: "Ana", points: 2 },
          { id: 2, name: "Bia", points: 1 },
        ],
      },
      { id: 2, name: "Bia" },
      "alpha trauma",
    );
    expect(r.correct && r.state).toEqual({
      roundIndex: 1,
      players: [
        { id: 1, name: "Ana", points: 2 },
        { id: 2, name: "Bia", points: 2 },
      ],
    });
  });

  it("novo participante entra com 1 ponto", () => {
    const r = applyGuess({ roundIndex: 0, players: [] }, { id: 9, name: "Caio" }, "Alpha trauma");
    expect(r.correct && r.state.players).toEqual([{ id: 9, name: "Caio", points: 1 }]);
  });

  it("após avançar, a mesma resposta não pontua de novo na rodada seguinte", () => {
    const r = applyGuess({ roundIndex: 0, players: [] }, { id: 9, name: "Caio" }, "Alpha trauma");
    if (!r.correct) throw new Error();
    expect(applyGuess(r.state, { id: 9, name: "Caio" }, "Alpha trauma").correct).toBe(false);
  });

  it("última rodada termina o jogo", () => {
    expect(skipRound({ roundIndex: 12, players: [] }).finished).toBe(true);
    expect(skipRound({ roundIndex: 3, players: [] }).finished).toBe(false);
  });

  it("lê rodada e placar da mensagem fixada", () => {
    const html = buildSinopseRound({ roundIndex: 4, players: [{ id: 7, name: "Ana", points: 3 }] });
    expect(html).toContain("Rodada 5 de 13");
    const text = "x\nRodada 5 de 13\n🏅 Placar: Ana 3 · Bia 1";
    const at = text.indexOf("Ana");
    const bt = text.indexOf("Bia");
    const state = parseSinopseState(text, [
      { type: "text_mention", offset: at, length: 3, user: { id: 7 } },
      { type: "text_link", offset: bt, length: 3, url: "tg://user?id=8" },
    ]);
    expect(state).toEqual({
      roundIndex: 4,
      players: [
        { id: 7, name: "Ana", points: 3 },
        { id: 8, name: "Bia", points: 1 },
      ],
    });
  });

  it("ignora mensagens que não são de rodada", () => {
    expect(parseSinopseState("oi")).toBeNull();
  });

  it("placar final ordena por pontos", () => {
    const f = buildSinopseFinal([
      { id: 1, name: "Ana", points: 1 },
      { id: 2, name: "Bia", points: 3 },
    ]);
    expect(f.indexOf("Bia")).toBeLessThan(f.indexOf("Ana"));
  });
});
