# Live data setup (beginner-friendly)

This connects the dashboard to the real bridge Sheet. **Everything here is free.**

You end up with **your own private web address** (like `https://agent-bridge.<your-name>.workers.dev`) that asks for your email and a one-time code before showing anything. The public GitHub Pages site stays on demo data.

```
You ──login──▶ Cloudflare Access ──▶ Worker (dashboard + API) ──read-only──▶ bridge Google Sheet
```

Total time: about 25 minutes. There are three parts, and you only do the clicking. Whenever a step says **"tell Claude"**, paste what it asks for into the chat.

> **Never paste the key file's contents into chat, email or GitHub.** Part 2 shows how to hand it straight to Cloudflare.

---

## Part 1: Google, so the Worker can *read* the Sheet (about 10 min)

You'll create a "robot" Google account (a *service account*) that can only **view** the Sheet.

1. Go to **https://console.cloud.google.com** and sign in with the Google account that owns the bridge Sheet.
   - If it asks you to agree to terms, agree. **No billing account or card is needed.**
2. **Create a project.** Click the project picker at the top left (it may say *Select a project*), then **New project**. Name it `agent-bridge` and click **Create**. Make sure it's selected in the picker afterwards.
3. **Turn on two APIs.** In the search bar at the top, search for **Google Sheets API**, open it and click **Enable**. Then do the same for **Google Drive API**. Drive is only used to read the Sheet's "last changed" time.
4. **Create the service account.** Search for **Service Accounts** and open it (it's under *IAM & Admin*). Then:
   1. Click **+ Create service account**.
   2. Name it `bridge-reader`, then click **Create and continue**.
   3. Skip *Grant this service account access* and *Grant users access*: click **Continue**, then **Done**.
5. **Download its key.** Click the new `bridge-reader` account, open the **Keys** tab, then **Add key → Create new key → JSON → Create**. A `.json` file downloads.
   - Treat this file like a password. Leave it in **Downloads** for now.
   - If Google says key creation is disabled by an organisation policy, **tell Claude**.
6. **Copy the robot's email.** On the service account's **Details** tab, copy the email ending in `…iam.gserviceaccount.com`.
7. **Share the Sheet with it as Viewer.** Then:
   1. Open the bridge Sheet and click **Share**.
   2. Paste that email, and set the role to **Viewer** (not Editor).
   3. Untick **Notify people**, then click **Share**.
   - If it warns that the address is outside your organisation, that's fine.

✅ Part 1 done. **Tell Claude: "Google done"**, plus the file name of the downloaded key (just the name, not its contents).

---

## Part 2: Cloudflare, which hosts it privately (about 10 min)

1. Go to **https://dash.cloudflare.com/sign-up** and create a free account with your email. Verify the email.
   - You don't need a domain name. Skip any "add a site/domain" prompts.
2. **Log Wrangler in.** Wrangler is Cloudflare's command-line tool. Claude will ask you to run this one command:
   ```bash
   npx wrangler login
   ```
   A browser tab opens; click **Allow**. Then **tell Claude: "logged in"**.
3. **Claude deploys the Worker and sets the Sheet ID.** You don't need to do anything for this step.
4. **Hand over the key file.** Claude will give you a command like the one below, already filled in with your file name. Run it yourself, so the key goes straight to Cloudflare and never through the chat:
   ```bash
   npx wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON --config worker/wrangler.jsonc < "C:/Users/<you>/Downloads/<key-file>.json"
   ```
   When it says *Success*, **delete the key file from Downloads**. You can always make a new one in Google Cloud.

---

## Part 3: The login gate (Cloudflare Access) (about 5 min)

Until this is done, the Worker refuses to show any data. That's deliberate.

1. In the Cloudflare dashboard, go to **Workers & Pages** and click **agent-bridge**.
2. Open **Settings → Domains & Routes**. Next to the **workers.dev** row, click the **⋯** menu (or the row itself) and choose **Enable Cloudflare Access**.
   - The first time, Cloudflare asks you to set up **Zero Trust**:
     - Choose a **team name** (anything, e.g. `josh-bridge`).
     - Pick the **Free** plan, which is free for up to 50 users.
     - Cloudflare may ask for a card to activate even the free plan. You won't be charged on the Free plan, but it's your call.
     - Then return to the Worker and click **Enable Cloudflare Access** again.
   - If you can't find this option, **tell Claude**. There's an alternative route through *Zero Trust → Access → Applications*.
3. A box shows **two values**. Copy both and **tell Claude**. These are identifiers, not passwords:
   - The **Audience (AUD) tag**, a long string of letters and numbers.
   - The **JWKS URL** or **team domain**, which looks like `https://<team>.cloudflareaccess.com/...`.
4. Click **Manage Cloudflare Access** (or open *Zero Trust → Access → Applications → agent-bridge*):
   1. Edit the policy so **Include → Emails** lists **only your email address**.
   2. Save.
5. Claude sets those values as secrets and redeploys.
6. Open your private address, `https://agent-bridge.<your-subdomain>.workers.dev`:
   1. Enter your email.
   2. Type the code Cloudflare emails you.
   3. The dashboard loads with **no DEMO badge**, showing your real bridge.

🎉 Done.

---

## Afterwards

- **Updating the private dashboard** after code changes: `npm run worker:deploy` (Claude can do this).
- **Data freshness:** the Worker re-reads the Sheet at most once a minute. *Refresh* in the dashboard re-reads, and never writes.
- **Turning it off:**
  - To stop it reading the Sheet, remove `bridge-reader` from the Sheet's Share list.
  - To shut down the private site, delete the Worker in Cloudflare.
- **Costs:** Workers Free (100,000 requests/day), Zero Trust Free (≤ 50 users) and the Google Sheets/Drive APIs at this usage are all $0.

## What this does *not* do

- It never edits the Sheet, Apps Script, Gmail or any agent automation. The Google permission is read-only, and the robot account is only a Viewer.
- It has no approve/send buttons. The Approvals page stays a read-only list.
- Nothing about the real Sheet (ID, contents, your email) goes into this public repo. Those values live only as Cloudflare secrets.
