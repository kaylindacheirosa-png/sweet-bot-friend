import { describe, expect, it } from "vitest";
import {
  SINOPSE_ROUNDS, isCorrectAnswer, applyGuess, parseSinopseState, buildSinopseRound,
  buildSinopseFinal, skipRound, mergeParticipants,
} from "@/lib/telegram-sinopse.server";

describe("game_sinopse", () => {
  it("tem 13 rodadas", () => expect(SINOPSE_ROUNDS).toHaveLength(13));
  it("Aplha Trauma é correta (com variações)", () => {
    expect(isCorrectAnswer(0, "Aplha Trauma")).toBe(true);
    expect(isCorrectAnswer(0, "  aplha   TRÁUMA ")).toBe(true);
  });
  it("Alpha Trauma é incorreta", () => expect(isCorrectAnswer(0, "Alpha Trauma")).toBe(false));
  it("erro não muda pontuação", () => {
    const s = { roundIndex: 0, players: [{ id: 1, name: "Ana", points: 2 }] };
    expect(applyGuess(s, { id: 1, name: "Ana" }, "Alpha Trauma")).toEqual({ correct: false });
    expect(s.players[0]!.points).toBe(2);
  });
  it("acerto dá +1 e avança", () => {
    const r = applyGuess({ roundIndex: 0, players: [] }, { id: 9, name: "Caio" }, "aplha trauma");
    expect(r.correct && r.state).toEqual({ roundIndex: 1, players: [{ id: 9, name: "Caio", points: 1 }] });
  });
  it("mensagem da rodada sem placar e sem 'Digite a resposta'", () => {
    const html = buildSinopseRound({ roundIndex: 0, players: [{ id: 7, name: "Ana", points: 3 }] });
    expect(html).not.toContain("Placar");
    expect(html).not.toContain("Ana");
    expect(html).not.toContain("Digite a resposta");
  });
  it("estado escondido é lido de volta", () => {
    const state = { roundIndex: 4, players: [{ id: 7, name: "Ana", username: "ana", points: 3 }] };
    const url = buildSinopseRound(state).match(/href="([^"]+)"/)![1]!;
    expect(parseSinopseState("x", [{ type: "text_link", offset: 0, length: 1, url }])).toEqual(state);
  });
  it("placar final com cabeçalho e medalhas", () => {
    const f = buildSinopseFinal([
      { id: 1, name: "A", username: "a", points: 0 },
      { id: 2, name: "B", username: "b", points: 3 },
      { id: 3, name: "C", username: "c", points: 1 },
      { id: 4, name: "D", points: 0 },
    ]);
    expect(f).toContain("5422546251587527850");
    expect(f).toContain("ಲ 🥇@b﹕3 pontos﹒ಿ");
    expect(f).toContain("ಲ 🥈@c﹕1 ponto﹒ಿ");
    expect(f).toContain("ಲ 🥉@a﹕0 pontos﹒ಿ");
    expect(f).toContain('ಲ . <a href="tg://user?id=4">D</a>﹕0 pontos﹒ಿ');
  });
  it("somente participantes reais no placar", () => {
    const s = mergeParticipants({ roundIndex: 0, players: [] }, [{ id: 5, name: "Eva" }]);
    const f = buildSinopseFinal(s.players);
    expect(s.players).toHaveLength(1);
    expect((f.match(/ಲ/g) ?? []).length).toBe(1);
  });
  it("última rodada termina", () => expect(skipRound({ roundIndex: 12, players: [] }).finished).toBe(true));
});
