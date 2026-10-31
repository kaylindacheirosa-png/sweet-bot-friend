import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "crypto";
import {
  findReply,
  buildSettingsPage,
  buildTypingPage,
  applyTypingAction,
  WELCOME_MESSAGE,
} from "@/lib/telegram-responses.server";
import {
  QUIZ_QUESTIONS,
  buildQuestionMessage,
  buildResultMessage,
  buildFinalMessage,
} from "@/lib/telegram-quiz.server";
import {
  DAILY_FIRST_MESSAGE,
  buildDailyMessage,
  rollDailyAmount,
} from "@/lib/telegram-daily.server";
import {
  buildSinopseRound,
  newGame,
  applyGuess,
  skipRound,
  buildCorrectMessage,
  buildSinopseFinal,
  mergeParticipants,
  normalize,
  setExtraRounds,
  toRounds,
  currentRound,
  type SinopseState,
  type ExtraGame,
} from "@/lib/telegram-sinopse.server";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";
const SINOPSE_IMAGE_URL = "https://i.imgur.com/WSx9VxL.jpeg";
const PEITORAL_IMAGE_URL = "https://i.imgur.com/JNoWEA8.jpeg";
const OWNER_ID = 6733728637;

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function loadRounds(game: "sinopse" | ExtraGame) {
  const { data, error } = await (
    await db()
  )
    .from("sinopse_rounds")
    .select("id, synopsis, answer, photo_file_id")
    .eq("game", game)
    .order("created_at");
  if (error) console.error("load rounds failed", error);
  return data ?? [];
}

async function loadExtraRounds(): Promise<void> {
  setExtraRounds(await loadRounds("sinopse"));
}

/** Fluxo do /add (só a dona). Retorna true se tratou a mensagem. */
async function handleAddFlow(
  chatId: number,
  userId: number,
  text: string,
  firstWord: string,
  photo?: string,
) {
  if (userId !== OWNER_ID) return firstWord === "/add"; // ignora outros
  const sb = await db();
  if (firstWord === "/cancelar") {
    const { data } = await sb.from("bot_add_sessions").delete().eq("user_id", userId).select();
    if (data?.length) {
      await sendTelegramMessage(chatId, "❌ Adição cancelada.");
      return true;
    }
    return false;
  }
  if (firstWord === "/add") {
    await sb
      .from("bot_add_sessions")
      .upsert({ user_id: userId, step: "game", synopsis: null, game: null });
    await sendTelegramMessage(
      chatId,
      "🎮 O que você quer adicionar?\n\n1 — /game_sinopse\n2 — /game_peitoral\n3 — /game_emoji\n4 — Personagem\n5 — /game_pixel\n6 — /game_capa\n7 — /game_cabelo\n8 — /game_olho\n\n(ou /cancelar)",
    );
    return true;
  }
  if (text.trim().startsWith("/") && !["/game_sinopse", "/game_peitoral"].includes(firstWord))
    return false;
  const { data: session } = await sb
    .from("bot_add_sessions")
    .select("step, synopsis, game")
    .eq("user_id", userId)
    .maybeSingle();
  if (!session) return false;
  const t = text.trim();
  if (session.step === "game") {
    const g = normalize(t);
    const game =
      g === "1" || g.includes("sinopse")
        ? "sinopse"
        : g === "2" || g.includes("peitoral")
          ? "peitoral"
          : g === "3" || g.includes("emoji")
            ? "emoji"
            : g === "5" || g.includes("pixel") ? "pixel"
            : g === "6" || g.includes("capa") ? "capa"
            : g === "7" || g.includes("cabelo") ? "cabelo"
            : g === "8" || g.includes("olho") ? "olho"
            : null;
    if (!game) {
      await sendTelegramMessage(
        chatId,
        "Responda 1 (/game_sinopse), 2 (/game_peitoral), 3 (/game_emoji), 5 (/game_pixel), 6 (/game_capa), 7 (/game_cabelo) ou 8 (/game_olho).",
      );
      return true;
    }
    await sb.from("bot_add_sessions").update({ step: "synopsis", game }).eq("user_id", userId);
    await sendTelegramMessage(
      chatId,
      ["peitoral", "pixel", "capa", "cabelo", "olho"].includes(game)
        ? "🖼️ Mande a imagem da rodada (pode ter legenda) ou um texto. (ou /cancelar)"
        : game === "emoji"
          ? "😀 Mande a sequência de emojis da rodada. (ou /cancelar)"
          : "📝 Qual é a sinopse? (ou /cancelar)",
    );
    return true;
  }
  if (t.startsWith("/")) return false;
  if (session.step === "synopsis") {
    await sb
      .from("bot_add_sessions")
      .update({ step: "answer", synopsis: photo ? `photo:${photo}\n${t}` : t })
      .eq("user_id", userId);
    await sendTelegramMessage(
      chatId,
      "✅ Anotado! Agora, qual é a resposta? Para aceitar alternativas, separe com / (ex.: Carro/Vela).",
    );
    return true;
  }
  if (!t) return true;
  let synopsis = session.synopsis ?? "";
  let photo_file_id: string | null = null;
  if (synopsis.startsWith("photo:")) {
    const nl = synopsis.indexOf("\n");
    photo_file_id = synopsis.slice(6, nl);
    synopsis = synopsis.slice(nl + 1);
  }
  const game = session.game ?? "sinopse";
  const { error } = await sb
    .from("sinopse_rounds")
    .insert({ synopsis, answer: t, game, photo_file_id });
  await sb.from("bot_add_sessions").delete().eq("user_id", userId);
  await sendTelegramMessage(
    chatId,
    error
      ? "⚠️ Não consegui salvar. Tente /add de novo."
      : `🎉 Rodada salva! Ela já entra no /game_${game}.`,
  );
  return true;
}

