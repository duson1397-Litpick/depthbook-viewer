import { NextRequest, NextResponse } from "next/server";

const BUBBLE_API_URL = process.env.BUBBLE_API_URL;
const BUBBLE_API_TOKEN = process.env.BUBBLE_API_TOKEN;

export type SubmitFeedbackResponse = { ok: true } | { ok: false };

export async function POST(request: NextRequest): Promise<NextResponse<SubmitFeedbackResponse>> {
  if (!BUBBLE_API_URL || !BUBBLE_API_TOKEN) {
    return NextResponse.json({ ok: false } satisfies SubmitFeedbackResponse);
  }

  try {
    const body = await request.json();
    const { token, satisfaction, one_liner, good_points, improvement_points } = body;

    const res = await fetch(`${BUBBLE_API_URL}/submit_feedback`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${BUBBLE_API_TOKEN}`,
      },
      body: JSON.stringify({
        token,
        satisfaction,
        one_liner,
        good_points,
        improvement_points,
      }),
    });

    if (!res.ok) {
      return NextResponse.json({ ok: false } satisfies SubmitFeedbackResponse);
    }

    return NextResponse.json({ ok: true } satisfies SubmitFeedbackResponse);
  } catch {
    return NextResponse.json({ ok: false } satisfies SubmitFeedbackResponse);
  }
}
