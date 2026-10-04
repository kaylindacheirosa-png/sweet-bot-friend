// Jogo "Adivinhe pela sinopse" (/game_sinopse).
// As pessoas digitam a resposta no chat. Palpites errados não geram nenhuma saída.
// Sem banco de dados: rodada e pontos ficam escondidos num link invisível da mensagem da rodada,
// que o bot fixa no chat. O placar só é mostrado no final.

export interface SinopseRound {
  synopsis: string;
  /** Respostas aceitas. Vazio = rodada sem resposta (use /pular_rodada). */
  answers: string[];
  display: string;
}

export interface Player {
  id: number;
  name: string;
  username?: string;
  points: number;
}

export interface SinopseState {
  roundIndex: number;
  players: Player[];
}

export const SINOPSE_ROUNDS: SinopseRound[] = [
  {
    synopsis:
      '"Anos depois na universidade, o ômega se reencontra com seu antigo professor. Descobrindo a verdade sobre ele ser...uma alfa!!"',
    answers: ["Aplha Trauma"],
    display: "Aplha Trauma",
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
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const BOLD_DIGITS = ["𝟬", "𝟭", "𝟮", "𝟯", "𝟰", "𝟱", "𝟲", "𝟳", "𝟴", "𝟵"];
function boldNum(n: number): string {
  return String(n)
    .split("")
    .map((d) => BOLD_DIGITS[Number(d)]!)
    .join("");
}

const STATE_URL_PREFIX = "https://t.me/s?sinopse=";

export function encodeState(state: SinopseState): string {
  const compact = {
    r: state.roundIndex,
    t: SINOPSE_ROUNDS.length,
    p: state.players.map((p) => [p.id, p.points, p.name, p.username ?? ""]),
  };
  return Buffer.from(JSON.stringify(compact), "utf8").toString("base64url");
}

export function decodeState(code: string): SinopseState | null {
  try {
    const c = JSON.parse(Buffer.from(code, "base64url").toString("utf8"));
    if (c.t !== SINOPSE_ROUNDS.length) return null;
    if (!Number.isInteger(c.r) || c.r < 0 || c.r >= SINOPSE_ROUNDS.length) return null;
    const players: Player[] = (c.p ?? []).map((x: [number, number, string, string]) => ({
      id: x[0],
      points: x[1],
      name: x[2],
      ...(x[3] ? { username: x[3] } : {}),
    }));
    return { roundIndex: c.r, players };
  } catch {
    return null;
  }
}

/** Mensagem da rodada: só identificação e sinopse. Estado fica escondido no link do "﹒". */
export function buildSinopseRound(state: SinopseState): string {
  const round = SINOPSE_ROUNDS[state.roundIndex]!;
  return (
    `.﹒୨<tg-emoji emoji-id="5429638011392377649">💗</tg-emoji> 𝗥𝗢𝗗𝗔𝗗𝗔 ${boldNum(state.roundIndex + 1)}\n\n` +
    `<i>${round.synopsis}</i>\n\n` +
    `ıl 𓏴ᩙᡴ<a href="${STATE_URL_PREFIX}${encodeState(state)}">﹒</a>Que obra é essa?? ᰍ﹒<tg-emoji emoji-id="5472231485534652748">💭</tg-emoji>`
  );
}

export interface TgEntity {
  type: string;
  offset: number;
  length: number;
  url?: string;
  user?: { id: number };
}

export function parseSinopseState(
  _text: string | undefined,
  entities: TgEntity[] = [],
): SinopseState | null {
  for (const e of entities) {
    if (e.type === "text_link" && e.url?.startsWith(STATE_URL_PREFIX)) {
      return decodeState(e.url.slice(STATE_URL_PREFIX.length));
    }
  }
  return null;
}

/** Junta participantes (sem pontos) ao estado, sem duplicar. */
export function mergeParticipants(
  state: SinopseState,
  users: { id: number; name: string; username?: string }[],
): SinopseState {
  const players = state.players.map((p) => ({ ...p }));
  for (const u of users) {
    const ex = players.find((p) => p.id === u.id);
    if (ex) {
      ex.name = u.name;
      if (u.username) ex.username = u.username;
    } else players.push({ ...u, points: 0 });
  }
  return { ...state, players };
}

export type GuessResult =
  | { correct: false }
  | { correct: true; state: SinopseState; finished: boolean; display: string };

export function applyGuess(
  state: SinopseState,
  user: { id: number; name: string; username?: string },
  guess: string,
): GuessResult {
  if (!isCorrectAnswer(state.roundIndex, guess)) return { correct: false };
  const merged = mergeParticipants(state, [user]);
  merged.players.find((p) => p.id === user.id)!.points += 1;
  const next = state.roundIndex + 1;
  return {
    correct: true,
    state: { roundIndex: next, players: merged.players },
    finished: next >= SINOPSE_ROUNDS.length,
    display: SINOPSE_ROUNDS[state.roundIndex]!.display,
  };
}

export function skipRound(state: SinopseState): { state: SinopseState; finished: boolean } {
  const next = state.roundIndex + 1;
  return {
    state: { roundIndex: next, players: state.players },
    finished: next >= SINOPSE_ROUNDS.length,
  };
}

export function buildCorrectMessage(name: string, display: string): string {
  return `✅ <b>${escapeHtml(name)}</b> acertou! Era <b>${escapeHtml(display)}</b>. (+1 ponto)`;
}

function playerLabel(p: Player): string {
  return p.username
    ? `@${escapeHtml(p.username)}`
    : `<a href="tg://user?id=${p.id}">${escapeHtml(p.name)}</a>`;
}

export function buildSinopseFinal(players: Player[]): string {
  const ranking = [...players].sort((a, b) => b.points - a.points);
  const medals = ["🥇", "🥈", "🥉"];
  const header = `◟ㆍPlacar <tg-emoji emoji-id="5422546251587527850">🏆</tg-emoji>𑁯`;
  const lines = ranking.length
    ? ranking.map(
        (p, i) =>
          `ಲ ${medals[i] ?? ". "}${playerLabel(p)}﹕${p.points} ponto${p.points === 1 ? "" : "s"}﹒ಿ`,
      )
    : ["Ninguém participou desta vez."];
  return `${header}\n\n${lines.join("\n")}`;
}