// Mensagem de introdução do /game_sinopse (com emoji premium)
const SINOPSE_INTRO_MESSAGE = `𖼥﹒<tg-emoji emoji-id="5444896024445352143">💋</tg-emoji>﹒⦙⦙𑊁᷼ <tg-emoji emoji-id="5003645910681388672">💋</tg-emoji>OGO DA <tg-emoji emoji-id="5003544549453202818">📎</tg-emoji>INOPSE <tg-emoji emoji-id="4981007597625673295">🙃</tg-emoji> ゙౿\n\n＞ <tg-emoji emoji-id="5447328517828148260">💬</tg-emoji>﹒Neste jogo, iremos mandar sinopses de determinadas obras de boys love. Sua missão será identificar corretamente de qual obra estamos falando. . ⢷⌒𑁯\n\n﹒﹒<tg-emoji emoji-id="5429392313493242588">💗</tg-emoji>﹑<tg-emoji emoji-id="5413656137436270977">💜</tg-emoji>oa <tg-emoji emoji-id="5411517200773186685">💌</tg-emoji>orte﹗﹒<tg-emoji emoji-id="5445068445907449682">🍀</tg-emoji>`;

const PEITORAL_INTRO_MESSAGE = `𖼥﹒<tg-emoji emoji-id="5240004588114829391">✨</tg-emoji>﹒⦙⦙𑊁᷼  <tg-emoji emoji-id="5082316568944182103">💋</tg-emoji>OGO DO <tg-emoji emoji-id="5134415857979491173">📎</tg-emoji>EITOTAL <tg-emoji emoji-id="6042107490332579591">🙃</tg-emoji> ゙౿\n\n＞ <tg-emoji emoji-id="5890739983689455462">💬</tg-emoji>﹒Neste jogo, sua missão é descobrir de quem são os incríveis, majestosos e suculentos (ou não) seios. ﹒⢷⌒𑁯\n\n﹒★﹑Sua reposta vale ao nome do personagem e da obra.﹗﹒\n\n﹒﹒<tg-emoji emoji-id="6042001219956775130">💗</tg-emoji>﹑<tg-emoji emoji-id="5226719305080527970">💜</tg-emoji>oa <tg-emoji emoji-id="5226469050221094046">💌</tg-emoji>orte﹗﹒<tg-emoji emoji-id="5260339961181275846">🍀</tg-emoji>`;

