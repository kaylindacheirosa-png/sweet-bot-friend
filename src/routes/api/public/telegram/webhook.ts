import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "crypto";
import { findReply, WELCOME_MESSAGE } from "@/lib/telegram-responses.server";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";

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

async function sendTelegramMessage(chatId: number, text: string): Promise<void> {
  const response = await fetch(`${GATEWAY_URL}/sendMessage`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env["LOVABLE_API_KEY"]}`,
      "X-Connection-Api-Key": process.env["TELEGRAM_API_KEY"] ?? "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`Telegram sendMessage failed [${response.status}]: ${errorBody}`);
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

        let update: any;
        try {
          update = await request.json();
        } catch {
          return Response.json({ ok: true, ignored: true });
        }

        const message = update.message ?? update.edited_message;
        const chatId = message?.chat?.id;
        const text = message?.text;

        if (typeof chatId !== "number" || typeof text !== "string") {
          // Stickers, photos, etc. — nothing to answer with fixed replies
          return Response.json({ ok: true, ignored: true });
        }

        const isCommand = text.trim().startsWith("/");
        const reply = isCommand || text.trim() !== ""
          ? findReply(text)
          : WELCOME_MESSAGE;

        // /start always gets the welcome message
        const firstWord = text.trim().toLowerCase().split("@")[0];
        const answer = firstWord === "/start" ? WELCOME_MESSAGE : reply;

        await sendTelegramMessage(chatId, answer);

        // Always 200 so Telegram doesn't retry the same update forever
        return Response.json({ ok: true });
      },
    },
  },
});
