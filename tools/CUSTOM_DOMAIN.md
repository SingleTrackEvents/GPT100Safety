# Moving the apps to app.gpt100.com.au

app.gpt100.com.au opens the runner app. The staff app stays at app.gpt100.com.au/index.html and the field app at
app.gpt100.com.au/field.html. Old singletrackevents.github.io/GPT100Safety links redirect automatically.

Do the steps in this order. Switching the domain on in GitHub before the DNS record works takes every app offline.

1. **DNS (Crazy Domains, which runs gpt100.com.au's DNS).** Add a record:
   type `CNAME`, host `app`, value `singletrackevents.github.io` (TTL 1 hour is fine).
   The main website (Squarespace) isn't affected.
2. **Check it** (a few minutes to a few hours): https://dns.google/resolve?name=app.gpt100.com.au&type=CNAME
   should show `singletrackevents.github.io.`
3. **GitHub:** repository Settings > Pages > Custom domain: `app.gpt100.com.au`, Save. When the certificate is
   ready (up to an hour), tick **Enforce HTTPS**.
4. **Cloudflare Worker** (weather refresh and Race Control): deploy the current `tools/refresh-worker.js`, which
   accepts both addresses. If the Worker has an `ALLOWED_ORIGIN` variable set, add `,https://app.gpt100.com.au` to it.
5. **what3words:** in the what3words dashboard, add `app.gpt100.com.au` to the key's allowed sites.

Phones treat the new address as a new site: anyone who installed an app or saved the map before the move does it
once more from the new address (the old home screen icon redirects, but the saved map stays with the old one).
