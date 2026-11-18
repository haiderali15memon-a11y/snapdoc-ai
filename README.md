# SnapDoc AI

A mobile-first, no-login document scanner built with Next.js.

## Privacy model

- Camera captures and gallery imports stay in the browser.
- Scan history is stored locally in the browser.
- OCR runs on-device in the browser using Tesseract.js.
- PDF merge and PDF export run locally.
- The backend receives only scan metadata (file name, page count, filter, category, and session ID). It never accepts document images, PDF bytes, or OCR text.

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
