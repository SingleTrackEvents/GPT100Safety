# Weather refresh relay (Cloudflare Worker)

This lets anyone using the app press **Refresh now** in the Weather tab, and keeps the weather watch running every 15 minutes, without your GitHub key ever being in the app or on anyone's phone.

The key lives only as a locked secret in your Cloudflare account. The app asks the Worker for a refresh, and the Worker starts the GitHub weather watch.

Safety built in:

- It only starts a run if none is running and none started in the last 10 minutes. A full refresh, with fresh forecast models, happens at most every 30 minutes.
- It only accepts refresh requests from the GPT100 Safety site.
- The key can only run and read this repository's weather watch, and you can cancel it on GitHub at any time.

Setup takes about 15 minutes.

## 1. Create the GitHub key

1. On GitHub, go to your profile picture, then **Settings**, then **Developer settings**, then **Personal access tokens**, then **Fine-grained tokens**, then **Generate new token**.
2. **Token name:** GPT100 weather refresh. **Expiration:** after the event, for example 31 December 2026.
3. **Repository access:** choose **Only select repositories**, then pick **SingleTrackEvents/GPT100Safety**.
4. **Permissions:** under Repository permissions, set **Actions** to **Read and write**. Leave everything else as it is.
5. Click **Generate token** and copy it. Keep it private. You'll paste it into Cloudflare in step 3 and nowhere else.

## 2. Create the Worker

1. Sign up for free at [dash.cloudflare.com](https://dash.cloudflare.com/sign-up).
2. Go to **Workers & Pages**, then **Create**, then **Create Worker** (start from "Hello World").
3. Name it `gpt100-refresh` and click **Deploy**.
4. Click **Edit code**. Delete everything in the editor, then paste in the whole of [`refresh-worker.js`](refresh-worker.js) from this folder.
5. Click **Deploy**.

## 3. Add the key as a secret

1. In the Worker, go to **Settings**, then **Variables and Secrets**, then **Add**.
2. **Type:** Secret. **Variable name:** `GITHUB_TOKEN`. **Value:** paste the GitHub key.
3. Click **Deploy** (or **Save**).

## 4. Turn on the 15-minute timer

1. In the Worker, go to **Settings**, then **Trigger Events** (or **Triggers**), then **Add**, then **Cron Triggers**.
2. Choose **Every 15 minutes**, or type `*/15 * * * *`.
3. Click **Add** (or **Save**).

## 5. Check it and send the address

1. The Worker's address is shown at the top, for example `https://gpt100-refresh.yourname.workers.dev`.
2. Open `https://gpt100-refresh.yourname.workers.dev/status` in your browser. It should show the latest weather watch run. An error means the secret isn't set or the key is missing the Actions permission.
3. Send the address (not the key) to whoever looks after the app. It goes in `data/config.js` as `refreshUrl`, and then the **Refresh now** button appears for everyone.

## Changing or cancelling

- **New key:** generate it on GitHub, then replace the `GITHUB_TOKEN` secret in Cloudflare. Nothing changes in the app.
- **Stop everything:** delete the key on GitHub, or delete the Worker in Cloudflare. The app's button then shows that refreshing isn't available, and the GitHub timer carries on as before.
