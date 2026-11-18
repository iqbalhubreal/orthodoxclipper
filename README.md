# The Orthodox Muslim Clip Maker

A simple timestamp-driven clip maker. Upload a video, paste timestamp ranges with notes, and the app asks Gemini to create a caption and two topical hashtags for each selected moment. `#TheOrthodoxMuslim` is always added as the first hashtag. Video processing happens locally in the browser.

## Deploy on Cloudflare Pages

1. Upload this project to a Git repository and connect it to Cloudflare Pages, or deploy it with Wrangler. Use Node.js 22 or newer for the local build tools.
2. Set the build output directory to `public`.
3. Add `GEMINI_API_KEY` as a Cloudflare Pages secret (Project configuration → Environment variables → Add a secret). Do not put the key in `index.htm`.
4. Install dependencies and build the FFmpeg browser modules:
   - `npm install`
   - `npm run build`
5. Deploy the project. The Pages Functions endpoint at `/api/highlights` handles Gemini requests.

For a local preview, run `npm run dev` after setting `GEMINI_API_KEY` in your Cloudflare/Wrangler environment.

## Timestamp note format

Use one range per clip, then explain why it is worth clipping:

```text
00:12 - 00:48 | A strong explanation of the main point.
01:04 - 01:39 | A sharp response that makes the argument clear.
02:10 - 02:52 | A quiz moment with a surprising answer.
```

Use `H:MM:SS` for videos longer than one hour. Clip boundaries are taken from the supplied ranges without adding extra time. The video is not uploaded to Gemini; the AI only receives the timestamps and notes.
