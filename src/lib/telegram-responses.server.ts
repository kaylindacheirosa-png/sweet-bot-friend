// Configuração das respostas fixas do bot.
// Para mudar o texto de qualquer resposta, edite apenas os valores aqui.

export interface FixedResponse {
  triggers: string[];
  reply: string;
}

export const WELCOME_MESSAGE = "👋 Olá! Eu sou o bot. Digite /ajuda para ver o que posso fazer.";

export const FALLBACK_MESSAGE =
  "🤖 Não entendi essa mensagem.\nDigite /ajuda para ver os comandos disponíveis.";

export const FIXED_RESPONSES: FixedResponse[] = [
  {
    triggers: ["/ajuda", "/help", "ajuda", "help"],
    reply: [
      "📖 <b>Comandos disponíveis:</b>",
      "",
      "/start — Iniciar a conversa",
      "/ajuda — Ver esta lista",
      "/quiz — Jogar o quiz de perguntas 🎮",
      "/horario — Ver horário de atendimento",
      "/contato — Falar com a equipe",
      "",
      "Digite qualquer um deles para receber a resposta. ✅",
    ].join("\n"),
  },
  {
    triggers: ["/horario", "horario", "horário"],
    reply: "🕛 Atendemos de segunda a sexta, das 9h às 18h.",
  },
  {
    triggers: ["/contato", "contato"],
    reply: "📬 Fale com a equipe pelo e-mail: contato@exemplo.com",
  },
];

export function findReply(text: string): string {
  const normalized = text.trim().toLowerCase();

  // Command with a mention like /start@MeuBot still matches /start
  const command = normalized.split("@")[0];

  for (const fixed of FIXED_RESPONSES) {
    if (fixed.triggers.some((t) => t === command || t === normalized)) {
      return fixed.reply;
    }
  }
  return FALLBACK_MESSAGE;
}
