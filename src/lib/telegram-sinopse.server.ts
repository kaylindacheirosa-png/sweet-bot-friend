// Jogo "Adivinhe pela sinopse" (/game_sinopse).
// As pessoas digitam a resposta normalmente no chat (sem botões, sem precisar responder à mensagem).
// Sem banco de dados: rodada e placar ficam escritos na mensagem da rodada, que o bot fixa no chat.
// A cada mensagem, o bot lê a mensagem fixada para saber a rodada e os pontos de cada participante.

export interface SinopseRound {
  synopsis: string;
  /** Respostas aceitas. Vazio = rodada ainda sem resposta definida (ninguém pontua; use /pular_rodada). */
  answers: string[];
  /** Nome mostrado quando alguém acerta. */
  display: string;
}

export interface Player {
  id: number;
  name: string;
  points: number;
}

export interface SinopseState {
  roundIndex: number;
  players: Player[];
}

// 13 rodadas — obras de boys love. Rodadas 2 a 13 aguardam sinopse e resposta.
export const SINOPSE_ROUNDS: SinopseRound[] = [
  {
    synopsis:
      '"Anos depois na universidade, o ômega se reencontra com seu antigo professor. Descobrindo a verdade sobre ele ser...uma alfa!!"',
    answers: ["Alpha trauma"],
    display: "Alpha trauma",
  },
  ...Array.from({ length: 12 }, (_, i) => ({
    synopsis: `Sinopse da rodada ${i + 2} será adicionada em breve.`,
    answers: [] as string[],
    display: "",
  })),
];

export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function isCorrectAnswer(roundIndex: number, guess: string): boolean {
  const round = SINOPSE_ROUNDS[roundIndex];
  if (!round) return false;
  const g = normalize(guess);
  if (!g) return false;
  return round.answers.some((a) => normalize(a) === g);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const BOLD_DIGITS = ["𝟬", "𝟭", "𝟮", "𝟯", "𝟰", "𝟱", "𝟲", "𝟳", "𝟴", "𝟵"];
function boldNum(n: number): string {
  return String(n)
    .split("")
    .map((d) => BOLD_DIGITS[Number(d)]!)
    .join("");
}

const ROUND_MARKER = /Rodada (\d+) de (\d+)/;
const SCORE_LABEL = "🏅 Placar: ";

function scoreboardHtml(players: Player[]): string {
  if (players.length === 0) return `${SCORE_LABEL}ninguém pontuou ainda`;
  return (
    SCORE_LABEL +
    players
      .map((p) => `<a href="tg://user?id=${p.id}">${escapeHtml(p.name)}</a> ${p.points}`)
      .join(" · ")
  );
}

export function buildSinopseRound(state: SinopseState): string {
  const round = SINOPSE_ROUNDS[state.roundIndex]!;
  const pending = round.answers.length === 0
    ? `\n\n⚠️ Esta rodada ainda não tem resposta cadastrada. Use /pular_rodada para seguir.`
    : "";
  return (
    `.﹒୨<tg-emoji emoji-id="5429638011392377649">💗</tg-emoji> 𝗥𝗢𝗗𝗔𝗗𝗔 ${boldNum(state.roundIndex + 1)}\n\n` +
    `<i>${round.synopsis}</i>\n\n` +
    `ıl 𓏴ᩙᡴ﹒Que obra é essa?? ᰍ﹒<tg-emoji emoji-id="5472231485534652748">💭</tg-emoji>\n\n` +
    `✍️ Digite a resposta aqui no chat — não precisa responder a esta mensagem.${pending}\n\n` +
    `Rodada ${state.roundIndex + 1} de ${SINOPSE_ROUNDS.length}\n` +
    scoreboardHtml(state.players)
  );
}

export interface TgEntity {
  type: string;
  offset: number;
  length: number;
  url?: string;
  user?: { id: number };
}

/** Lê rodada e placar da mensagem da rodada (texto + entidades devolvidas pelo Telegram). */
export function parseSinopseState(
  text: string | undefined,
  entities: TgEntity[] = [],
): SinopseState | null {
  if (!text) return null;
  const m = text.match(ROUND_MARKER);
  if (!m || Number(m[2]) !== SINOPSE_ROUNDS.length) return null;
  const roundIndex = Number(m[1]) - 1;
  if (roundIndex < 0 || roundIndex >= SINOPSE_ROUNDS.length) return null;

  const labelAt = text.indexOf(SCORE_LABEL);
  const players: Player[] = [];
  if (labelAt >= 0) {
    for (const e of entities) {
      if (e.offset < labelAt) continue;
      let id: number | undefined;
      if (e.type === "text_mention" && e.user) id = e.user.id;
      else if (e.type === "text_link" && e.url) {
        const u = e.url.match(/^tg:\/\/user\?id=(\d+)$/);
        if (u) id = Number(u[1]);
      }
      if (id === undefined) continue;
      const name = text.slice(e.offset, e.offset + e.length);
      const pts = text.slice(e.offset + e.length).match(/^ (\d+)/);
      if (!pts) continue;
      players.push({ id, name, points: Number(pts[1]) });
    }
  }
  return { roundIndex, players };
}

export type GuessResult =
  | { correct: false }
  | { correct: true; state: SinopseState; finished: boolean; display: string };

/** Primeiro acerto da rodada: +1 ponto para quem acertou e avança a rodada. Erro: nada muda. */
export function applyGuess(
  state: SinopseState,
  user: { id: number; name: string },
  guess: string,
): GuessResult {
  if (!isCorrectAnswer(state.roundIndex, guess)) return { correct: false };
  const players = state.players.map((p) => ({ ...p }));
  const existing = players.find((p) => p.id === user.id);
  if (existing) existing.points += 1;
  else players.push({ id: user.id, name: user.name, points: 1 });
  const next = state.roundIndex + 1;
  return {
    correct: true,
    state: { roundIndex: next, players },
    finished: next >= SINOPSE_ROUNDS.length,
    display: SINOPSE_ROUNDS[state.roundIndex]!.display,
  };
}

export function skipRound(state: SinopseState): { state: SinopseState; finished: boolean } {
  const next = state.roundIndex + 1;
  return { state: { roundIndex: next, players: state.players }, finished: next >= SINOPSE_ROUNDS.length };
}

export function buildCorrectMessage(name: string, display: string): string {
  return `✅ <b>${escapeHtml(name)}</b> acertou! Era <b>${escapeHtml(display)}</b>. (+1 ponto)`;
}

export function buildSinopseFinal(players: Player[]): string {
  const ranking = [...players].sort((a, b) => b.points - a.points);
  const medals = ["🥇", "🥈", "🥉"];
  const lines = ranking.length
    ? ranking.map((p, i) => `${medals[i] ?? "▫️"} ${escapeHtml(p.name)} — ${p.points} ponto${p.points === 1 ? "" : "s"}`)
    : ["Ninguém pontuou desta vez."];
  return `🏁 <b>Fim de jogo!</b>\n\n<b>Pontuação final:</b>\n${lines.join("\n")}\n\nJogue de novo com /game_sinopse`;
}
