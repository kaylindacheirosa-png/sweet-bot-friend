import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Bot do Telegram" },
      { name: "description", content: "Bot de respostas automáticas para o Telegram." },
      { property: "og:title", content: "Bot do Telegram" },
      { property: "og:description", content: "Bot de respostas automáticas para o Telegram." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-4xl">
          🤖
        </div>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight text-foreground">
          Bot do Telegram
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Seu bot está configurado e respondendo mensagens com respostas fixas.
        </p>
        <div className="mt-6 space-y-2 text-left text-sm text-muted-foreground">
          <p className="rounded-lg bg-muted px-4 py-3">
            ✅ Conectado ao Telegram
          </p>
          <p className="rounded-lg bg-muted px-4 py-3">
            ✅ Respostas automáticas ativas
          </p>
          <p className="rounded-lg bg-muted px-4 py-3">
            ✅ Webhook registrado
          </p>
        </div>
      </div>
    </div>
  );
}
