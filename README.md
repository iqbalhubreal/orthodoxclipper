# The Orthodox Muslim Clip Maker

A timestamp-driven clip maker. Upload a video, paste timestamp ranges with notes, and the app asks Gemini for a caption and two topical hashtags per clip (`#TheOrthodoxMuslim` is always first). Video is cut locally in the browser; only your notes are sent to the AI.

## Deploy on Cloudflare Pages

1. Push this project to a Git repository and connect it to Cloudflare Pages (or use `npm run deploy` with Wrangler). Use Node.js 22+.
2. Build settings: **Build command `npm run build`**, **output directory `public`**. The build step is required: it copies the FFmpeg browser modules into `public/vendor`, which is not committed.
3. Add two secrets (Settings → Variables and Secrets):
   - `GEMINI_API_KEY`: your Gemini key.
   - `APP_PASSWORD`: a password for the app. **Required**; without it the API refuses all requests, so nobody can use your Gemini quota.
4. Deploy. The function at `/api/highlights` handles Gemini requests.

Local preview: put both secrets in a `.dev.vars` file (`GEMINI_API_KEY=...` and `APP_PASSWORD=...`), then run `npm install` and `npm run dev`.

Model names live in `wrangler.toml` (`GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL`); check them against Google's current model list. Allowed names are in `ALLOWED_MODELS` in `functions/api/highlights.js`.

## How it works (also shown inside the app)

1. Paste the YouTube link into the app, copy the generated prompt, and paste it into Gemini (chat or agent mode). It returns iconic moments (3 minutes or shorter) with timestamps and the reason for each.
2. Upload the same video in the app and paste Gemini's answer. The app recognizes each clip live (bold text, bullets, numbering and `[00:12 - 00:48]` styles all work) and flags problems such as overlaps, clips beyond the video's end, or clips over your chosen limit.
3. Press the button. Each clip is cut on your device, with a caption and hashtags you can edit, copy, or download as a zip.

## Timestamp note format

One range per line, then why it is worth clipping:

```text
00:12 - 00:48 | A strong explanation of the main point.
01:04 - 01:39 | A sharp response that makes the argument clear.
02:10 - 02:52 | A quiz moment with a surprising answer.
```

Use `H:MM:SS` for videos over an hour. Times inside a note are ignored as long as each range starts its own line. Notes are saved in your browser.

## Options and features

