# Newsletter #4 — Staged for Mon May 11 08:30 CT

## Files

- `linkedin-article.md` — paste-ready LinkedIn Article body (title: "The 30-Day Window")
- `email.md` — email version with subject + preheader, lightly tightened from the LinkedIn version
- `metadata.json` — publish time, channel status, compliance checklist
- `README.md` — this file

## Manual publish steps (Mon May 11 08:30 CT)

LinkedIn does not expose an Articles publishing API in this environment, so the "set publish time" step is a manual action in the composer:

1. Open LinkedIn → Write Article
2. Title: **The 30-Day Window**
3. Subtitle (optional): "Why every founder gets the same letter from the IRS — and why most ignore it until it costs them seven figures"
4. Paste body from `linkedin-article.md` (drop the H1 — LinkedIn renders the title from the title field)
5. Click **Publish** dropdown → **Schedule** → **Mon May 11, 8:30 AM CDT**
6. Confirm

## Email channel

Skipped per spec section 2.4 unless the list is already wired. `email.md` is staged for the moment a sender (Resend, Buttondown, etc.) is connected.

## Source

- Notion draft: https://www.notion.so/35bfaf5b93148143b516fda1cbb0f207
- Source-material footer (EINs, USPS tracking) intentionally NOT included in publish versions
