// Jogo "Adivinhe pela sinopse": o bot manda uma sinopse e o usuário responde digitando.
// Sem banco de dados: rodada e pontos ficam escritos na própria mensagem do bot
// (linha "Rodada X de Y · Pontos: Z"), e o usuário responde a ela (force_reply).

export interface SinopseRound {
  synopsis: string;
  answers: string[]; // respostas aceitas (comparação sem acentos/maiúsculas)
  display: string;
}

// Sinopses de exemplo — trocar pelas reais quando o usuário enviar.
export const SINOPSE_ROUNDS: SinopseRound[] = [
  {
    synopsis: "Um leão jovem foge do seu reino após a morte do pai, mas precisa voltar para enfrentar o tio e assumir o trono.",
    answers: ["o rei leao", "rei leao", "the lion king"],
    display: "O Rei Leão",
  },
  {
    synopsis: "Um garoto descobre aos 11 anos que é bruxo e vai estudar numa escola de magia, onde enfrenta o bruxo que matou seus pais.",
    answers: ["harry potter", "harry potter e a pedra filosofal"],
    display: "Harry Potter",
  },
  {
    synopsis: "Um navio considerado inafundável bate num iceberg em sua viagem inaugural, enquanto um jovem pobre e uma moça rica se apaixonam.",
    answers: ["titanic"],
    display: "Titanic",
  },
  {
    synopsis: "Brinquedos ganham vida quando os humanos não estão olhando, e um cowboy sente ciúmes do novo astronauta do quarto.",
    answers: ["toy story"],
    display: "Toy Story",
  },
  {
    synopsis: "Uma princesa com poderes de gelo se isola após congelar seu reino sem querer, e sua irmã parte para trazê-la de volta.",
    answers: ["frozen", "frozen uma aventura congelante"],
    display: "Frozen",
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

export function buildSinopseRound(roundIndex: number, score: number): string {
  const round = SINOPSE_ROUNDS[roundIndex]!;
  return (
    `🎬 <b>Rodada ${roundIndex + 1} de ${SINOPSE_ROUNDS.length} · Pontos: ${score}</b>\n\n` +
    `<i>${round.synopsis}</i>\n\n✍️ Responda esta mensagem com o nome do filme.`
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
