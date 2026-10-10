import { describe, expect, it } from "vitest";
import {
  isCorrectAnswer,
  applyGuess,
  buildSinopseRound,
  buildSinopseFinal,
  buildCorrectMessage,
  newGame,
  skipRound,
  MAX_ROUNDS,
  toRounds,
  parseAnswers,
  setExtraRounds,
} from "@/lib/telegram-sinopse.server";

describe("game_sinopse", () => {
  it("barra separa Carro e Vela como alternativas completas", () => {
    const rounds = toRounds([{ synopsis: "", answer: " Carro / Vela " }]);
    expect(rounds[0]?.answers).toEqual(["Carro", "Vela"]);
    for (const guess of ["carro", "  VÉLA  "]) {
      const result = applyGuess(
        newGame(() => 0, rounds),
        { id: 1, name: "Ana" },
        guess,
      );
      expect(result.correct).toBe(true);
      expect(result.correct && result.state.players[0]?.points).toBe(1);
    }
    expect(
      applyGuess(
        newGame(() => 0, rounds),
        { id: 1, name: "Ana" },
        "Carro/Vela",
      ),
    ).toEqual({ correct: false });
    expect(
      applyGuess(
        newGame(() => 0, rounds),
        { id: 1, name: "Ana" },
        "Carr",
      ),
    ).toEqual({ correct: false });
  });
  it("alternativas também valem para sinopses cadastradas", () => {
    try {
      setExtraRounds([{ synopsis: "Teste", answer: "Carro/Vela" }]);
      expect(isCorrectAnswer(1, "Carro")).toBe(true);
      expect(isCorrectAnswer(1, "Vela")).toBe(true);
      expect(isCorrectAnswer(1, "Barco")).toBe(false);
    } finally {
      setExtraRounds([]);
    }
  });
  it("alternativas vazias não viram respostas válidas", () => {
    expect(parseAnswers(" / Carro // Vela / ")).toEqual(["Carro", "Vela"]);
    expect(newGame(() => 0, toRounds([{ synopsis: "", answer: " / " }])).order).toEqual([]);
  });
  it("Alpha trauma é correta (com variações)", () => {
    expect(isCorrectAnswer(0, "Alpha trauma")).toBe(true);
    expect(isCorrectAnswer(0, "  ALPHA   tráuma ")).toBe(true);
  });
  it("Aplha Trauma é incorreta", () => expect(isCorrectAnswer(0, "Aplha Trauma")).toBe(false));
  it("sinopse diz 'um alfa'", () =>
    expect(buildSinopseRound({ order: [0], position: 0, players: [] })).toContain("um alfa"));
  it("no máximo 13 rodadas, sem repetir", () => {
    const g = newGame();
    expect(g.order.length).toBeLessThanOrEqual(MAX_ROUNDS);
    expect(new Set(g.order).size).toBe(g.order.length);
  });
  it("erro não muda pontuação", () => {
    const s = { order: [0], position: 0, players: [{ id: 1, name: "Ana", points: 2 }] };
    expect(applyGuess(s, { id: 1, name: "Ana" }, "errado")).toEqual({ correct: false });
  });
  it("acerto dá +1", () => {
    const r = applyGuess(
      { order: [0], position: 0, players: [] },
      { id: 9, name: "Caio" },
      "alpha trauma",
    );
    expect(r.correct && r.state.players).toEqual([{ id: 9, name: "Caio", points: 1 }]);
  });
  it("mensagem de acerto", () =>
    expect(buildCorrectMessage("Ana", "Alpha trauma")).toContain(
      "Ponto para <b>Ana</b>! Era <b>Alpha trauma</b>.",
    ));
  it("placar final com medalhas", () => {
    const f = buildSinopseFinal([
      { id: 1, name: "A", username: "a", points: 0 },
      { id: 2, name: "B", username: "b", points: 3 },
    ]);
    expect(f).toContain("ಲ 🥇@b﹕3 pontos﹒ಿ");
  });
  it("última rodada termina", () =>
    expect(skipRound({ order: [0], position: 0, players: [] }).finished).toBe(true));
});
