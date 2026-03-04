import { NextRequest, NextResponse } from "next/server";

const BUBBLE_API_URL = process.env.BUBBLE_API_URL;
const BUBBLE_API_TOKEN = process.env.BUBBLE_API_TOKEN;

export type HighlightResponse = { ok: true } | { ok: false };

export async function POST(request: NextRequest): Promise<NextResponse<HighlightResponse>> {
  if (!BUBBLE_API_URL || !BUBBLE_API_TOKEN) {
    return NextResponse.json({ ok: false } satisfies HighlightResponse);
  }

  try {
    const body = await request.json();
    const { token, type, cfi_range, chapter, selected_text } = body;

    const res = await fetch(`${BUBBLE_API_URL}/upsert_highlight`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${BUBBLE_API_TOKEN}`,
      },
      body: JSON.stringify({
        token,
        type,
        cfi_range,
        chapter,
        selected_text,
      }),
    });

    if (!res.ok) {
      return NextResponse.json({ ok: false } satisfies HighlightResponse);
    }

    return NextResponse.json({ ok: true } satisfies HighlightResponse);
  } catch {
    return NextResponse.json({ ok: false } satisfies HighlightResponse);
  }
}
