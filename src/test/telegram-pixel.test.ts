import { describe, expect, it } from "vitest";
import { advancePixel, applyGuess, newGame, toRounds, currentPhoto, PIXEL_PHASE_MS } from "@/lib/telegram-sinopse.server";

const start = () => {
  const g = newGame(() => 0, toRounds([{ synopsis: "", answer: "Carro", photo_file_id: "a|b|c|d" }]), "pixel");
  g.phaseStartedAt = 0;
  return g;
};
const user = { id: 1, name: "Ana" };

describe("game pixel", () => {
  it("acerto em cada fase vale 4, 3, 2 e 1 pontos", () => {
    const got = [0, 1, 2, 3].map((phase) => {
      const r = applyGuess({ ...start(), phase }, user, "carro");
      return r.correct ? r.points : 0;
    });
    expect(got).toEqual([4, 3, 2, 1]);
  });
  it("muda de foto só após 3 minutos e encerra depois da 4ª fase", () => {
    const g = start();
    expect(advancePixel(g, PIXEL_PHASE_MS - 1)).toBeNull();
    expect(advancePixel(g, PIXEL_PHASE_MS)).toBe("phase");
    expect(currentPhoto(g)).toBe("b");
    advancePixel(g, PIXEL_PHASE_MS * 2);
    advancePixel(g, PIXEL_PHASE_MS * 3);
    expect(currentPhoto(g)).toBe("d");
    expect(advancePixel(g, PIXEL_PHASE_MS * 4)).toBe("expired");
  });
});
