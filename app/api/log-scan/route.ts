import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

export const runtime = "nodejs";

type ScanEvent = {
  fileName?: string;
  pageCount?: number;
  filterUsed?: string;
  category?: string;
  sessionId?: string;
};

export async function POST(request: NextRequest) {
  let body: ScanEvent;
  try {
    body = (await request.json()) as ScanEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const pageCount = Number(body.pageCount ?? 1);
  if (!Number.isInteger(pageCount) || pageCount < 1 || pageCount > 250) {
    return NextResponse.json({ error: "pageCount must be between 1 and 250" }, { status: 400 });
  }

  // Only non-document metadata is accepted. No images, PDFs, OCR text, or file bytes.
  const event = {
    sessionId: String(body.sessionId || crypto.randomUUID()).slice(0, 100),
    fileName: String(body.fileName || "Scanned_Doc.pdf").slice(0, 255),
    pageCount,
    filterUsed: String(body.filterUsed || "original").slice(0, 50),
    category: String(body.category || "Notes").slice(0, 50),
  };

  const outcomes: { database?: string; automation?: string } = {};
  const databaseUrl = process.env.DATABASE_URL;
  const webhookUrl = process.env.ACTIVEPIECES_WEBHOOK_URL;

  if (databaseUrl) {
    try {
      const sql = neon(databaseUrl);
      await sql`
        INSERT INTO scan_events (session_id, file_name, page_count, filter_used, category)
        VALUES (${event.sessionId}, ${event.fileName}, ${event.pageCount}, ${event.filterUsed}, ${event.category})
      `;
      outcomes.database = "saved";
    } catch (error) {
      outcomes.database = "failed";
      console.error("Neon scan metadata insert failed:", error);
    }
  } else {
    outcomes.database = "not_configured";
  }

  if (webhookUrl) {
    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "document.scanned", ...event }),
        cache: "no-store",
      });
      outcomes.automation = response.ok ? "triggered" : "failed";
      if (!response.ok) console.error("Activepieces webhook failed:", response.status);
    } catch (error) {
      outcomes.automation = "failed";
      console.error("Activepieces webhook error:", error);
    }
  } else {
    outcomes.automation = "not_configured";
  }

  return NextResponse.json({ ok: true, outcomes }, { status: 200 });
}