const EMOJI_INTRO_MESSAGE = `𖼥﹒<tg-emoji emoji-id="5269464520417363323">💋</tg-emoji>﹒⦙⦙𑊁᷼  <tg-emoji emoji-id="5251430025755903710">💋</tg-emoji>DIVINHA PELO <tg-emoji emoji-id="5003988713496118896">📎</tg-emoji>MOJI  ゙౿\n\n＞ <tg-emoji emoji-id="5429477976615961027">💬</tg-emoji>﹒Nesse jogo, iremos mandar uma sequência de emojis e sua missão é adivinhar de qual obra estamos nos referindo. ﹒⢷⌒𑁯\n\n﹒﹒<tg-emoji emoji-id="5343844021020154537">💗</tg-emoji>﹑<tg-emoji emoji-id="5226719305080527970">💜</tg-emoji>oa <tg-emoji emoji-id="5226469050221094046">💌</tg-emoji>orte﹗﹒<tg-emoji emoji-id="6041684689456994224">🍀</tg-emoji>`;

const IMAGE_GAME_INTROS = {
  pixel: "👾 <b>JOGO DO PIXEL</b>\n\nVamos mandar uma imagem pixelada. Sua missão é descobrir a obra ou o personagem!\n\nBoa sorte! 🍀",
  capa: "📚 <b>JOGO DA CAPA</b>\n\nVamos mandar uma capa. Sua missão é descobrir de qual obra ela é!\n\nBoa sorte! 🍀",
  cabelo: "💇 <b>JOGO DO CABELO</b>\n\nVamos mandar um cabelo. Sua missão é descobrir de qual personagem ele é!\n\nBoa sorte! 🍀",
  olho: "👀 <b>JOGO DO OLHO</b>\n\nVamos mandar um par de olhos. Sua missão é descobrir de qual personagem eles são!\n\nBoa sorte! 🍀",
} as const;

