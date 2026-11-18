import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FILTERS = new Set(["magic", "bw", "grayscale", "original"]);
const CATEGORIES = new Set(["ID Cards", "Invoices", "Notes"]);
const MAX_BODY_BYTES = 8 * 1024;

type ScanPayload = {
  pageCount?: unknown;
  filterUsed?: unknown;
  category?: unknown;
  sessionId?: unknown;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return jsonError("Content-Type must be application/json", 415);
  }

  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    return jsonError("Cross-origin requests are not allowed", 403);
  }
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return jsonError("Cross-site requests are not allowed", 403);
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_BODY_BYTES) {
    return jsonError("Metadata payload is too large", 413);
  }

  let body: ScanPayload;
  try {
    body = (await request.json()) as ScanPayload;
  } catch {
    return jsonError("Invalid JSON payload", 400);
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonError("A JSON object is required", 400);
  }

  // Explicit allow-list: images, PDFs, OCR text and arbitrary fields are never accepted.
  const allowedKeys = new Set(["pageCount", "filterUsed", "category", "sessionId"]);
  if (Object.keys(body).some((key) => !allowedKeys.has(key))) {
    return jsonError("Only scan metadata fields are accepted", 400);
  }

  const pageCount = body.pageCount;
  if (typeof pageCount !== "number" || !Number.isInteger(pageCount) || pageCount < 1 || pageCount > 250) {
    return jsonError("pageCount must be an integer between 1 and 250", 400);
  }

  const filterUsed = typeof body.filterUsed === "string" ? body.filterUsed : "original";
  const category = typeof body.category === "string" ? body.category : "Notes";
  if (!FILTERS.has(filterUsed)) return jsonError("Unsupported filterUsed value", 400);
  if (!CATEGORIES.has(category)) return jsonError("Unsupported category value", 400);

  const suppliedSession = typeof body.sessionId === "string" ? body.sessionId : "";
  const sessionId = /^[a-zA-Z0-9_-]{8,100}$/.test(suppliedSession)
    ? suppliedSession
    : crypto.randomUUID();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return jsonError("Metadata storage is not configured", 503);

  // Never persist the user's original filename: it may contain personal information.
  const event = {
    sessionId,
    fileName: "Scanned_Doc.pdf",
    pageCount,
    filterUsed,
    category,
  };

  try {
    const sql = neon(databaseUrl);
    await sql`
      INSERT INTO scan_events (session_id, file_name, page_count, filter_used, category)
      VALUES (${event.sessionId}, ${event.fileName}, ${event.pageCount}, ${event.filterUsed}, ${event.category})
    `;
  } catch (error) {
    console.error("SnapDoc metadata insert failed:", error);
    return jsonError("Metadata could not be saved. Please retry later.", 503);
  }

  let automation: "triggered" | "failed" | "not_configured" = "not_configured";
  const webhookUrl = process.env.ACTIVEPIECES_WEBHOOK_URL;
  if (webhookUrl) {
    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "document.scanned", ...event }),
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });
      automation = response.ok ? "triggered" : "failed";
      if (!response.ok) console.error("SnapDoc automation webhook returned:", response.status);
    } catch (error) {
      automation = "failed";
      console.error("SnapDoc automation webhook failed:", error);
    }
  }

  return NextResponse.json({ ok: true, outcomes: { database: "saved", automation } }, { status: 201 });
}
