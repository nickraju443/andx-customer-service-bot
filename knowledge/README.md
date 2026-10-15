# knowledge/ — extra brain for the ANDX support bot

Every `.md` or `.txt` file in this folder is loaded when the bot starts and appended to the
model's system prompt, after the built-in ANDX knowledge base in `app.py`.

How to add a deck, FAQ or policy:

1. Save it here as plain text or markdown (`competition.md`, `prizes-usf.md`, ...).
   PDFs and PowerPoints are not read — paste their text into a `.md` file.
2. Write facts the way a support agent would say them. Short "Q:" / answer pairs work best.
   Put anything unconfirmed as "contact support@andx.ai" rather than a promise.
3. Do not include internal notes, secrets or anything students must not see — the whole
   file is visible to the model and can be quoted back to users.
4. Commit, push, and redeploy (`gcloud run deploy andx-bot --source . --region us-central1
   --allow-unauthenticated --project andx-support-bot`). Changes show up after the deploy.

Files named `README*` or starting with `_` are ignored. Keep the folder under ~60,000
characters in total so the prompt stays fast and cheap (Claude Haiku, prompt-cached).

The live website snapshot is NOT stored here — `site_scan.py` fetches andx.global,
rwa.andx.global and bot.andx.ai every few hours and feeds a digest into the prompt
automatically. Check `GET /api/site-scan` for its status.
