# Goodnight Book Generator — Little Tails Co.

A browser-only tool for fulfilling Etsy orders. Pick a character, type the kid's name, click generate, get a print-ready 8×8" PDF. Works on any device with a browser. No backend, no install, no data leaves your device.

Two modes:

- **Library mode** — pick one of the 12 stock characters. The 156 pre-rendered scenes are baked into the repo.
- **Custom mode** — for paid custom-character orders. Generate the 13 scenes for that order in Leonardo, drag the JPGs into the upload slots, type the name, generate. Custom images stay in your browser; nothing is uploaded anywhere.

---

## What's in this folder

```
goodnight-generator/
├── index.html              # the page
├── app.js                  # PDF engine
├── style.css               # brand styling
├── config.json             # script + page mappings (edit here to tweak text)
├── README.md               # this file
└── assets/
    ├── characters/         # 12 char folders × 13 JPGs each = 156 images
    │   ├── boy_01/
    │   ├── boy_02/
    │   └── ... girl_06/
    ├── backgrounds/        # bg09 + bg12 (used on couplet pages 9 and 12)
    └── fonts/              # empty — drop custom TTFs here later if upgrading typography
```

---

## Getting it live on GitHub Pages — step by step

You will end up with a URL like `https://YOUR-USERNAME.github.io/goodnight-generator/` that you can bookmark on any device and use from anywhere.

### 1. Make a GitHub account (if you don't have one)

Go to <https://github.com/signup>. Free account is fine.

### 2. Create a new repository

Once signed in, click the `+` icon top-right → **New repository**.

- **Repository name:** `goodnight-generator` (or whatever you want — your URL uses this name)
- **Public** (required for free GitHub Pages — see Privacy section below if you want it private)
- Leave everything else default
- Click **Create repository**

### 3. Upload all the files

On the new empty repo page, click the link **uploading an existing file** (or use the "Add file" → "Upload files" dropdown).

- Drag the **entire contents** of this folder (not the folder itself — open it and select everything inside) into the upload zone. That includes `index.html`, `app.js`, `style.css`, `config.json`, `README.md`, and the whole `assets/` folder.
- GitHub uploads in batches. The character images total ~143 MB; expect 5–15 minutes depending on your connection.
- When all files are listed, scroll down, type a commit message like "initial upload", and click **Commit changes**.

### 4. Enable GitHub Pages

- Go to your repo's **Settings** tab (top-right of the repo page).
- Left sidebar → **Pages**.
- Under "Build and deployment" → **Source**, select **Deploy from a branch**.
- Branch: **main** / Folder: **/ (root)**. Click **Save**.
- Wait 1–3 minutes. Refresh the Pages settings page; it will show a green box with your live URL.

### 5. Bookmark and test

Open the URL on your laptop and your phone. You should see the brand header and the 12 character grid loaded. Pick any character, type a name, click **Generate Book PDF**, and confirm the PDF downloads correctly.

---

## Per-order workflow

### Standard library order (boy_01 – girl_06)

1. Open the bookmark.
2. Click the character thumbnail.
3. Type the child's name.
4. Click **Generate Book PDF**.
5. PDF downloads (~5 seconds). Save it.
6. For digital orders → email/Etsy-message to customer.
7. For hardcover orders → upload to Gelato.

### Custom-character order

1. Log into Leonardo.ai. Use the existing prompt pack with the customer's reference photo as `init_image`.
2. Generate all 13 scenes for that custom character (cover + s1–s8, s10, s11, s13, s14). ~20 minutes total.
3. Download all 13 JPGs to whatever device you're on.
4. Open the bookmark → click **Custom mode**.
5. Drop each JPG into its labeled scene slot.
6. Type the child's name.
7. Click **Generate Book PDF**.
8. Send to customer / Gelato as above.

---

## Editing the script or text

Open `config.json`. You'll see the 14 couplets with `{NAME}` placeholders. Edit text directly, commit the change, and GitHub Pages will redeploy in 1–2 minutes.

The `{NAME}` token is auto-replaced at generation time and rendered in yellow bold. Anywhere else stays in navy serif.

---

## Privacy: public repo vs. private

GitHub Pages on the free plan **requires a public repo**. That means the source code (the HTML, JS, config) and the character images are all publicly accessible to anyone who finds the URL — though the URL itself isn't broadcast anywhere, so casual discovery is unlikely.

If you want a private repo (so competitors can't fork it):

- **Easiest:** Upgrade to GitHub Pro ($4/month). Private repos can use Pages.
- **Free alternative:** Connect the private repo to **Cloudflare Pages** (cloudflare.com/pages) instead. It deploys from a private GitHub repo on the free tier, gives you a custom URL, and runs basically the same as GitHub Pages.

For launch, public is fine. Move to private later if needed.

---

## Print-spec validation for Gelato

Before shipping a hardcover order, run the generated PDF through Gelato's preflight checker once. Things to confirm:

- **Trim size:** 8×8" (page size in PDF should be 576 × 576 pt).
- **Page count:** 32 pages total — 1 cover + 1 title + 1 dedication + 28 spread pages + 1 back cover.
- **Colors:** RGB (Gelato auto-converts to CMYK for press; spot-check a test print).
- **Bleed:** v1 outputs at trim size with no bleed. If Gelato rejects, see the "adding bleed" section below.

**Test print:** Order one copy of a real generated PDF to your own address. Check binding, color, image sharpness. Adjust if needed before shipping to a real customer.

### Adding bleed (if Gelato requires it)

Edit `app.js`. At the top, change:

```js
const PAGE = 576;
```

to (for 0.125" / 3.175 mm bleed):

```js
const PAGE = 594;            // 8.25" with bleed
const BLEED = 9;              // bleed in points (0.125")
```

…and offset all draw calls by `BLEED`. (Or ask Claude to do this — it's a mechanical change once you know Gelato's exact requirement.)

---

## Troubleshooting

**The page loads but the character grid is empty.**
Check the browser dev console (F12). You'll likely see a 404 on `config.json` or an asset path. Make sure all files are at the repo root, not nested in a subfolder.

**Generate button shows "Image not found".**
A character folder is missing files, or filenames don't match what's in `config.json`. Open `assets/characters/boy_01/` and confirm all 13 JPGs are present and named exactly as in the config (case-sensitive).

**Custom mode says "Missing scenes."**
You need all 13 scene slots filled before generating. Drop into each one.

**The PDF generates but text looks off.**
Open the PDF in Acrobat (not just Preview/Quick Look — those sometimes mis-render embedded fonts). If still off, the issue is likely in `config.json` text or `app.js` positioning — tell Claude what you see and what's wrong.

**Repo upload fails on GitHub.**
GitHub's web upload caps at 100 individual files per upload batch. For 156 character images plus other files, you may need to upload in 2–3 batches. Or use **GitHub Desktop** (desktop app) which uploads everything in one go.

---

## Costs

- **GitHub free tier:** $0
- **Bandwidth:** GitHub Pages allows 100 GB/month — you'd need to serve thousands of PDFs to hit it
- **Gelato hardcover:** unchanged from your current cost
- **Custom character tier:** Leonardo token cost (~$1–2 per custom character set) + your time

Total recurring tooling cost stays at $0 for v1.
