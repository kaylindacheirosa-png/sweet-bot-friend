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
  SINOPSE_ROUNDS,
  buildSinopseRound,
  parseSinopseState,
  evaluateSinopse,
  buildSinopseFinal,
} from "@/lib/telegram-sinopse.server";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";
const SINOPSE_IMAGE_URL = "https://i.imgur.com/WSx9VxL.jpeg";

// Mensagem de introdução do /game_sinopse (com emoji premium)
const SINOPSE_INTRO_MESSAGE =
  `𖼥﹒<tg-emoji emoji-id="5444896024445352143">💋</tg-emoji>﹒⦙⦙𑊁᷼ <tg-emoji emoji-id="5003645910681388672">💋</tg-emoji>OGO DA <tg-emoji emoji-id="5003544549453202818">📎</tg-emoji>INOPSE <tg-emoji emoji-id="4981007597625673295">🙃</tg-emoji> ゙౿\n\n＞ <tg-emoji emoji-id="5447328517828148260">💬</tg-emoji>﹒Neste jogo, iremos mandar sinopses de determinadas obras de boys love. Sua missão será identificar corretamente de qual obra estamos falando. . ⢷⌒𑁯\n\n﹒﹒<tg-emoji emoji-id="5429392313493242588">💗</tg-emoji>﹑<tg-emoji emoji-id="5413656137436270977">💜</tg-emoji>oa <tg-emoji emoji-id="5411517200773186685">💌</tg-emoji>orte﹗﹒<tg-emoji emoji-id="5445068445907449682">🍀</tg-emoji>`;

function deriveWebhookSecret(telegramApiKey: string): string {
  return createHash("sha256")
    .update(`telegram-webhook:${telegramApiKey}`)
    .digest("base64url");
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
): Promise<void> {
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
  }
}

async function sendTelegramPhoto(chatId: number, photoUrl: string, caption?: string): Promise<void> {
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
      form.append("photo", new Blob([await img.arrayBuffer()], { type: "image/jpeg" }), "imagem.jpg");
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
    await sendTelegramMessage(
      chatId,
      `${result.text}\n\n${buildFinalMessage(result.newScore)}`,
    );
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

async function callGensRpc<T>(rpcName: string, payload: Record<string, unknown>): Promise<T | null> {
  const supabaseUrl = process.env["GENS_SUPABASE_URL"] ?? process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"];
  const serviceKey = process.env["GENS_SUPABASE_SERVICE_ROLE_KEY"] ?? process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? process.env["SUPABASE_SERVICE_KEY"];
  if (!supabaseUrl || !serviceKey) {
    console.error("Gens commands require SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
    return null;
  }

  const response = await fetch(`${supabaseUrl.replace(/\\/$/, "")}/rest/v1/rpc/${rpcName}`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    console.error(`Supabase ${rpcName} failed [${response.status}]: ${await response.text()}`);
    return null;
  }
  return await response.json() as T;
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

        // Economia persistente: cada usuário tem seu próprio saldo e cooldown de 24h.
        if (firstWord === "/daily") {
          const userId = message.from?.id;
          if (typeof userId !== "number") {
            await sendTelegramMessage(chatId, "Não consegui identificar sua conta do Telegram. Tente novamente.");
            return Response.json({ ok: true });
          }
          const username = typeof message.from?.username === "string" ? message.from.username : null;
          const rows = await callGensRpc<{ ok: boolean; balance: number; next_daily_at: string }[]>(
            "claim_telegram_daily",
            { p_user_id: userId, p_username: username },
          );
          if (!rows?.[0]) {
            await sendTelegramMessage(chatId, "Não consegui acessar o sistema de Gens agora. A configuração do banco precisa ser concluída.");
            return Response.json({ ok: true });
          }
          const result = rows[0];
          if (result.ok) {
            await sendTelegramMessage(chatId, `💎 Parabéns! Você recebeu <b>200 Gens</b> no daily!\n\nSeu saldo agora é: <b>${result.balance} Gens</b>. Volte daqui a 24 horas para receber novamente. 💗`);
          } else {
            const remaining = Math.max(0, new Date(result.next_daily_at).getTime() - Date.now());
            await sendTelegramMessage(chatId, `🌷 Você já resgatou seu daily!\nVocê poderá receber mais 200 Gens em <b>${formatRemaining(remaining)}</b>.\n\nSeu saldo: <b>${result.balance} Gens</b>.`);
          }
          return Response.json({ ok: true });
        }

        if (firstWord === "/gens") {
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
            await sendTelegramMessage(chatId, "Não consegui acessar o sistema de Gens agora. A configuração do banco precisa ser concluída.");
            return Response.json({ ok: true });
          }
          const result = rows[0];
          const remaining = result.next_daily_at ? new Date(result.next_daily_at).getTime() - Date.now() : 0;
          const dailyText = remaining > 0
            ? `Daily disponível em ${formatRemaining(remaining)}.`
            : "Seu daily de 200 Gens está disponível! Use /daily.";
          await sendTelegramMessage(chatId, `💎 <b>Seu saldo de Gens</b>\n\nVocê tem <b>${result.balance} Gens</b>.\n${dailyText}`);
          return Response.json({ ok: true });
        }

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
          await sendTelegramMessage(
            chatId,
            buildSinopseRound(0, 0),
            undefined,
            true,
          );
          return Response.json({ ok: true });
        }

        // Resposta do usuário a uma rodada do game_sinopse
        const sinopseState = parseSinopseState(message.reply_to_message?.text);
        if (sinopseState && message.reply_to_message?.from?.is_bot) {
          const r = evaluateSinopse(sinopseState.roundIndex, sinopseState.score, text);
          if (r.isLast) {
            await sendTelegramMessage(chatId, `${r.feedback}\n\n${buildSinopseFinal(r.newScore)}`);
          } else {
            await sendTelegramMessage(
              chatId,
              `${r.feedback}\n\n${buildSinopseRound(sinopseState.roundIndex + 1, r.newScore)}`,
              undefined,
              true,
            );
          }
          return Response.json({ ok: true });
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
