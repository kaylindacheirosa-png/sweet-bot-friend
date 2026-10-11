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
      [{ text: "⌨️ Typing Battle", callback_data: "typing:show" }],
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
  const result = SETTINGS_PAGES[page] ?? SETTINGS_PAGES["menu"];
  if (!result) throw new Error("Settings menu is unavailable");
  return result;
}

export interface TypingSettings {
  enabled: boolean;
  frequency_minutes: number;
  style: string;
}

export const TYPING_FREQUENCIES = [30, 60, 120, 300];
export const TYPING_STYLES = ["sinopse", "peitoral"];

export function normalizeTypingSettings(s: TypingSettings): TypingSettings {
  return {
    ...s,
    frequency_minutes: TYPING_FREQUENCIES.includes(s.frequency_minutes) ? s.frequency_minutes : 30,
  };
}

export function selectedTypingStyles(style: string): string[] {
  if (style === "ambos") return [...TYPING_STYLES];
  return TYPING_STYLES.includes(style) ? [style] : [];
}

const TYPING_TEXT = [
  '<tg-emoji emoji-id="5429273196870254885">⌨️</tg-emoji>﹕Typing Battle﹒᱖',
  "",
  '➜﹕<tg-emoji emoji-id="6043930317402676062">💬</tg-emoji>໑﹒ O bot enviará no chat um tópico de BL, e os usuários deverão tentar adivinhá-lo o mais rápido possível. Vence quem enviar a resposta correta primeiro.﹒ゞ﹑ᶻz ﹒',
].join("\n");

/** Próximo item de uma lista cíclica. */
export function nextInCycle<T>(list: T[], current: T): T {
  const i = list.indexOf(current);
  const next = list[(i + 1) % list.length];
  if (next === undefined) throw new Error("Cannot cycle an empty list");
  return next;
}

export function applyTypingAction(s: TypingSettings, action: string): TypingSettings {
  s = normalizeTypingSettings(s);
  if (action === "toggle") return { ...s, enabled: !s.enabled };
  if (action === "freq")
    return { ...s, frequency_minutes: nextInCycle(TYPING_FREQUENCIES, s.frequency_minutes) };
  if (action.startsWith("style:")) {
    const target = action.slice(6);
    if (!TYPING_STYLES.includes(target)) return s;
    const selected = new Set(selectedTypingStyles(s.style));
    if (selected.has(target)) selected.delete(target);
    else selected.add(target);
    return { ...s, style: selected.size === 2 ? "ambos" : [...selected][0] ?? "nenhum" };
  }
  return s;
}

export function buildTypingPage(s: TypingSettings, showStyles = false): { text: string; keyboard: Keyboard } {
  s = normalizeTypingSettings(s);
  const selected = selectedTypingStyles(s.style);
  const frequency = s.frequency_minutes === 30 ? "30 min" : `${s.frequency_minutes / 60} ${s.frequency_minutes === 60 ? "hora" : "horas"}`;
  return {
    text: TYPING_TEXT,
    keyboard: [
      [
        {
          text: s.enabled ? "Estado: ✅️" : "Estado: ❌",
          callback_data: "typing:toggle",
        },
      ],
      [{ text: `⏱️ Frequência: ${frequency}`, callback_data: "typing:freq" }],
      [{ text: "🎭 Estilo", callback_data: "typing:style" }],
      ...(showStyles ? [[
        { text: `${selected.includes("sinopse") ? "✅" : "❌"} Sinopse`, callback_data: "typing:style:sinopse" },
        { text: `${selected.includes("peitoral") ? "✅" : "❌"} Peitoral`, callback_data: "typing:style:peitoral" },
      ]] : []),
      ...BACK,
    ],
  };
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
