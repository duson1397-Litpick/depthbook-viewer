import { NextRequest, NextResponse } from "next/server";

const BUBBLE_API_URL = process.env.BUBBLE_API_URL;
const BUBBLE_API_TOKEN = process.env.BUBBLE_API_TOKEN;

export type VerifyResponse =
  | {
      ok: true;
      title: string;
      epub_path: string;
      sequence_number: number;
      status: string;
    }
  | { ok: false };

export async function GET(request: NextRequest): Promise<NextResponse<VerifyResponse>> {
  const token = request.nextUrl.searchParams.get("token");

  if (!token || token.trim() === "") {
    return NextResponse.json({ ok: false } satisfies VerifyResponse);
  }

  if (!BUBBLE_API_URL || !BUBBLE_API_TOKEN) {
    return NextResponse.json({ ok: false } satisfies VerifyResponse);
  }

  try {
    const res = await fetch(`${BUBBLE_API_URL}/get_invitation`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${BUBBLE_API_TOKEN}`,
      },
      body: JSON.stringify({ token }),
    });

    if (!res.ok) {
      return NextResponse.json({ ok: false } satisfies VerifyResponse);
    }

    const data = await res.json();
    console.log("Bubble response:", JSON.stringify(data));
    const d = data.response ?? data;
    if (!d || typeof d.campaign_title === "undefined") {
      return NextResponse.json({ ok: false } satisfies VerifyResponse);
    }

    return NextResponse.json({
      ok: true,
      title: d.campaign_title ?? "",
      epub_path: d.epub_path === "temp" 
        ? "https://www.gutenberg.org/cache/epub/1342/pg1342.epub" 
        : (d.epub_path ?? ""),
      sequence_number: d.sequence_number ?? 0,
      status: d.status ?? "",
    } satisfies VerifyResponse);
  } catch {
    return NextResponse.json({ ok: false } satisfies VerifyResponse);
  }
}
