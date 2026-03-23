# Skyview

A minimal, cinematic flight tracker. Live radar via OpenSky Network, enriched flight data via Aviationstack.

## Stack

- React + Vite
- react-leaflet (CartoDB dark tiles)
- OpenSky Network API (free, no key required)
- Aviationstack API (free tier, 500 req/month — optional)

---

## Local development

```bash
npm install
npm run dev
```

Open http://localhost:5173

---

## Deploy to Vercel (CLI)

1. Install Vercel CLI if you haven't:
   ```bash
   npm i -g vercel
   ```

2. From the project root:
   ```bash
   vercel
   ```

3. Follow the prompts:
   - Set up and deploy: **Y**
   - Which scope: your personal account
   - Link to existing project: **N**
   - Project name: `skyview` (or whatever you want)
   - Directory: `./` (current)
   - Override build settings: **N**

4. Vercel auto-detects Vite. It will build and give you a live URL.

5. For production deploy:
   ```bash
   vercel --prod
   ```

---

## Deploy via GitHub + Vercel (alternative)

1. Push this repo to GitHub
2. Go to vercel.com → New Project → Import from GitHub
3. Select the repo, Vercel auto-detects Vite config
4. Deploy

---

## API Key

Your Aviationstack key is saved in `localStorage` under `av_key`.
It persists across sessions on the same browser — no backend needed.

Get a free key at: https://aviationstack.com/signup/free
- 500 requests/month free
- No credit card required

---

## Notes

- OpenSky refreshes every 30 seconds, filtered to current map view
- Aviationstack is called only on click (on-demand enrichment)
- Arc lines use a built-in airport coordinate lookup table (~100 major airports)
- The key field is in the top-right — paste once and it persists
