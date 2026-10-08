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
  parseSinopseState,
  applyGuess,
  skipRound,
  buildCorrectMessage,
  buildSinopseFinal,
  mergeParticipants,
  type SinopseState,
} from "@/lib/telegram-sinopse.server";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";
const SINOPSE_IMAGE_URL = "https://i.imgur.com/WSx9VxL.jpeg";

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

// Evita que dois acertos simultâneos contem duas vezes a mesma rodada (melhor esforço, por instância).
const handledRounds = new Set<string>();
// Participantes que erraram (melhor esforço, em memória) — entram no placar final com 0 pontos.
const roundParticipants = new Map<string, { id: number; name: string; username?: string }[]>();
function withParticipants(chatId: number, pinnedId: number, state: SinopseState): SinopseState {
  const key = `${chatId}:${pinnedId}`;
  const list = roundParticipants.get(key) ?? [];
  roundParticipants.delete(key);
  return mergeParticipants(state, list);
}

/** Lê o jogo ativo a partir da mensagem da rodada fixada no chat. */
async function getActiveSinopse(
  chatId: number,
): Promise<{ state: SinopseState; pinnedId: number } | null> {
  const chat = await callTelegram("getChat", { chat_id: chatId });
  const pinned = chat?.pinned_message;
  if (!pinned?.from?.is_bot) return null;
  const state = parseSinopseState(pinned.text, pinned.entities);
  return state ? { state, pinnedId: pinned.message_id } : null;
}

/** Manda a rodada e fixa a mensagem (ela guarda rodada e placar). */
async function postSinopseRound(chatId: number, state: SinopseState, prefix = ""): Promise<void> {
  const id = await sendTelegramMessage(chatId, prefix + buildSinopseRound(state));
  if (id)
    await callTelegram("pinChatMessage", {
      chat_id: chatId,
      message_id: id,
      disable_notification: true,
    });
}

async function finishSinopse(
  chatId: number,
  pinnedId: number,
  state: SinopseState,
  prefix = "",
): Promise<void> {
  await callTelegram("unpinChatMessage", { chat_id: chatId, message_id: pinnedId });
  await sendTelegramMessage(chatId, prefix + buildSinopseFinal(state.players));
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
          await postSinopseRound(chatId, { roundIndex: 0, players: [] });
          return Response.json({ ok: true });
        }

        // /pular_rodada e /parar_sinopse controlam o jogo ativo
        if (firstWord === "/pular_rodada" || firstWord === "/parar_sinopse") {
          const active = await getActiveSinopse(chatId);
          if (!active) {
            await sendTelegramMessage(chatId, "Nenhum /game_sinopse ativo neste chat.");
          } else if (firstWord === "/parar_sinopse") {
            await finishSinopse(
              chatId,
              active.pinnedId,
              withParticipants(chatId, active.pinnedId, active.state),
            );
          } else {
            const r = skipRound(withParticipants(chatId, active.pinnedId, active.state));
            if (r.finished)
              await finishSinopse(chatId, active.pinnedId, r.state, "⏭️ Rodada pulada.\n\n");
            else await postSinopseRound(chatId, r.state, "⏭️ Rodada pulada.\n\n");
          }
          return Response.json({ ok: true });
        }

        // Mensagem normal no chat: se houver rodada ativa, é um palpite (sem precisar responder à mensagem)
        if (!text.trim().startsWith("/")) {
          const active = await getActiveSinopse(chatId);
          if (active) {
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
            const key = `${chatId}:${active.pinnedId}`;
            const r = applyGuess(active.state, user, text);
            if (!r.correct) {
              // erro: nenhuma saída; só lembra o participante para o placar final
              const list = roundParticipants.get(key) ?? [];
              if (!list.some((u) => u.id === user.id)) list.push(user);
              roundParticipants.set(key, list);
              return Response.json({ ok: true });
            }
            if (handledRounds.has(key)) return Response.json({ ok: true });
            handledRounds.add(key);
            const others = roundParticipants.get(key) ?? [];
            roundParticipants.delete(key);
            r.state = mergeParticipants(r.state, others);
            const prefix = `${buildCorrectMessage(name, r.display)}\n\n`;
            if (r.finished) await finishSinopse(chatId, active.pinnedId, r.state, prefix);
            else await postSinopseRound(chatId, r.state, prefix);
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
