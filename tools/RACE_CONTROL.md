# Race Control setup (Cloudflare)

The Race Control board keeps its incident log, unit status and radio log in a small database on the same Cloudflare Worker that runs the weather refresh (`gpt100-refresh`). It's locked with the medical password, so the public app can't read it, and nothing about incidents goes into the GitHub repository.

Setup takes about 10 minutes, all in the Cloudflare dashboard.

## 1. Update the Worker code

1. In Cloudflare, go to **Workers & Pages**, then **gpt100-refresh**, then **Edit code**.
2. Delete everything in the editor and paste in the whole of the latest [`refresh-worker.js`](refresh-worker.js) from this folder. It still does the weather refresh, and now Race Control too.
3. Click **Deploy**.

## 2. Create the database

1. Go to **Storage & Databases**, then **D1 SQL Database**, then **Create**.
2. **Name:** `gpt100-race-control`. Leave the location as automatic, then **Create**.

You don't need to set up any tables. The Worker creates them the first time Race Control is used.

## 3. Connect the database to the Worker

1. Go to **Workers & Pages**, then **gpt100-refresh**, then **Settings**, then **Bindings**, then **Add binding**, then **D1 database**.
2. **Variable name:** `DB` (capital letters, exactly). **D1 database:** `gpt100-race-control`.
3. Click **Add binding**, then **Deploy** if it asks.

## 4. Add the password

1. Still in the Worker, go to **Settings**, then **Variables and Secrets**, then **Add**.
2. **Type:** Secret. **Variable name:** `RC_PASSWORD`. **Value:** the medical password, exactly as people type it in the Medical tab.
3. Click **Deploy** (or **Save**).

## 5. Check it

Open the app on a device where the Medical tab is unlocked, go to **Control**, and check the top right shows a green **Live**.

- **"Race Control isn't set up on the Worker yet"** means the `DB` binding or the `RC_PASSWORD` secret is missing.
- **"Wrong password"** means `RC_PASSWORD` doesn't match the medical password.

## When the medical password changes

Update `RC_PASSWORD` in the Worker to the new password at the same time, so devices keep syncing.

## After the event

- **Export** on the board downloads every incident and the full radio log as a spreadsheet (CSV), for the incident report.
- To clear the log before the next event, open the `gpt100-race-control` database in Cloudflare, go to **Console**, and run:

  ```
  DELETE FROM incidents; DELETE FROM units; DELETE FROM log;
  ```

  Export first.
