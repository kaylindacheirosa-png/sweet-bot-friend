// Perguntas do quiz do bot.
// Para mudar perguntas, respostas ou a ordem, edite apenas este arquivo.

export interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number; // posição da resposta certa (começa em 0)
}

export const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    question: "Qual é a capital do Brasil?",
    options: ["São Paulo", "Brasília", "Rio de Janeiro", "Salvador"],
    correctIndex: 1,
  },
  {
    question: "Quanto é 7 x 8?",
    options: ["54", "56", "63", "48"],
    correctIndex: 1,
  },
  {
    question: "Qual planeta é conhecido como Planeta Vermelho?",
    options: ["Vênus", "Júpiter", "Marte", "Saturno"],
    correctIndex: 2,
  },
  {
    question: "Quantos dias tem um ano bissexto?",
    options: ["365", "366", "364", "360"],
    correctIndex: 1,
  },
  {
    question: "Qual é o maior oceano do mundo?",
    options: ["Atlântico", "Índico", "Ártico", "Pacífico"],
    correctIndex: 3,
  },
];

// callback_data: "quiz:<perguntaAtual>:<opcaoEscolhida>:<acertos>"
export function buildQuestionMessage(questionIndex: number, score: number) {
  const q = QUIZ_QUESTIONS[questionIndex];
  const text = [
    `🎯 <b>Pergunta ${questionIndex + 1} de ${QUIZ_QUESTIONS.length}</b>`,
    "",
    q.question,
  ].join("\n");

  const keyboard = q.options.map((option, i) => [
    { text: option, callback_data: `quiz:${questionIndex}:${i}:${score}` },
  ]);

  return { text, keyboard };
}

export function buildResultMessage(
  questionIndex: number,
  chosenIndex: number,
  score: number,
): { text: string; newScore: number; isLast: boolean } {
  const q = QUIZ_QUESTIONS[questionIndex];
  const correct = chosenIndex === q.correctIndex;
  const newScore = correct ? score + 1 : score;
  const isLast = questionIndex === QUIZ_QUESTIONS.length - 1;

  const feedback = correct
    ? "✅ <b>Correto!</b>"
    : `❌ <b>Errado!</b> A resposta certa era: <b>${q.options[q.correctIndex]}</b>`;

  return { text: feedback, newScore, isLast };
}

export function buildFinalMessage(score: number): string {
  const total = QUIZ_QUESTIONS.length;
  const ratio = score / total;
  const verdict =
    ratio === 1
      ? "🏆 Perfeito! Você gabaritou!"
      : ratio >= 0.6
        ? "🎉 Muito bem!"
        : "💪 Continue tentando!";

  return [
    `${verdict}`,
    "",
    `Você acertou <b>${score} de ${total}</b> perguntas.`,
    "",
    "Digite /quiz para jogar de novo! 🔄",
  ].join("\n");
}
