import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "crypto";
import { findReply, WELCOME_MESSAGE } from "@/lib/telegram-responses.server";
import {
  QUIZ_QUESTIONS,
  buildQuestionMessage,
  buildResultMessage,
  buildFinalMessage,
} from "@/lib/telegram-quiz.server";
import {
  buildSinopseRound,
  newGame,
  applyGuess,
  skipRound,
  buildCorrectMessage,
  buildSinopseFinal,
  mergeParticipants,
  setExtraRounds,
  type SinopseState,
} from "@/lib/telegram-sinopse.server";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";
const SINOPSE_IMAGE_URL = "https://i.imgur.com/WSx9VxL.jpeg";
const OWNER_ID = 6733728637;

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function loadExtraRounds(): Promise<void> {
  const { data, error } = await (await db())
    .from("sinopse_rounds")
    .select("synopsis, answer")
    .order("created_at");
  if (error) console.error("load rounds failed", error);
  else setExtraRounds(data ?? []);
}

/** Fluxo do /add (só a dona). Retorna true se tratou a mensagem. */
async function handleAddFlow(chatId: number, userId: number, text: string, firstWord: string) {
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
    await sb.from("bot_add_sessions").upsert({ user_id: userId, step: "synopsis", synopsis: null });
    await sendTelegramMessage(chatId, "📝 Qual é a sinopse? (ou /cancelar)");
    return true;
  }
  if (text.trim().startsWith("/")) return false;
  const { data: session } = await sb
    .from("bot_add_sessions")
    .select("step, synopsis")
    .eq("user_id", userId)
    .maybeSingle();
  if (!session) return false;
  if (session.step === "synopsis") {
    await sb.from("bot_add_sessions").update({ step: "answer", synopsis: text.trim() }).eq("user_id", userId);
    await sendTelegramMessage(chatId, "✅ Sinopse anotada! Agora, qual é a resposta?");
    return true;
  }
  const { error } = await sb
    .from("sinopse_rounds")
    .insert({ synopsis: session.synopsis ?? "", answer: text.trim() });
  await sb.from("bot_add_sessions").delete().eq("user_id", userId);
  await sendTelegramMessage(
    chatId,
    error ? "⚠️ Não consegui salvar. Tente /add de novo." : "🎉 Rodada salva! Ela já entra no /game_sinopse.",
  );
  return true;
}

// Mensagem de introdução do /game_sinopse (com emoji premium)
const SINOPSE_INTRO_MESSAGE = `𖼥﹒<tg-emoji emoji-id="5444896024445352143">💋</tg-emoji>﹒⦙⦙𑊁᷼ <tg-emoji emoji-id="5003645910681388672">💋</tg-emoji>OGO DA <tg-emoji emoji-id="5003544549453202818">📎</tg-emoji>INOPSE <tg-emoji emoji-id="4981007597625673295">🙃</tg-emoji> ゙౿\n\n＞ <tg-emoji emoji-id="5447328517828148260">💬</tg-emoji>﹒Neste jogo, iremos mandar sinopses de determinadas obras de boys love. Sua missão será identificar corretamente de qual obra estamos falando. . ⢷⌒𑁯\n\n﹒﹒<tg-emoji emoji-id="5429392313493242588">💗</tg-emoji>﹑<tg-emoji emoji-id="5413656137436270977">💜</tg-emoji>oa <tg-emoji emoji-id="5411517200773186685">💌</tg-emoji>orte﹗﹒<tg-emoji emoji-id="5445068445907449682">🍀</tg-emoji>`;

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
  await sendTelegramMessage(chatId, buildSinopseRound(state));
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
): Promise<void> {
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
      if (retry.ok) return;
      console.error(`Telegram sendPhoto upload failed [${retry.status}]: ${await retry.text()}`);
    } catch (e) {
      console.error("sendPhoto upload error", e);
    }
    // Último recurso: manda só o texto
    if (caption) await sendTelegramMessage(chatId, caption);
  }
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

        // Clique em botão do quiz
        const callbackQuery = update.callback_query;
        if (callbackQuery?.data?.startsWith("quiz:")) {
          const cbChatId = callbackQuery.message?.chat?.id;
          if (typeof cbChatId === "number") {
            await handleQuizCallback(cbChatId, callbackQuery.id, callbackQuery.data);
          }
          return Response.json({ ok: true });
        }

        const message = update.message ?? update.edited_message;
        const chatId = message?.chat?.id;
        const text = message?.text;

        if (typeof chatId !== "number" || typeof text !== "string") {
          // Stickers, photos, etc. — nothing to answer with fixed replies
          return Response.json({ ok: true, ignored: true });
        }

        const firstWord = text.trim().toLowerCase().split(/[@\s]/)[0];

        // /quiz inicia o jogo
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
          const game = newGame();
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
        if (!text.trim().startsWith("/")) {
          const active = activeGames.get(chatId);
          if (active) {
            const from = message.from;
            if (!from || from.is_bot) return Response.json({ ok: true });
            const name =
              [from.first_name, from.last_name].filter(Boolean).join(" ") ||
              from.username ||
              "Participante";
            const user = { id: from.id, name, ...(from.username ? { username: from.username } : {}) };
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
            await sendTelegramMessage(chatId, buildCorrectMessage(name, r.display));
            if (r.finished) await finishSinopse(chatId, r.state);
            else await postSinopseRound(chatId, r.state);
            return Response.json({ ok: true });
          }
        }

        // /start always gets the welcome message
        const answer = firstWord === "/start" ? WELCOME_MESSAGE : findReply(text);

        await sendTelegramMessage(chatId, answer);

        // Always 200 so Telegram doesn't retry the same update forever
        return Response.json({ ok: true });
      },
    },
  },
});
