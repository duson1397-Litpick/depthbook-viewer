import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const urlParam = request.nextUrl.searchParams.get("url");

  if (!urlParam || urlParam.trim() === "") {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  let targetUrl: URL;
  try {
    targetUrl = new URL(urlParam);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  try {
    const res = await fetch(targetUrl.toString(), {
      headers: {
        Accept: "application/epub+zip,*/*",
        "User-Agent": "Mozilla/5.0",
      },
    });
    console.log("proxy response status:", res.status);

    if (!res.ok) {
      return NextResponse.json(
        { error: `Upstream returned ${res.status}` },
        { status: res.status }
      );
    }

    const arrayBuffer = await res.arrayBuffer();
    if (arrayBuffer.byteLength < 100_000) {
      return NextResponse.json(
        { error: "유효하지 않은 EPUB 파일" },
        { status: 500 }
      );
    }
    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/epub+zip",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Fetch failed" },
      { status: 502 }
    );
  }
}
