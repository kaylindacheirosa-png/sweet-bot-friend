// Jogo "Adivinhe pela sinopse": o bot manda uma sinopse e o usuário responde digitando.
// Sem banco de dados: rodada e pontos ficam escritos na própria mensagem do bot
// (linha "Rodada X de Y · Pontos: Z"), e o usuário responde a ela (force_reply).

export interface SinopseRound {
  synopsis: string;
  answers: string[]; // respostas aceitas (comparação sem acentos/maiúsculas)
  display: string;
}

// Jogo com 13 rodadas — obras de boys love. Trocar os placeholders conforme o usuário enviar.
export const SINOPSE_ROUNDS: SinopseRound[] = [
  {
    synopsis:
      '"Anos depois na universidade, o ômega se reencontra com seu antigo professor. Descobrindo a verdade sobre ele ser...uma alfa!!"',
    answers: [], // TODO: definir a resposta certa da rodada 1
    display: "A definir",
  },
  {
    synopsis: "Sinopse da rodada 2 será adicionada em breve.",
    answers: [],
    display: "A definir",
  },
  {
    synopsis: "Sinopse da rodada 3 será adicionada em breve.",
    answers: [],
    display: "A definir",
  },
  {
    synopsis: "Sinopse da rodada 4 será adicionada em breve.",
    answers: [],
    display: "A definir",
  },
  {
    synopsis: "Sinopse da rodada 5 será adicionada em breve.",
    answers: [],
    display: "A definir",
  },
  {
    synopsis: "Sinopse da rodada 6 será adicionada em breve.",
    answers: [],
    display: "A definir",
  },
  {
    synopsis: "Sinopse da rodada 7 será adicionada em breve.",
    answers: [],
    display: "A definir",
  },
  {
    synopsis: "Sinopse da rodada 8 será adicionada em breve.",
    answers: [],
    display: "A definir",
  },
  {
    synopsis: "Sinopse da rodada 9 será adicionada em breve.",
    answers: [],
    display: "A definir",
  },
  {
    synopsis: "Sinopse da rodada 10 será adicionada em breve.",
    answers: [],
    display: "A definir",
  },
  {
    synopsis: "Sinopse da rodada 11 será adicionada em breve.",
    answers: [],
    display: "A definir",
  },
  {
    synopsis: "Sinopse da rodada 12 será adicionada em breve.",
    answers: [],
    display: "A definir",
  },
  {
    synopsis: "Sinopse da rodada 13 será adicionada em breve.",
    answers: [],
    display: "A definir",
  },
];

const MARKER = /Rodada (\d+) de (\d+) · Pontos: (\d+)/;

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Números em negrito (𝗥𝗢𝗗𝗗𝗗 𝟭), no mesmo estilo da mensagem do usuário
const BOLD_DIGITS = ["𝟬", "𝟭", "𝟮", "𝟯", "𝟰", "𝟱", "𝟲", "𝟳", "𝟴", "𝟵"];
function boldNum(n: number): string {
  return String(n)
    .split("")
    .map((d) => BOLD_DIGITS[Number(d)]!)
    .join("");
}

export function buildSinopseRound(roundIndex: number, score: number): string {
  const round = SINOPSE_ROUNDS[roundIndex]!;
  return (
    `.﹒୨<tg-emoji emoji-id="5429638011392377649">💗</tg-emoji> 𝗥𝗢𝗗𝗗𝗗 ${boldNum(roundIndex + 1)}\n\n` +
    `<i>${round.synopsis}</i>\n\n` +
    `ıl 𓏴ᩙᡴ﹒Que obra é essa?? ᰍ﹒<tg-emoji emoji-id="5472231485534652748">💭</tg-emoji>\n\n` +
    `Rodada ${roundIndex + 1} de ${SINOPSE_ROUNDS.length} · Pontos: ${score}`
  );
}

/** Lê rodada e pontos da mensagem do bot que o usuário respondeu. */
export function parseSinopseState(botText: string | undefined): { roundIndex: number; score: number } | null {
  if (!botText) return null;
  const m = botText.match(MARKER);
  if (!m) return null;
  const roundIndex = Number(m[1]) - 1;
  const score = Number(m[3]);
  if (roundIndex < 0 || roundIndex >= SINOPSE_ROUNDS.length) return null;
  return { roundIndex, score };
}

export function evaluateSinopse(roundIndex: number, score: number, guess: string) {
  const round = SINOPSE_ROUNDS[roundIndex]!;
  const correct = round.answers.some((a) => normalize(a) === normalize(guess));
  const newScore = correct ? score + 1 : score;
  const feedback = correct
    ? `✅ Acertou! Era <b>${round.display}</b>. (+1 ponto)`
    : `❌ Não foi dessa vez. A resposta era <b>${round.display}</b>.`;
  return { feedback, newScore, isLast: roundIndex === SINOPSE_ROUNDS.length - 1 };
}

export function buildSinopseFinal(score: number): string {
  const total = SINOPSE_ROUNDS.length;
  const medal = score === total ? "🏆" : score >= total / 2 ? "🎉" : "💪";
  return `${medal} <b>Fim de jogo!</b> Você fez <b>${score} de ${total}</b> pontos.\n\nJogue de novo com /game_sinopse`;
}
