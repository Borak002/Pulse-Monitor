# PulseWatch — Uptime Monitor

A real-time uptime and downtime monitoring dashboard for websites, APIs, servers, and databases.

## Files

```
pulsewatch/
├── index.html   ← HTML structure
├── style.css    ← All styles (light + dark mode)
├── app.js       ← App logic & state
└── README.md    ← This file
```

## Hosting options

### Option 1 — Open locally (no server needed)
Just double-click `index.html` in your file manager. It opens directly in your browser.

### Option 2 — GitHub Pages (free, public URL)
1. Create a new repository on https://github.com
2. Upload all four files
3. Go to **Settings → Pages → Source → Deploy from branch → main**
4. Your site will be live at `https://<your-username>.github.io/<repo-name>`

### Option 3 — Netlify (free, instant deploy)
1. Go to https://netlify.com and sign up free
2. Drag the entire `pulsewatch/` folder onto the Netlify dashboard
3. You get a live URL like `https://random-name.netlify.app` instantly
4. Optionally connect a custom domain in Settings

### Option 4 — Vercel (free, fast CDN)
1. Install Vercel CLI: `npm install -g vercel`
2. From inside the `pulsewatch/` folder run: `vercel`
3. Follow the prompts — your site is live in seconds

### Option 5 — Cloudflare Pages (free, fast)
1. Go to https://pages.cloudflare.com
2. Connect your GitHub repo or drag-and-drop the folder
3. No build command needed — it's all static files

### Option 6 — Any static web host / VPS
Upload the four files to any web server's public root (e.g. `/var/www/html/pulsewatch/`)
and point your domain at it. No backend required.

---

## Making checks real

This demo uses simulated data. To wire up real HTTP checks you have two paths:

### A) Serverless function (recommended for a quick start)
Add a Netlify or Vercel function that pings your URLs and writes results to a JSON file or small database (e.g. PlanetScale, Supabase, or even a GitHub Gist).

### B) Node.js backend
```bash
npm install express node-fetch
```
Create a `server.js` that polls each URL on an interval and exposes a `/api/status` endpoint.
Replace the `monitors` array in `app.js` with a `fetch('/api/status')` call on load and on refresh.

---

## Customising monitors
Edit the `monitors` array at the top of `app.js` to add your real services:

```js
{ id: 9, name: "My API", url: "https://myapi.com/health", type: "api", status: "up", uptime: 99.9, responseMs: 120, history: genHistory(0.01) },
```
