// Jogo "Adivinhe pela sinopse" (/game_sinopse).
// Palpites errados não geram nenhuma saída. Rodadas sorteadas em ordem aleatória.
// Sem banco de dados: o jogo de cada chat fica na memória do servidor.

export interface SinopseRound {
  synopsis: string;
  answers: string[];
  display: string;
  /** file_id de foto do Telegram (rodadas com imagem). */
  photo?: string;
}

export interface Player {
  id: number;
  name: string;
  username?: string;
  points: number;
}

export interface SinopseState {
  /** Índices de SINOPSE_ROUNDS na ordem sorteada. */
  order: number[];
  /** Posição atual dentro de `order`. */
  position: number;
  players: Player[];
  /** Rodadas deste jogo (padrão: SINOPSE_ROUNDS). */
  rounds?: SinopseRound[];
}

function roundsOf(state: SinopseState): SinopseRound[] {
  return state.rounds ?? SINOPSE_ROUNDS;
}

/** Converte linhas salvas em rodadas. */
export function toRounds(
  extra: { synopsis: string; answer: string; photo_file_id?: string | null }[],
): SinopseRound[] {
  return extra.map((r) => ({
    synopsis: r.synopsis ? `"${escapeHtml(r.synopsis)}"` : "",
    answers: [r.answer],
    display: r.answer,
    ...(r.photo_file_id ? { photo: r.photo_file_id } : {}),
  }));
}

export const MAX_ROUNDS = 13;

export const SINOPSE_ROUNDS: SinopseRound[] = [
  {
    synopsis:
      '"Anos depois na universidade, o ômega se reencontra com seu antigo professor. Descobrindo a verdade sobre ele ser...um alfa!!"',
    answers: ["Alpha trauma"],
    display: "Alpha trauma",
  },
];

const BASE_ROUND_COUNT = SINOPSE_ROUNDS.length;

/** Junta as rodadas fixas com as adicionadas pelo /add. */
export function setExtraRounds(extra: { synopsis: string; answer: string }[]): void {
  SINOPSE_ROUNDS.splice(
    BASE_ROUND_COUNT,
    SINOPSE_ROUNDS.length - BASE_ROUND_COUNT,
    ...extra.map((r) => ({
      synopsis: `"${escapeHtml(r.synopsis)}"`,
      answers: [r.answer],
      display: r.answer,
    })),
  );
}

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

/** Sorteia até MAX_ROUNDS rodadas (só as que têm resposta). */
export function newGame(
  random: () => number = Math.random,
  rounds?: SinopseRound[],
): SinopseState {
  const pool = (rounds ?? SINOPSE_ROUNDS).map((r, i) => (r.answers.length ? i : -1)).filter((i) => i >= 0);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return { order: pool.slice(0, MAX_ROUNDS), position: 0, players: [], ...(rounds ? { rounds } : {}) };
}

export function currentRound(state: SinopseState): SinopseRound {
  return roundsOf(state)[currentRoundIndex(state)]!;
}

export function currentRoundIndex(state: SinopseState): number {
  return state.order[state.position]!;
}

export function buildSinopseRound(state: SinopseState): string {
  const round = roundsOf(state)[currentRoundIndex(state)]!;
  return (
    `.﹒୨<tg-emoji emoji-id="5429638011392377649">💗</tg-emoji> 𝗥𝗢𝗗𝗔𝗗𝗔 ${boldNum(state.position + 1)}\n\n` +
    (round.synopsis ? `<i>${round.synopsis}</i>\n\n` : "") +
    `ıl 𓏴ᩙᡴ﹒${state.rounds ? "De quem é esse peitoral??" : "Que obra é essa??"} ᰍ﹒<tg-emoji emoji-id="5472231485534652748">💭</tg-emoji>`
  );
}

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
  const idx = currentRoundIndex(state);
  const round = roundsOf(state)[idx];
  const g = normalize(guess);
  if (!round || !g || !round.answers.some((a) => normalize(a) === g)) return { correct: false };
  const merged = mergeParticipants(state, [user]);
  merged.players.find((p) => p.id === user.id)!.points += 1;
  const next = state.position + 1;
  return {
    correct: true,
    state: { ...merged, position: next },
    finished: next >= state.order.length,
    display: round.display,
  };
}

export function skipRound(state: SinopseState): { state: SinopseState; finished: boolean } {
  const next = state.position + 1;
  return { state: { ...state, position: next }, finished: next >= state.order.length };
}

export function buildCorrectMessage(name: string, display: string): string {
  return `✅️﹔Ponto para <b>${escapeHtml(name)}</b>! Era <b>${escapeHtml(display)}</b>. ഉ﹒<tg-emoji emoji-id="5465659176254458158">✨</tg-emoji> 𑁯ᰍ`;
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
