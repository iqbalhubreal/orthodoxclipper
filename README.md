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
- **Fast mode (default)**: no re-encoding, near-instant.
- **Exact mode**: re-encodes and cuts precisely, but is very slow in a browser.
- **Fast mode**: no re-encoding, much faster and lighter on memory. Clips may start a little early (nearest keyframe). Default on phones.
- **Make vertical (optional, after cutting)**: for two people side by side. Click Make vertical on a clip, drag one box onto each face (top person and bottom person), and it is made into a stacked 9:16 video for Shorts/Reels/TikTok. Use Apply to all clips to reuse the same boxes for every clip, or Make all vertical at the top of the results. Vertical versions are included in the zip.
- Captions and hashtags are editable, can be rewritten per clip, and everything downloads as one `.zip` (with `captions.txt`).
- Cancel button, screen stays awake while working, and the video is mounted rather than copied into memory.

## On phones

Short, small H.264 MP4 files work. Long or very large videos (a few hundred MB and up) can run the browser out of memory; use a computer for those. HEVC (H.265) iPhone videos may fail: export as H.264.
