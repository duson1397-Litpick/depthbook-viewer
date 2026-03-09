import { NextRequest, NextResponse } from "next/server";

const BUBBLE_API_URL = process.env.BUBBLE_API_URL;
const BUBBLE_API_TOKEN = process.env.BUBBLE_API_TOKEN;

export type VerifyEmailResponse =
  | { ok: "yes" }
  | { ok: "no"; reason: "invalid_token" | "email_mismatch" };

export async function POST(request: NextRequest): Promise<NextResponse<VerifyEmailResponse>> {
  if (!BUBBLE_API_URL || !BUBBLE_API_TOKEN) {
    return NextResponse.json({ ok: "no", reason: "invalid_token" } satisfies VerifyEmailResponse);
  }

  try {
    const body = await request.json();
    const { token, email } = body;

    if (!token || !email) {
      return NextResponse.json({ ok: "no", reason: "invalid_token" } satisfies VerifyEmailResponse);
    }

    const res = await fetch(`${BUBBLE_API_URL}/verify_email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${BUBBLE_API_TOKEN}`,
      },
      body: JSON.stringify({ token, email }),
    });
    //
    console.log("bubble status:", res.status);
    console.log("bubble url:", `${BUBBLE_API_URL}/verify_email`);
    
    if (!res.ok) {
      const errText = await res.text(); //
      console.error("bubble error body:", errText);
      return NextResponse.json({ ok: "no", reason: "invalid_token" } satisfies VerifyEmailResponse);
    }

    const data = await res.json();
    console.log("verify_email response:", JSON.stringify(data));

    const d = data.response ?? data;
    
    if (d.ok === "yes") {
      return NextResponse.json({ ok: "yes" } satisfies VerifyEmailResponse);
    } else {
      return NextResponse.json({
        ok: "no",
        reason: d.reason === "email_mismatch" ? "email_mismatch" : "invalid_token",
      } satisfies VerifyEmailResponse);
    }
  } catch (err) {
    console.error("verify_email error:", err);
    return NextResponse.json({ ok: "no", reason: "invalid_token" } satisfies VerifyEmailResponse);
  }
}
