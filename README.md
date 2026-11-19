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
- **Stopwatch**: while cutting, the app shows a stopwatch that restarts for every clip, and each finished clip shows how long it took.
- **Caption editing**: tap a caption to reveal **Edit**, change the caption and hashtags, then **Save**. **Rewrite caption** asks the AI again. Everything downloads as one `.zip` (with `captions.txt`).
- **History** (button in the header): every finished run is saved in this browser only, with the YouTube link, your pasted notes and the captions (never the video). Delete one entry or all of them. If a link was saved, **Play** opens that moment inside the app from the original YouTube video. **Use these notes again** restores the link and notes.
- **Videos with no length information** (some screen recordings and phone files): the app asks the browser to work out the length, and if that fails it still cuts, skipping only the "clip is past the end" check.
- If the AI is slow or unreachable (45 seconds), clips are still cut and the captions fall back to your own notes.
- The page is marked `translate="no"` so browsers do not offer to translate it.
- Cancel button, screen stays awake while working, and the video is mounted rather than copied into memory.

## On phones

Short, small H.264 MP4 files work. Long or very large videos (a few hundred MB and up) can run the browser out of memory; use a computer for those. HEVC (H.265) iPhone videos may fail: export as H.264.

## Notes

- `public/_headers` sets `Referrer-Policy: strict-origin-when-cross-origin`. YouTube embeds refuse to play when the page sends no referrer, so keep this header if you change the file.
