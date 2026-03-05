import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const urlParam = request.nextUrl.searchParams.get("url");

  if (!urlParam || urlParam.trim() === "") {
    console.error("epub-proxy: url parameter missing");
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  console.log("epub-proxy: fetching", urlParam);

  let targetUrl: URL;
  try {
    targetUrl = new URL(urlParam);
  } catch (err) {
    console.error("epub-proxy: invalid URL", urlParam, err);
    return NextResponse.json({ error: "Invalid url", detail: String(err) }, { status: 400 });
  }

  try {
    const res = await fetch(targetUrl.toString(), {
      headers: {
        Accept: "application/epub+zip,*/*",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
    });
    console.log("epub-proxy: response status:", res.status, "content-type:", res.headers.get("content-type"));

    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      console.error("epub-proxy: upstream error", res.status, errorText.slice(0, 200));
      return NextResponse.json(
        { error: `Upstream returned ${res.status}`, detail: errorText.slice(0, 500) },
        { status: res.status }
      );
    }

    const arrayBuffer = await res.arrayBuffer();
    console.log("epub-proxy: received arrayBuffer size:", arrayBuffer.byteLength);
    
    if (arrayBuffer.byteLength < 100_000) {
      console.error("epub-proxy: file too small", arrayBuffer.byteLength, "bytes");
      return NextResponse.json(
        { error: "유효하지 않은 EPUB 파일", detail: `File size: ${arrayBuffer.byteLength} bytes (minimum 100KB required)` },
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
    console.error("epub-proxy: fetch exception", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Fetch failed", detail: String(e) },
      { status: 502 }
    );
  }
}