function deriveWebhookSecret(telegramApiKey: string): string {
  return createHash("sha256").update(`telegram-webhook:${telegramApiKey}`).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function sendTelegramMessage(
  chatId: number,
  text: string,
  keyboard?: { text: string; callback_data: string }[][],
  forceReply?: boolean,
): Promise<number | null> {
  const body: Record<string, unknown> = { chat_id: chatId, text, parse_mode: "HTML" };
  if (keyboard) {
    body["reply_markup"] = { inline_keyboard: keyboard };
  } else if (forceReply) {
    body["reply_markup"] = { force_reply: true, input_field_placeholder: "Nome do filme..." };
  }

  const response = await fetch(`${GATEWAY_URL}/sendMessage`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env["LOVABLE_API_KEY"]}`,
      "X-Connection-Api-Key": process.env["TELEGRAM_API_KEY"] ?? "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`Telegram sendMessage failed [${response.status}]: ${errorBody}`);
    return null;
  }
  const json = (await response.json()) as { result?: { message_id?: number } };
  return json.result?.message_id ?? null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function callTelegram(method: string, payload: Record<string, unknown>): Promise<any> {
  const response = await fetch(`${GATEWAY_URL}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env["LOVABLE_API_KEY"]}`,
      "X-Connection-Api-Key": process.env["TELEGRAM_API_KEY"] ?? "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    console.error(`Telegram ${method} failed [${response.status}]: ${await response.text()}`);
    return null;
  }
  return ((await response.json()) as { result?: unknown }).result ?? null;
}

// Jogo ativo por chat (memória do servidor, sem banco de dados).
const activeGames = new Map<number, SinopseState>();
const wrongGuessers = new Map<number, { id: number; name: string; username?: string }[]>();

async function postSinopseRound(chatId: number, state: SinopseState): Promise<void> {
  activeGames.set(chatId, state);
  const round = currentRound(state);
  const result = round.photo
    ? await sendTelegramPhoto(chatId, round.photo, buildSinopseRound(state))
    : await sendTelegramMessage(chatId, buildSinopseRound(state));
  if (round.id) {
    const { recordContentMessage } = await import("@/lib/telegram-content.server");
    await recordContentMessage(chatId, result, "round", round.id);
  }
}

async function finishSinopse(chatId: number, state: SinopseState): Promise<void> {
  activeGames.delete(chatId);
  const final = mergeParticipants(state, wrongGuessers.get(chatId) ?? []);
  wrongGuessers.delete(chatId);
  await sendTelegramMessage(chatId, buildSinopseFinal(final.players));
}

async function sendTelegramPhoto(
  chatId: number,
  photoUrl: string,
  caption?: string,
): Promise<number | null> {
  const body: Record<string, unknown> = { chat_id: chatId, photo: photoUrl };
  if (caption) {
    body["caption"] = caption;
    body["parse_mode"] = "HTML";
  }

  const response = await fetch(`${GATEWAY_URL}/sendPhoto`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env["LOVABLE_API_KEY"]}`,
      "X-Connection-Api-Key": process.env["TELEGRAM_API_KEY"] ?? "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`Telegram sendPhoto failed [${response.status}]: ${errorBody}`);
    // Plano B: envia o arquivo diretamente (upload) caso o Telegram não consiga baixar o link
    try {
      const img = await fetch(photoUrl);
      const form = new FormData();
      form.append("chat_id", String(chatId));
      form.append(
        "photo",
        new Blob([await img.arrayBuffer()], { type: "image/jpeg" }),
        "imagem.jpg",
      );
      if (caption) {
        form.append("caption", caption);
        form.append("parse_mode", "HTML");
      }
      const retry = await fetch(`${GATEWAY_URL}/sendPhoto`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env["LOVABLE_API_KEY"]}`,
          "X-Connection-Api-Key": process.env["TELEGRAM_API_KEY"] ?? "",
        },
        body: form,
      });
      if (retry.ok) {
        const json = await retry.json() as { result?: { message_id?: number } };
        return json.result?.message_id ?? null;
      }
      console.error(`Telegram sendPhoto upload failed [${retry.status}]: ${await retry.text()}`);
    } catch (e) {
      console.error("sendPhoto upload error", e);
    }
    // Último recurso: manda só o texto
    if (caption) return await sendTelegramMessage(chatId, caption);
    return null;
  }
  const json = await response.json() as { result?: { message_id?: number } };
  return json.result?.message_id ?? null;
}

async function answerCallbackQuery(callbackQueryId: string): Promise<void> {
  await fetch(`${GATEWAY_URL}/answerCallbackQuery`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env["LOVABLE_API_KEY"]}`,
      "X-Connection-Api-Key": process.env["TELEGRAM_API_KEY"] ?? "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ callback_query_id: callbackQueryId }),
  });
}

async function handleQuizCallback(
  chatId: number,
  callbackQueryId: string,
  data: string,
): Promise<void> {
  // data: "quiz:<pergunta>:<opcao>:<acertos>"
  const parts = data.split(":");
  const questionIndex = Number(parts[1]);
  const chosenIndex = Number(parts[2]);
  const score = Number(parts[3]);

  if (
    !Number.isInteger(questionIndex) ||
    !Number.isInteger(chosenIndex) ||
    !Number.isInteger(score) ||
    questionIndex < 0 ||
    questionIndex >= QUIZ_QUESTIONS.length
  ) {
    await answerCallbackQuery(callbackQueryId);
    return;
  }

  const result = buildResultMessage(questionIndex, chosenIndex, score);
  await answerCallbackQuery(callbackQueryId);

  if (result.isLast) {
    await sendTelegramMessage(chatId, `${result.text}\n\n${buildFinalMessage(result.newScore)}`);
  } else {
    const next = buildQuestionMessage(questionIndex + 1, result.newScore);
    await sendTelegramMessage(chatId, `${result.text}\n\n${next.text}`, next.keyboard);
  }
}

