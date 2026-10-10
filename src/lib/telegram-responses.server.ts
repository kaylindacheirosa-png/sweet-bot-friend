// Configuração das respostas fixas do bot.
// Para mudar o texto de qualquer resposta, edite apenas os valores aqui.

export interface FixedResponse {
  triggers: string[];
  reply: string;
}

export const WELCOME_MESSAGE = "👋 Olá! Eu sou o bot. Digite /ajuda para ver o que posso fazer.";

export const FIXED_RESPONSES: FixedResponse[] = [
  {
    triggers: ["/ajuda", "/help", "ajuda", "help"],
    reply: [
      "📖 <b>Comandos disponíveis:</b>",
      "",
      "/start — Iniciar a conversa",
      "/ajuda — Ver esta lista",
      "/quiz — Jogar o quiz de perguntas 🎮",
      "/game_sinopse — Adivinhe a obra pela sinopse 🍿",
      "/game_peitoral — Descubra de quem é o peitoral 👀",
      "/pular_rodada — Pular a rodada atual do game_sinopse",
      "/parar_sinopse — Encerrar o game_sinopse e ver o placar",
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

type Keyboard = { text: string; callback_data: string }[][];

const BACK: Keyboard = [[{ text: "⬅️ Voltar", callback_data: "settings:menu" }]];

const SETTINGS_MENU_TEXT = [
  '﹒︶𝆹𝅥﹒<tg-emoji emoji-id="5420462475189432571">🎀</tg-emoji> 𑁘 Yaoitopic cσmandos︐！  <tg-emoji emoji-id="4904936030232117798">🌸</tg-emoji>',
  "",
  "⎯ㅤ𝅭  Sejam bem vindos a área de suporte do bot Yaoitopic. Um bot criado pada a divisão e passatempo para as fãs de Bl. Por aqui você encontrará todos os comandos necessários para se divertir o bastante!",
].join("\n");

const SETTINGS_PAGES: Record<string, { text: string; keyboard: Keyboard }> = {
  menu: {
    text: SETTINGS_MENU_TEXT,
    keyboard: [
      [{ text: "🎮 Jogos", callback_data: "settings:jogos" }],
      [{ text: "🕹️ Controles do jogo", callback_data: "settings:controles" }],
      [
        { text: "🕛 Horário", callback_data: "settings:horario" },
        { text: "📬 Contato", callback_data: "settings:contato" },
      ],
    ],
  },
  jogos: {
    text: "🎮 <b>Jogos</b>\n\n/quiz — Quiz de perguntas\n/game_sinopse — Adivinhe a obra pela sinopse 🍿\n/game_peitoral — Descubra de quem é o peitoral 👀",
    keyboard: BACK,
  },
  controles: {
    text: "🕹️ <b>Controles do jogo</b>\n\n/pular_rodada — Pular a rodada atual\n/parar_sinopse — Encerrar o jogo e ver o placar",
    keyboard: BACK,
  },
  horario: { text: "🕛 Atendemos de segunda a sexta, das 9h às 18h.", keyboard: BACK },
  contato: { text: "📬 Fale com a equipe pelo e-mail: contato@exemplo.com", keyboard: BACK },
};

/** Página do /settings; páginas desconhecidas voltam ao menu. */
export function buildSettingsPage(page: string) {
  return SETTINGS_PAGES[page] ?? SETTINGS_PAGES["menu"]!;
}

export function findReply(text: string): string | null {
  const normalized = text.trim().toLowerCase();

  // Command with a mention like /start@MeuBot still matches /start
  const command = normalized.split("@")[0];

  for (const fixed of FIXED_RESPONSES) {
    if (fixed.triggers.some((t) => t === command || t === normalized)) {
      return fixed.reply;
    }
  }
  return null;
}
