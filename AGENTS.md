<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Parse slash-separated answer alternatives in the shared Telegram game logic so both saved game types use the same exact-match rules.
- Unknown fixed-response messages return null; the webhook sends only recognized replies to keep ordinary chat messages silent.
- Encode independent Typing Battle selections in the existing style text field, including both and none; opening the style menu must never write settings.
- Automatic Typing Battle uses a managed authenticated scheduled route and persisted per-chat rounds with atomic prepare/winner RPCs; never rely on webhook process memory for scheduled games.
- Character economy lives in a dedicated server-only handler invoked after Telegram signature verification; service-role-only atomic RPCs serialize mutations and store update-based receipts to prevent duplicate spending and refunds.
- Character rank and current price are derived from wishes and purchase counts; refund credit follows the character through trades so divorce returns its recorded purchase value exactly once.
- Persist character onboarding and trade sessions in the database; never accept ownership, recipient identity or prices from callback payloads without checking stored records.
- Owner content management runs after Telegram signature verification; persist sent-message targets and prompt-bound sessions, and serialize confirmed deletion and edits with the economy lock to preserve refunds and reject stale callbacks.