function formatRemaining(ms: number): string {
  const totalMinutes = Math.max(1, Math.ceil(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}min` : `${minutes}min`;
}

async function callGensRpc<T>(rpcName: "claim_telegram_daily" | "get_telegram_gens", payload: Record<string, unknown>): Promise<T | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin as any).rpc(rpcName, payload);
  if (error) {
    console.error(`Gens ${rpcName} failed: ${error.message}`);
    return null;
  }
  return data as T;
}

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const telegramApiKey = process.env["TELEGRAM_API_KEY"];
        if (!telegramApiKey) {
          console.error("TELEGRAM_API_KEY is not configured");
          return Response.json({ ok: false }, { status: 500 });
        }

        // Telegram sends this header on every delivery — verify before trusting the payload
        const expectedSecret = deriveWebhookSecret(telegramApiKey);
        const actualSecret = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
        if (!safeEqual(actualSecret, expectedSecret)) {
          return new Response("Unauthorized", { status: 401 });
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let update: any;
        try {
          update = await request.json();
        } catch {
          return Response.json({ ok: true, ignored: true });
        }

        // Economy handlers only receive signature-verified Telegram updates.
        // Edited messages never repeat purchases, gifts, wish toggles or trades.
        if (update?.edited_message && !update?.message && !update?.callback_query) {
          return Response.json({ ok: true, ignored: true });
        }
        const { handleContentUpdate } = await import("@/lib/telegram-content.server");
        if (await handleContentUpdate(update, {
          send: sendTelegramMessage,
          answer: answerCallbackQuery,
          botId: async () => {
            const bot = await callTelegram("getMe", {});
            return typeof bot?.id === "number" ? bot.id : null;
          },
        })) return Response.json({ ok: true });
        const { handleCharacterUpdate } = await import("@/lib/telegram-characters.server");
        if (await handleCharacterUpdate(update, {
          send: sendTelegramMessage,
          photo: sendTelegramPhoto,
          answer: answerCallbackQuery,
        })) return Response.json({ ok: true });

        // Clique em botão do quiz
        const callbackQuery = update.callback_query;
        if (callbackQuery?.data?.startsWith("settings:")) {
          const msg = callbackQuery.message;
          await answerCallbackQuery(callbackQuery.id);
          if (typeof msg?.chat?.id === "number") {
            const page = buildSettingsPage(callbackQuery.data.slice(9));
            await callTelegram("editMessageText", {
              chat_id: msg.chat.id,
              message_id: msg.message_id,
              text: page.text,
              parse_mode: "HTML",
              reply_markup: { inline_keyboard: page.keyboard },
            });
          }
          return Response.json({ ok: true });
        }
        if (callbackQuery?.data?.startsWith("typing:")) {
          const msg = callbackQuery.message;
          await answerCallbackQuery(callbackQuery.id);
          if (typeof msg?.chat?.id === "number") {
            const sb = await db();
            const { data: row, error: settingsError } = await sb
              .from("typing_battle_settings")
              .select("enabled, frequency_minutes, style")
              .eq("chat_id", msg.chat.id)
              .maybeSingle();
            if (settingsError) throw settingsError;
            let s = row ?? { enabled: false, frequency_minutes: 30, style: "sinopse" };
            const action = callbackQuery.data.slice(7);
            if (action === "toggle" || action === "freq" || action === "style:sinopse" || action === "style:peitoral") {
              s = applyTypingAction(s, action);
              const { error: saveError } = await sb
                .from("typing_battle_settings")
                .upsert({ chat_id: msg.chat.id, ...s, updated_at: new Date().toISOString() });
              if (saveError) throw saveError;
            }
            const page = buildTypingPage(s, action === "style" || action.startsWith("style:"));
            await callTelegram("editMessageText", {
              chat_id: msg.chat.id,
              message_id: msg.message_id,
              text: page.text,
              parse_mode: "HTML",
              reply_markup: { inline_keyboard: page.keyboard },
            });
            if (s.enabled && action === "toggle") {
              const { dispatchTypingBattles } = await import("@/lib/telegram-typing.server");
              await dispatchTypingBattles(undefined, msg.chat.id);
            }
          }
          return Response.json({ ok: true });
        }
        if (callbackQuery?.data?.startsWith("quiz:")) {
          const cbChatId = callbackQuery.message?.chat?.id;
          if (typeof cbChatId === "number") {
            await handleQuizCallback(cbChatId, callbackQuery.id, callbackQuery.data);
          }
          return Response.json({ ok: true });
        }

        const message = update.message ?? update.edited_message;
        const chatId = message?.chat?.id;
        const photoId: string | undefined = Array.isArray(message?.photo)
          ? message.photo[message.photo.length - 1]?.file_id
          : undefined;
        const text: unknown = message?.text ?? (photoId ? (message?.caption ?? "") : undefined);

        if (typeof chatId !== "number" || typeof text !== "string") {
          // Stickers, photos, etc. — nothing to answer with fixed replies
          return Response.json({ ok: true, ignored: true });
        }

        const firstWord = text.trim().toLowerCase().split(/[@\s]/)[0] ?? "";

        // /add só no privado
        if (message.chat?.type === "private" && typeof message.from?.id === "number") {
          if (await handleAddFlow(chatId, message.from.id, text, firstWord, photoId)) {
            return Response.json({ ok: true });
          }
        }

        // /settings (e /ajuda) abre o menu com botões
        if (["/settings", "/ajuda", "/help"].includes(firstWord)) {
          const page = buildSettingsPage("menu");
          await sendTelegramMessage(chatId, page.text, page.keyboard);
          return Response.json({ ok: true });
        }

        // /quiz inicia o jogo
        // Economia persistente: saldo por usuário, daily renova todo dia à meia-noite (horário de Brasília).
        // A dona (OWNER_ID) não tem limite diário, para testes.
        if (firstWord === "/daily") {
          const userId = message.from?.id;
          if (typeof userId !== "number") {
            await sendTelegramMessage(chatId, "Não consegui identificar sua conta do Telegram. Tente novamente.");
            return Response.json({ ok: true });
          }
          const username = typeof message.from?.username === "string" ? message.from.username : null;
          const amount = rollDailyAmount();
          const rows = await callGensRpc<
            { ok: boolean; balance: number; next_daily_at: string; is_first: boolean }[]
          >("claim_telegram_daily", {
            p_user_id: userId,
            p_username: username,
            p_amount: amount,
            p_ignore_limit: userId === OWNER_ID,
          });
          if (!rows?.[0]) {
            await sendTelegramMessage(chatId, "Não consegui acessar o sistema de Gems agora. Tente novamente em instantes.");
            return Response.json({ ok: true });
          }
          const result = rows[0];
          if (result.ok) {
            await sendTelegramMessage(
              chatId,
              result.is_first ? DAILY_FIRST_MESSAGE : buildDailyMessage(amount),
            );
          } else {
            const remaining = Math.max(0, new Date(result.next_daily_at).getTime() - Date.now());
            await sendTelegramMessage(chatId, `🌷 Você já resgatou seu daily de hoje!\nA próxima recompensa chega à meia-noite, em <b>${formatRemaining(remaining)}</b>.\n\nSeu saldo: <b>${result.balance} Gems</b>.`);
          }
          return Response.json({ ok: true });
        }

        if (firstWord === "/gens" || firstWord === "/gems") {
          const userId = message.from?.id;
          if (typeof userId !== "number") {
            await sendTelegramMessage(chatId, "Não consegui identificar sua conta do Telegram. Tente novamente.");
            return Response.json({ ok: true });
          }
          const username = typeof message.from?.username === "string" ? message.from.username : null;
          const rows = await callGensRpc<{ balance: number; next_daily_at: string | null }[]>(
            "get_telegram_gens",
            { p_user_id: userId, p_username: username },
          );
          if (!rows?.[0]) {
            await sendTelegramMessage(chatId, "Não consegui acessar o sistema de Gems agora. Tente novamente em instantes.");
            return Response.json({ ok: true });
          }
          const result = rows[0];
          const remaining = result.next_daily_at ? new Date(result.next_daily_at).getTime() - Date.now() : 0;
          const dailyText = remaining > 0
            ? `Seu próximo daily chega à ${formatRemaining(remaining)}.`
            : "Seu próximo daily já está disponível! Use /daily.";
          await sendTelegramMessage(chatId, `⟡  . <tg-emoji emoji-id="5221936025772789058">💎</tg-emoji>  Você tem ${result.balance} Gems.\n\n${dailyText}`);
          return Response.json({ ok: true });
        }

        if (firstWord === "/topgame" || firstWord === "/ranking") {
          const { buildGroupRanking } = await import("@/lib/telegram-typing.server");
          await sendTelegramMessage(chatId, await buildGroupRanking(firstWord === "/topgame" ? "typing" : "games", chatId));
          return Response.json({ ok: true });
        }

        if (firstWord === "/quiz") {
          const first = buildQuestionMessage(0, 0);
          await sendTelegramMessage(
            chatId,
            `🎮 <b>Vamos jogar!</b> São ${QUIZ_QUESTIONS.length} perguntas. Toque na resposta certa:\n\n${first.text}`,
            first.keyboard,
          );
          return Response.json({ ok: true });
        }

        // /game_sinopse inicia o jogo de adivinhar pela sinopse
        if (firstWord === "/game_sinopse") {
          // Envia a imagem com a introdução na legenda e espera 10 segundos antes de começar o jogo
          await sendTelegramPhoto(chatId, SINOPSE_IMAGE_URL, SINOPSE_INTRO_MESSAGE);
          await new Promise((resolve) => setTimeout(resolve, 10_000));
          wrongGuessers.delete(chatId);
          await loadExtraRounds();
          const game = newGame();
          if (game.order.length === 0) {
            await sendTelegramMessage(chatId, "Ainda não há rodadas cadastradas.");
          } else await postSinopseRound(chatId, game);
          return Response.json({ ok: true });
        }

        // /game_peitoral: mesmo jogo, com rodadas próprias
        if (firstWord === "/game_peitoral") {
          await sendTelegramPhoto(chatId, PEITORAL_IMAGE_URL, PEITORAL_INTRO_MESSAGE);
          await new Promise((resolve) => setTimeout(resolve, 10_000));
          wrongGuessers.delete(chatId);
          const game = newGame(Math.random, toRounds(await loadRounds("peitoral")), "peitoral");
          if (game.order.length === 0) {
            await sendTelegramMessage(chatId, "Ainda não há rodadas cadastradas.");
          } else await postSinopseRound(chatId, game);
          return Response.json({ ok: true });
        }

        // Jogos novos com imagem: mesmas regras do peitoral
        const imageGame = ({ "/game_pixel": "pixel", "/game_capa": "capa", "/game_cabelo": "cabelo", "/game_olho": "olho" } as const)[firstWord as "/game_pixel"];
        if (imageGame) {
          await sendTelegramMessage(chatId, IMAGE_GAME_INTROS[imageGame]);
          await new Promise((resolve) => setTimeout(resolve, 10_000));
          wrongGuessers.delete(chatId);
          const game = newGame(Math.random, toRounds(await loadRounds(imageGame)), imageGame);
          if (game.order.length === 0) {
            await sendTelegramMessage(chatId, "Ainda não há rodadas cadastradas.");
          } else await postSinopseRound(chatId, game);
          return Response.json({ ok: true });
        }

        // /game_emoji: adivinhar a obra pela sequência de emojis
        if (firstWord === "/game_emoji") {
          await sendTelegramMessage(chatId, EMOJI_INTRO_MESSAGE);
          await new Promise((resolve) => setTimeout(resolve, 10_000));
          wrongGuessers.delete(chatId);
          const game = newGame(Math.random, toRounds(await loadRounds("emoji")), "emoji");
          if (game.order.length === 0) {
            await sendTelegramMessage(chatId, "Ainda não há rodadas cadastradas.");
          } else await postSinopseRound(chatId, game);
          return Response.json({ ok: true });
        }

        // /pular_rodada e /parar_sinopse controlam o jogo ativo
        if (firstWord === "/pular_rodada" || firstWord === "/parar_sinopse") {
          const active = activeGames.get(chatId);
          if (!active) {
            await sendTelegramMessage(chatId, "Nenhum /game_sinopse ativo neste chat.");
          } else if (firstWord === "/parar_sinopse") {
            await finishSinopse(chatId, active);
          } else {
            const r = skipRound(active);
            if (r.finished) await finishSinopse(chatId, r.state);
            else await postSinopseRound(chatId, r.state);
          }
          return Response.json({ ok: true });
        }

        // Mensagem normal: se houver jogo ativo, é um palpite (erros ficam em silêncio)
        if (photoId && !message.text) return Response.json({ ok: true, ignored: true });
        if (!text.trim().startsWith("/")) {
          const { handleTypingGuess, typingTransport } = await import("@/lib/telegram-typing.server");
          if (await handleTypingGuess(update, typingTransport)) {
            return Response.json({ ok: true });
          }
          const active = activeGames.get(chatId);
          if (active) {
            const round = currentRound(active);
            if (round.id) {
              const { data: saved, error } = await (await db()).from("sinopse_rounds").select("id,synopsis,answer,photo_file_id").eq("id", round.id).maybeSingle();
              if (error) throw error;
              if (!saved) {
                const next = skipRound(active);
                if (next.finished) await finishSinopse(chatId, next.state);
                else await postSinopseRound(chatId, next.state);
                return Response.json({ ok: true });
              }
              const refreshed = toRounds([saved])[0];
              if (refreshed) Object.assign(round, refreshed, { photo: saved.photo_file_id ?? undefined });
            }
            const from = message.from;
            if (!from || from.is_bot) return Response.json({ ok: true });
            const name =
              [from.first_name, from.last_name].filter(Boolean).join(" ") ||
              from.username ||
              "Participante";
            const user = {
              id: from.id,
              name,
              ...(from.username ? { username: from.username } : {}),
            };
            const r = applyGuess(active, user, text);
            if (!r.correct) {
              const list = wrongGuessers.get(chatId) ?? [];
              if (!list.some((u) => u.id === user.id)) list.push(user);
              wrongGuessers.set(chatId, list);
              return Response.json({ ok: true });
            }
            // Avança já, para um segundo acerto simultâneo não contar de novo
            if (r.finished) activeGames.delete(chatId);
            else activeGames.set(chatId, r.state);
            const { addGamePoints } = await import("@/lib/telegram-typing.server");
            await addGamePoints(chatId, user);
            await sendTelegramMessage(chatId, buildCorrectMessage(name, r.display));
            if (r.finished) await finishSinopse(chatId, r.state);
            else await postSinopseRound(chatId, r.state);
            return Response.json({ ok: true });
          }
        }

        // /start always gets the welcome message
        const answer = firstWord === "/start" ? WELCOME_MESSAGE : findReply(text);

        if (answer !== null) await sendTelegramMessage(chatId, answer);

        // Always 200 so Telegram doesn't retry the same update forever
        return Response.json({ ok: true });
      },
    },
  },
});