- **2-second padding**: every clip is cut 2 seconds before and after your timestamps (limited to the start and end of the video).
- **Fast mode (default)**: no re-encoding, so clips are ready in seconds and use little memory. Clips may start a little early (nearest keyframe).
- **Accurate mode**: re-encodes and cuts at the exact frame. It runs in single-threaded WebAssembly, so expect several times the clip length (slower still on phones). Use it only when Fast starts a clip too early.
- **Make vertical (optional, after cutting)**: for two people side by side. Click Make vertical on a clip and place a **Top** box and a **Bottom** box over the two people. Each box is a free rectangle: drag inside it to move, drag any edge or corner dot to change its width and height separately. The small preview shows the exact result. **Fill** crops a box's edges so it fills its half of the video; **Fit** keeps the whole box and adds black bars. The result is a stacked 9:16 video for Shorts/Reels/TikTok. Use Apply to all clips to reuse the same boxes for every clip, or Make all vertical at the top of the results. Vertical versions are included in the zip. On phones the editor opens full screen with large touch handles and the action buttons pinned to the bottom.
- **Collapsible steps**: the three steps (Get timestamps, Upload, Paste answer) each fold away when you tap their header, and tap again to bring them back. Step 1 starts folded since you only need it once; steps 2 and 3 start open. A folded step still shows its status (the green tick, the file name, "2 clips"). The cutting mode and the **Create clips** button sit below step 3, so they stay visible when it is folded. Pressing Create with no video opens step 2 for you, and "Use these notes again" in History opens step 3.
- **Light / dark mode**: dark by default; the round button in the header toggles between **Dark** and **Light**. The choice is saved in this browser only, applied before the page paints (no flash), and the phone's browser bar colour follows it. All colours are variables at the top of `public/css/styles.css`: the dark values in `:root`, the light ones in `:root[data-theme="light"]`.
- **Speaker-following 2.5D glow (Debate Stage)**: with the stage on, Glow set to *Auto (follow speaker)* and **Detect speaker** ticked, making a vertical video first watches the clip (muted, faster than real time), finds each face inside its crop box with MediaPipe Face Landmarker, and measures how much each mouth moves. That is combined with the audio loudness to pick who is talking, with smoothing so the glow never flickers. The active card rises toward the viewer (bigger, lifted, deeper shadow, accent glow, bright top rim) while the other dims. It needs 2 or more boxes, adds some time per clip, and is off by default on phones. If it fails it falls back to the simple pulse; pick *Top speaker* / *Bottom speaker* to set it by hand. The face model (about 4 MB) and its engine load from jsDelivr and Google storage on first use and are then cached. Code: `public/js/speaker.js`, rendering in `public/js/stage.js`.
- **Play / pause preview** (Vertical Maker and Vertical Editor): a Play button under the slider plays the clip with its real audio level driving the waveform and glow, and a speaker icon turns the preview sound on or off. With speaker detection on, the first Play analyses the clip once (shown on the button); the result is kept and reused when you export, until you move the boxes. Code: `public/js/preview.js`.
- **Templates** (Vertical Maker): **Save current** stores your crop boxes, layout, Fill/Fit and the whole 2.5D stage preset under a name (up to 20, in this browser only); **Apply** restores them in one tap for any video. Per-clip text is not saved. A warning appears if the video has a different shape. Code: `public/js/templates.js`.
- **IG Hook Zone guide**: a dashed amber `IG HOOK ZONE` outline over the empty top area (y 0-334), next to the `IG EDITS AI SUBTITLES ZONE` guide. Preview only: it is never drawn into the exported video. Toggle it with **IG Hook Zone** in the stage options.
- **Red divider line (optional)**: in the Vertical Maker, tick **Red divider line** under *Split-screen divider* to draw a red line where the split-screen boxes meet (works for 2, 3 and 4 box layouts). Thickness is adjustable (2-16 px). It is part of the exported video and is saved with the clip's frame, so Apply to all clips reuses it. Off by default; Classic style only: hidden for a single box, 2.5D Stage and PiP. Code: `drawDividerLines` in `public/js/vertical.js`.
- **Stopwatch**: while cutting, the app shows a stopwatch that restarts for every clip, and each finished clip shows how long it took.
- **Caption editing**: tap a caption to reveal **Edit**, change the caption and hashtags, then **Save**. **Rewrite caption** asks the AI again. Everything downloads as one `.zip` (with `captions.txt`).
- **History** (button in the header): every finished run is saved in this browser only, with the YouTube link, your pasted notes and the captions (never the video). Delete one entry or all of them. If a link was saved, **Play** opens that moment inside the app from the original YouTube video. **Use these notes again** restores the link and notes.
- **Videos with no length information** (some screen recordings and phone files): the app asks the browser to work out the length, and if that fails it still cuts, skipping only the "clip is past the end" check.
- If the AI is slow or unreachable (45 seconds), clips are still cut and the captions fall back to your own notes.
- The page is marked `translate="no"` so browsers do not offer to translate it.
- Cancel button, screen stays awake while working, and the video is mounted rather than copied into memory.

## Install as an app (PWA)

The site is an installable app with its own icon. It must be served over HTTPS (Cloudflare Pages already does this).

- **Android / Chrome / Edge / desktop**: tap the **Install app** button in the header (or the browser's install option).
- **iPhone / iPad (Safari)**: Share → **Add to Home Screen**.

Files: `public/manifest.webmanifest`, `public/sw.js` (service worker), `public/icons/*`. The service worker loads pages network-first (updates arrive normally, and the last page opens offline), caches icons, and keeps the ~31 MB video engine after its first download so later cutting starts fast and works offline once it has been used. It never touches `/api/*`, so captions always come live from the AI. Bump `VERSION` in `sw.js` when you change cached files.

## On phones

Short, small H.264 MP4 files work. Long or very large videos (a few hundred MB and up) can run the browser out of memory; use a computer for those. HEVC (H.265) iPhone videos may fail: export as H.264.

## Project layout

`public/index.html` holds only the page markup. Styles and code live in their own files:

```text
public/
  index.html            page markup + <link>/<script> tags
  css/   styles.css (base + theme colours) · editor.css (vertical editor) · history.css
  js/    config · notes · ui · steps · zip · ai · engine · results · cutting
         upload · stage · speaker · vertical · presets · editor · veditor · preview · templates · theme · pwa · app · history
  sw.js, manifest.webmanifest, icons/
```

The JS files are plain scripts loaded with `defer` in the order listed in `index.html`; they share one global scope (no imports), so keep that order. If you add a file, also add it to `PRECACHE` in `sw.js` and bump `VERSION`.

## Notes

- `public/_headers` sets `Referrer-Policy: strict-origin-when-cross-origin`. YouTube embeds refuse to play when the page sends no referrer, so keep this header if you change the file.
