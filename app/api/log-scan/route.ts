import { NextRequest, NextResponse } from "next/server";

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

  const event = {
    session_id: (body.sessionId || crypto.randomUUID()).slice(0, 100),
    file_name: String(body.fileName || "Scanned_Doc.pdf").slice(0, 255),
    page_count: pageCount,
    filter_used: String(body.filterUsed || "original").slice(0, 50),
    category: String(body.category || "Notes").slice(0, 50),
    created_at: new Date().toISOString(),
  };

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const webhookUrl = process.env.ACTIVEPIECES_WEBHOOK_URL;
  const outcomes: { database?: string; automation?: string } = {};

  if (supabaseUrl && supabaseKey) {
    try {
      const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/scanned_documents`, {
        method: "POST",
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify(event),
        cache: "no-store",
      });
      outcomes.database = response.ok ? "saved" : "failed";
      if (!response.ok) console.error("Supabase scan log failed:", response.status, await response.text());
    } catch (error) {
      outcomes.database = "failed";
      console.error("Supabase scan log error:", error);
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
