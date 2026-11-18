# SnapDoc AI

A mobile-first, no-login document scanner built with Next.js.

## Privacy model

- Camera captures and gallery imports stay in the browser.
- Scan history is stored locally in the browser.
- OCR runs on-device in the browser using Tesseract.js.
- PDF merge and PDF export run locally.
- The backend receives only scan metadata (file name, page count, filter, category, and session ID). It never accepts document images, PDF bytes, or OCR text.

## Phase 2 scanner improvements

- High-resolution camera capture (device-supported 4K preference, continuous focus where available), multi-page reorder/rotate/remove, automatic contrast-edge crop, manual crop, straighten, and undo/redo history.
- English + Urdu OCR across all captured pages, processed in the browser.
- A4 and US Letter PDF output with aspect-ratio-preserving page fitting and lossless PNG embedding to avoid the prior JPEG export blur; local PDF merging.
- Local enhancement presets, including a tile-adaptive black-and-white cleanup filter.
- Camera tracks are stopped when the scanner component unmounts.
- The Phase 2 preview deployment uses an isolated Neon `phase-2` branch; production is not modified by preview testing.

## Metadata API

- `POST /api/v1/supersnap/process` is the versioned metadata endpoint.
- `POST /api/log-scan` remains as a compatibility route.
- The API accepts only page count, filter, category, and an optional session identifier.
- It rejects unknown payload fields, cross-origin requests, invalid values, and oversized JSON bodies.
- The original filename is deliberately not stored. Images, PDFs, and OCR text never enter the API.

**Still requiring further validation:** automatic four-corner perspective correction (deskewing angled page corners) is not yet implemented; current auto-crop estimates a rectangular document boundary from image contrast/edges. Camera resolution and focus depend on device/browser hardware. Test on multiple real phones before treating scan quality as production-ready.

## Local development

```bash
npm install
npm run dev
```

## Neon metadata database

1. Create a Neon PostgreSQL project.
2. Run `database/neon-schema.sql` in the Neon SQL Editor.
3. Add the Neon connection string as the `DATABASE_URL` environment variable in Vercel (Production, Preview, and Development).
4. Keep the connection string server-side; never expose it with a `NEXT_PUBLIC_` prefix.

The app works without Neon configured. Metadata logging will report `not_configured` until `DATABASE_URL` is added.

## Activepieces

Optional: configure `ACTIVEPIECES_WEBHOOK_URL` in Vercel to receive metadata-only `document.scanned` events.
