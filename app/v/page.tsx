"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, Suspense } from "react";

type VerifyOk = {
  ok: true;
  title: string;
  epub_path: string;
  sequence_number: number;
  status: string;
  file_type: "epub" | "pdf";
  watermark_text: string;
  file_url?: string;
};

type VerifyFail = { ok: false };

type VerifyResponse = VerifyOk | VerifyFail;

type ViewState = "loading" | "error" | "viewer" | "email_input" | "copyright_warning";

const FONT_SCALE_STEPS = [80, 90, 100, 110, 120] as const;

type TocItem = { href?: string; label?: string; subitems?: TocItem[] };

function TocEntry({
  item,
  onSelect,
}: {
  item: TocItem;
  onSelect: (href: string) => void;
}) {
  const hasHref = item.href != null && item.href !== "";
  return (
    <div className="flex flex-col gap-0.5">
      {item.label != null && (
        <button
          type="button"
          onClick={() => hasHref && onSelect(item.href!)}
          className={`w-full rounded px-2 py-1 text-left text-sm hover:bg-neutral-100 ${hasHref ? "cursor-pointer text-neutral-800" : "cursor-default font-medium text-neutral-600"}`}
        >
          {item.label}
        </button>
      )}
      {item.subitems?.length ? (
        <div className="ml-3 flex flex-col gap-0.5 border-l border-neutral-200 pl-1">
          {item.subitems.map((sub, j) => (
            <TocEntry key={j} item={sub} onSelect={onSelect} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function VPageContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [viewState, setViewState] = useState<ViewState>("loading");
  const [verifyData, setVerifyData] = useState<VerifyOk | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [emailInput, setEmailInput] = useState("");
  const [emailError, setEmailError] = useState("");
  const [emailVerifying, setEmailVerifying] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
  const pdfDocRef = useRef<import("pdfjs-dist").PDFDocumentProxy | null>(null);
  const [pdfPageNum, setPdfPageNum] = useState(1);
  const [pdfTotalPages, setPdfTotalPages] = useState(0);
  const [pdfZoom, setPdfZoom] = useState(1);
  const epubRefRef = useRef<{ destroy: () => void } | null>(null);
  const bookRef = useRef<{ spine: { items: { length: number } }; navigation: { toc: TocItem[] } } | null>(null);
  const renditionRef = useRef<{
    themes: { fontSize: (size: string) => void };
    prev: () => void;
    next: () => void;
    display: (href: string) => void;
    addAnnotation: (cfi: string) => void;
  } | null>(null);
  const [chapterIndex, setChapterIndex] = useState(0);
  const [totalChapters, setTotalChapters] = useState(0);
  const [readingProgress, setReadingProgress] = useState(0);
  const [tocOpen, setTocOpen] = useState(false);
  const isAtEndRef = useRef(false);
  const [epubFontScale, setEpubFontScale] = useState(100);
  const [selectionPopup, setSelectionPopup] = useState<{
    left: number;
    top: number;
    cfiRange: string;
    selectedText: string;
  } | null>(null);
  const selectionPopupRef = useRef<HTMLDivElement>(null);
  const selectedCfiRef = useRef<string>("");
  const [surveyModalOpen, setSurveyModalOpen] = useState(false);
  const surveyShownRef = useRef(false);
  const [surveyForm, setSurveyForm] = useState({
    satisfaction: 0,
    one_liner: "",
    good_points: "",
    improvement_points: "",
  });

  const fetchVerify = useCallback(async () => {
    if (!token.trim()) {
      setErrorMessage("토큰이 없습니다.");
      console.error("setViewState error at:", new Error().stack);
      setViewState("error");
      return;
    }
    setViewState("loading");
    setErrorMessage("");
    try {
      const base = typeof window !== "undefined" ? window.location.origin : "";
      const res = await fetch(`${base}/api/verify?token=${encodeURIComponent(token)}`);
      const data: VerifyResponse = await res.json();
      if (!data.ok) {
        setErrorMessage("인증에 실패했습니다.");
        console.error("setViewState error at:", new Error().stack);
        setViewState("error");
        return;
      }
      setVerifyData({
        ...data,
        file_type: "epub",
        watermark_text: `리뷰어 #${data.sequence_number}`,
      });
      console.log("verifyData set:", {
        title: data.title,
        epub_path: data.epub_path,
        sequence_number: data.sequence_number,
        status: data.status,
      });
      
      // 이메일 인증 확인
      if (typeof window !== "undefined") {
        const verifiedEmail = sessionStorage.getItem("verified_email");
        if (verifiedEmail) {
          setViewState("viewer");
        } else {
          setViewState("email_input");
        }
      } else {
        setViewState("email_input");
      }
    } catch {
      setErrorMessage("인증 요청 중 오류가 발생했습니다.");
      console.error("setViewState error at:", new Error().stack);
      setViewState("error");
    }
  }, [token]);

  const handleEmailVerify = useCallback(async () => {
    const email = emailInput.trim().toLowerCase();
    if (!email) {
      setEmailError("이메일을 입력해주세요.");
      return;
    }
    
    setEmailVerifying(true);
    setEmailError("");
    
    try {
      const res = await fetch("/api/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, email }),
      });
      
      const data = await res.json();
      
      if (data.ok === "yes") {
        if (typeof window !== "undefined") {
          sessionStorage.setItem("verified_email", email);
        }
        setViewState("copyright_warning");
      } else if (data.reason === "email_mismatch") {
        setEmailError("초대받은 이메일과 일치하지 않습니다. 올바른 이메일을 입력해주세요.");
      } else {
        setEmailError("유효하지 않은 초대 링크입니다.");
      }
    } catch {
      setEmailError("이메일 인증 중 오류가 발생했습니다.");
    } finally {
      setEmailVerifying(false);
    }
  }, [token, emailInput]);

  useEffect(() => {
    fetchVerify();
  }, [fetchVerify]);

  // PDF 렌더링은 브라우저 전용이므로 useEffect 내부에서만 실행
  useEffect(() => {
    if (viewState !== "viewer" || !verifyData || !containerRef.current) return;

    if (verifyData.file_type !== "pdf") return;

    let mounted = true;
    (async () => {
      try {
        const pdfjsLib = await import("pdfjs-dist");
        if (typeof window !== "undefined" && pdfjsLib.GlobalWorkerOptions) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${(pdfjsLib as unknown as { version?: string }).version ?? "4.0.379"}/build/pdf.worker.min.mjs`;
        }
        const loadingTask = pdfjsLib.getDocument(verifyData.file_url);
        const pdfDoc = await loadingTask.promise;
        if (!mounted) return;
        pdfDocRef.current = pdfDoc;
        setPdfTotalPages(pdfDoc.numPages);
      } catch (e) {
        if (mounted) {
          setErrorMessage("PDF 로드 중 오류가 발생했습니다.");
          console.error("setViewState error at:", new Error().stack);
          setViewState("error");
        }
      }
    })();
    return () => {
      mounted = false;
      pdfDocRef.current = null;
    };
  }, [viewState, verifyData?.epub_path, verifyData?.file_type]);

  // PDF 페이지/줌 변경 시 캔버스 다시 그리기
  useEffect(() => {
    if (viewState !== "viewer" || verifyData?.file_type !== "pdf" || !pdfCanvasRef.current || !pdfDocRef.current) return;

    const canvas = pdfCanvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let cancelled = false;
    pdfDocRef.current.getPage(pdfPageNum).then((page) => {
      if (cancelled) return;
      const viewport = page.getViewport({ scale: pdfZoom });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      page.render({ canvasContext: ctx, viewport }).promise.catch(() => {});
    });
    return () => {
      cancelled = true;
    };
  }, [viewState, verifyData?.file_type, pdfPageNum, pdfZoom, pdfTotalPages]);

  // EPUB: fetch → arrayBuffer → ePub(arrayBuffer), await book.ready 후 renderTo
  useEffect(() => {
    if (viewState !== "viewer" || verifyData?.file_type !== "epub" || typeof window === "undefined") return;
    if (!containerRef.current) {
      console.log("container is null, aborting");
      return;
    }

    const epubUrl = `${window.location.origin}/api/epub-proxy?url=${encodeURIComponent(verifyData.epub_path)}`;
    console.log("epubUrl:", epubUrl, "epub_path:", verifyData.epub_path);
    let mounted = true;
    let mouseupCleanup: (() => void) | null = null;

    (async () => {
      try {
        const ePub = (await import("epubjs")).default;
        const res = await fetch(epubUrl);
        const arrayBuffer = await res.arrayBuffer();
        if (!mounted) return;
        console.log("opening book with arrayBuffer size:", arrayBuffer.byteLength);
        const book = ePub(arrayBuffer);
        await book.ready;
        if (!mounted) return;
        bookRef.current = book as unknown as { spine: { items: { length: number } }; navigation: { toc: TocItem[] } };

        const rendition = book.renderTo(document.getElementById("epub-container")!, {
          flow: "paginated",
          width: "100%",
          height: "100%",
          spread: "none",
          allowScriptedContent: true,
        });
        rendition.on("rendered", () => {
          console.log("rendered fired, iframe:", document.getElementById("epub-container")?.querySelector("iframe"));
          mouseupCleanup?.();
          const iframe = document.getElementById("epub-container")?.querySelector("iframe");
          if (iframe) {
            iframe.style.width = "100%";
          }
          const doc = iframe?.contentDocument;
          if (!doc) return;
          const onMouseUp = () => {
            const selText = iframe.contentWindow?.getSelection()?.toString();
            console.log("mouseup fired, selection:", selText);
            if (!mounted) return;
            const sel = iframe.contentWindow?.getSelection();
            if (!sel || sel.rangeCount === 0) return;
            const selectedText = sel.toString().trim();
            if (!selectedText) return;
            const range = sel.getRangeAt(0);
            const rangeRect = range.getBoundingClientRect();
            const iframeRect = iframe.getBoundingClientRect();
            const left = iframeRect.left + rangeRect.left;
            const top = iframeRect.top + rangeRect.top - 52;
            console.log("mouseup: selection popup shown");
            setSelectionPopup({
              left,
              top,
              cfiRange: selectedCfiRef.current,
              selectedText: selectedText.slice(0, 300),
            });
          };
          const onSelectionChange = () => {
            if (!mounted) return;
            const text = iframe.contentWindow?.getSelection()?.toString().trim();
            if (text === "") {
              selectedCfiRef.current = "";
              setSelectionPopup(null);
            }
          };
          doc.addEventListener("mouseup", onMouseUp);
          doc.addEventListener("selectionchange", onSelectionChange);
          mouseupCleanup = () => {
            doc.removeEventListener("mouseup", onMouseUp);
            doc.removeEventListener("selectionchange", onSelectionChange);
          };
        });
        rendition.on("selected", (cfiRange: string) => {
          if (!mounted) return;
          selectedCfiRef.current = cfiRange ?? "";
          setSelectionPopup((prev) => (prev ? { ...prev, cfiRange: selectedCfiRef.current } : null));
        });
        rendition.on("relocated", (location: { start?: { index?: number; percentage?: number }; atEnd?: boolean }) => {
          if (!mounted) return;
          const index = location?.start?.index;
          const len = bookRef.current?.spine?.items?.length;
          const percentage = location?.start?.percentage;
          const atEnd = location?.atEnd;
          
          if (typeof atEnd === "boolean") {
            isAtEndRef.current = atEnd;
          }
          
          if (typeof index === "number") {
            setChapterIndex(index + 1);
          }
          if (typeof len === "number") {
            setTotalChapters(len);
          }
          if (typeof percentage === "number") {
            setReadingProgress(Math.round(percentage * 100));
            if (!surveyShownRef.current && percentage >= 0.85) {
              surveyShownRef.current = true;
              setSurveyModalOpen(true);
            }
          }
        });
        rendition.display();
        console.log("display called");
        renditionRef.current = {
          themes: rendition.themes,
          prev: () => {
            try {
              rendition.prev();
            } catch {}
          },
          next: () => {
            try {
              const wasAtEnd = isAtEndRef.current;
              rendition.next();
              // 마지막 페이지에서 next 호출 시 설문 모달 표시
              if (wasAtEnd && !surveyShownRef.current) {
                surveyShownRef.current = true;
                setSurveyModalOpen(true);
              }
            } catch {}
          },
          display: (href: string) => {
            try {
              rendition.display(href);
            } catch {}
          },
          addAnnotation: (cfi: string) => {
            try {
              rendition.annotations.add(
                "highlight",
                cfi,
                {},
                undefined,
                "epub-highlight",
                {
                  fill: "#fef08a",
                  "fill-opacity": "0.4",
                  "mix-blend-mode": "multiply",
                }
              );
            } catch {}
          },
        };
        rendition.themes.fontSize("100%");

        setTimeout(() => {
          if (!mounted) return;
          const iframe = document.getElementById("epub-container")?.querySelector("iframe");
          console.log(
            "iframe:",
            iframe,
            "iframe.contentDocument:",
            iframe?.contentDocument?.body?.innerHTML?.slice(0, 200)
          );
        }, 500);

        if (!mounted) {
          try {
            rendition.destroy();
            book.destroy();
          } catch {}
          return;
        }
        epubRefRef.current = {
          destroy: () => {
            try {
              rendition.destroy();
              book.destroy();
            } catch {}
          },
        };
      } catch (err) {
        console.error("EPUB load error:", err);
        if (mounted) {
          setErrorMessage("EPUB 로드 중 오류가 발생했습니다.");
          console.error("setViewState error at:", new Error().stack);
          setViewState("error");
        }
      }
    })();

    return () => {
      mounted = false;
      mouseupCleanup?.();
      bookRef.current = null;
      epubRefRef.current?.destroy();
      epubRefRef.current = null;
      renditionRef.current = null;
    };
  }, [viewState, verifyData?.file_type, verifyData?.epub_path]);

  // EPUB paginated: 키보드 좌우
  useEffect(() => {
    if (viewState !== "viewer" || verifyData?.file_type !== "epub") return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        renditionRef.current?.prev();
      } else if (e.key === "ArrowRight") {
        renditionRef.current?.next();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [viewState, verifyData?.file_type]);

  // 선택 팝업: 클릭 외부 시 닫기
  useEffect(() => {
    if (!selectionPopup) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (selectionPopupRef.current?.contains(e.target as Node)) return;
      const container = document.getElementById("epub-container");
      if (container?.contains(e.target as Node)) return;
      setSelectionPopup(null);
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [selectionPopup]);

  if (viewState === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-100 text-neutral-700">
        <p>로딩 중...</p>
      </div>
    );
  }

  if (viewState === "error") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-neutral-100 text-neutral-800">
        <p className="text-red-600">{errorMessage}</p>
        <button
          type="button"
          onClick={fetchVerify}
          className="rounded bg-neutral-700 px-4 py-2 text-white hover:bg-neutral-800"
        >
          다시 시도
        </button>
      </div>
    );
  }

  if (viewState === "email_input") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
        <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-lg">
          <h2 className="mb-6 text-center text-xl font-semibold text-neutral-800">
            이메일 인증
          </h2>
          <p className="mb-6 text-center text-sm text-neutral-600">
            초대받은 이메일 주소를 입력해주세요
          </p>
          <div className="space-y-4">
            <input
              type="email"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !emailVerifying && handleEmailVerify()}
              placeholder="example@email.com"
              disabled={emailVerifying}
              className="w-full rounded-lg border border-neutral-300 px-4 py-3 text-sm placeholder:text-neutral-400 focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-200 disabled:bg-neutral-100"
            />
            {emailError && (
              <p className="text-sm text-red-600">{emailError}</p>
            )}
            <button
              type="button"
              onClick={handleEmailVerify}
              disabled={emailVerifying}
              className="w-full rounded-lg bg-neutral-800 py-3 text-sm font-medium text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {emailVerifying ? "확인 중..." : "확인"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (viewState === "copyright_warning") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
          <h2 className="mb-4 text-center text-xl font-semibold text-neutral-800">
            저작권 안내
          </h2>
          <div className="mb-6 space-y-3 text-sm text-neutral-700">
            <p>
              이 파일은 출판 전 검토용으로만 제공됩니다. 무단 복제, 배포, 캡처를 금지합니다. 저작권법에 따라 법적 책임이 따를 수 있습니다.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setViewState("viewer")}
            className="w-full rounded-lg bg-neutral-800 py-2.5 text-sm font-medium text-white hover:bg-neutral-700"
          >
            확인
          </button>
        </div>
      </div>
    );
  }

  if (!verifyData) return null;

  return (
    <div className="relative flex min-h-screen flex-col bg-neutral-200">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-neutral-200 bg-white px-5 shadow-sm">
        <h1 className="max-w-[220px] truncate text-base font-semibold text-neutral-800">
          {verifyData.title}
        </h1>
        {verifyData.file_type === "epub" && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => renditionRef.current?.prev()}
              className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-100 text-base font-medium text-neutral-700 transition-transform hover:bg-neutral-200 active:scale-95"
              aria-label="이전 페이지"
            >
              ◀
            </button>
            <button
              type="button"
              onClick={() => renditionRef.current?.next()}
              className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-100 text-base font-medium text-neutral-700 transition-transform hover:bg-neutral-200 active:scale-95"
              aria-label="다음 페이지"
            >
              ▶
            </button>
            <span className="min-w-[60px] text-center text-sm tabular-nums text-neutral-500">
              {readingProgress}%
            </span>
            <div className="h-6 w-px bg-neutral-200" aria-hidden />
            <button
              type="button"
              onClick={() => setTocOpen((o) => !o)}
              className="flex h-10 items-center justify-center rounded-lg bg-neutral-100 px-4 text-sm font-medium text-neutral-700 transition-transform hover:bg-neutral-200 active:scale-95"
            >
              목차
            </button>
            <button
              type="button"
              onClick={() => {
                const idx = FONT_SCALE_STEPS.indexOf(epubFontScale as (typeof FONT_SCALE_STEPS)[number]);
                const newIdx = idx < 0 ? 0 : Math.max(0, idx - 1);
                const newVal = FONT_SCALE_STEPS[newIdx];
                setEpubFontScale(newVal);
                renditionRef.current?.themes.fontSize(`${newVal}%`);
              }}
              disabled={epubFontScale <= FONT_SCALE_STEPS[0]}
              className="flex h-10 items-center justify-center rounded-lg bg-neutral-100 px-4 text-sm font-medium text-neutral-700 transition-transform hover:bg-neutral-200 active:scale-95 disabled:active:scale-100 disabled:opacity-50 disabled:hover:bg-neutral-100"
            >
              A-
            </button>
            <button
              type="button"
              onClick={() => {
                const idx = FONT_SCALE_STEPS.indexOf(epubFontScale as (typeof FONT_SCALE_STEPS)[number]);
                const newIdx = idx < 0 ? FONT_SCALE_STEPS.length - 1 : Math.min(FONT_SCALE_STEPS.length - 1, idx + 1);
                const newVal = FONT_SCALE_STEPS[newIdx];
                setEpubFontScale(newVal);
                renditionRef.current?.themes.fontSize(`${newVal}%`);
              }}
              disabled={epubFontScale >= FONT_SCALE_STEPS[FONT_SCALE_STEPS.length - 1]}
              className="flex h-10 items-center justify-center rounded-lg bg-neutral-100 px-4 text-sm font-medium text-neutral-700 transition-transform hover:bg-neutral-200 active:scale-95 disabled:active:scale-100 disabled:opacity-50 disabled:hover:bg-neutral-100"
            >
              A+
            </button>
          </div>
        )}
        {verifyData.file_type === "pdf" && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPdfPageNum((n) => Math.max(1, n - 1))}
              disabled={pdfPageNum <= 1}
              className="rounded border border-neutral-400 px-3 py-1 text-sm hover:bg-neutral-100 disabled:opacity-50"
            >
              이전
            </button>
            <span className="text-sm text-neutral-600">
              {pdfPageNum} / {pdfTotalPages || "-"}
            </span>
            <button
              type="button"
              onClick={() => setPdfPageNum((n) => Math.min(pdfTotalPages || 1, n + 1))}
              disabled={pdfTotalPages > 0 && pdfPageNum >= pdfTotalPages}
              className="rounded border border-neutral-400 px-3 py-1 text-sm hover:bg-neutral-100 disabled:opacity-50"
            >
              다음
            </button>
            <button
              type="button"
              onClick={() => setPdfZoom((z) => Math.max(0.5, z - 0.25))}
              className="rounded border border-neutral-400 px-2 py-0.5 text-sm hover:bg-neutral-100"
            >
              줌 -
            </button>
            <button
              type="button"
              onClick={() => setPdfZoom((z) => Math.min(2, z + 0.25))}
              className="rounded border border-neutral-400 px-2 py-0.5 text-sm hover:bg-neutral-100"
            >
              줌 +
            </button>
          </div>
        )}
      </header>

      <main className="relative flex-1 overflow-hidden">
        {/* 텍스트 선택 시 구절 팝업 */}
        {verifyData.file_type === "epub" && selectionPopup && (
          <div
            ref={selectionPopupRef}
            className="selection-popup fixed z-30 flex flex-col items-center drop-shadow-xl"
            style={{
              left: selectionPopup.left,
              top: selectionPopup.top,
            }}
          >
            <div className="flex flex-row items-center gap-0 rounded-xl bg-white p-1.5 shadow-xl">
              <button
                type="button"
                onClick={async () => {
                  const text = selectionPopup.selectedText?.trim();
                  if (!text) {
                    setSelectionPopup(null);
                    return;
                  }
                  
                  if (selectionPopup.cfiRange) {
                    renditionRef.current?.addAnnotation(selectionPopup.cfiRange);
                  }
                  try {
                    await fetch("/api/highlight", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        token,
                        type: "good",
                        cfi_range: selectionPopup.cfiRange,
                        chapter: String(chapterIndex),
                        selected_text: text,
                      }),
                    });
                  } catch {
                    // 무시
                  }
                  setSelectionPopup(null);
                }}
                className="rounded-lg px-3 py-2 text-sm font-medium text-emerald-600 hover:bg-emerald-50"
              >
                ✨ 하이라이트
              </button>
            </div>
            <div
              className="mt-[-1px] h-0 w-0 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent border-t-white"
              aria-hidden
            />
          </div>
        )}

        {verifyData.file_type === "pdf" ? (
          <div
            ref={containerRef}
            className="bg-white"
            style={{ display: "flex", justifyContent: "center", alignItems: "flex-start", padding: 16, width: "100%", minHeight: "60vh" }}
          >
            <canvas ref={pdfCanvasRef} className="shadow-lg" style={{ maxWidth: "100%" }} />
          </div>
        ) : (
          <div className="relative h-[calc(100vh-64px)] w-full">
            <div
              ref={containerRef}
              id="epub-container"
              className="bg-white"
              style={{
                position: "relative",
                width: "100%",
                height: "calc(100vh - 64px)",
                overflow: "hidden",
                zIndex: 1,
              }}
            />
          </div>
        )}

        {/* 워터마크 오버레이 */}
        <div
          className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
          aria-hidden
        >
          <div
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage: `repeating-linear-gradient(
                -25deg,
                transparent,
                transparent 80px,
                rgba(0,0,0,0.03) 80px,
                rgba(0,0,0,0.03) 81px
              )`,
            }}
          />
          <div
            className="flex h-full w-full flex-wrap content-start gap-x-24 gap-y-16 p-8"
            style={{
              background: `repeating-linear-gradient(
                0deg,
                transparent 0,
                transparent 120px,
                transparent 120px
              )`,
            }}
          >
            {Array.from({ length: 50 }).map((_, i) => (
              <span
                key={i}
                className="select-none text-lg font-light text-neutral-400"
                style={{ transform: "rotate(-25deg)" }}
              >
                {verifyData.watermark_text}
              </span>
            ))}
          </div>
        </div>
      </main>

      {verifyData.file_type === "epub" && tocOpen && (
        <aside className="absolute right-0 top-16 z-10 max-h-[80vh] w-64 overflow-auto border border-neutral-300 bg-white p-2 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-neutral-700">목차</span>
            <button
              type="button"
              onClick={() => setTocOpen(false)}
              className="text-sm text-blue-600 hover:underline"
            >
              닫기
            </button>
          </div>
          <nav className="flex flex-col gap-0.5">
            {(bookRef.current?.navigation?.toc ?? []).map((item, i) => (
              <TocEntry
                key={i}
                item={item}
                onSelect={(href) => {
                  if (href) {
                    renditionRef.current?.display(href);
                    setTocOpen(false);
                  }
                }}
              />
            ))}
          </nav>
        </aside>
      )}

      {/* 설문 모달 (스크롤 90% 이상 시 1회만) */}
      {surveyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h2 className="mb-6 text-center text-xl font-semibold text-neutral-800">
              읽어주셔서 감사합니다 🙏
            </h2>
            <div className="space-y-5">
              <div>
                <p className="mb-2 text-sm font-medium text-neutral-700">별점 (1–5)</p>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setSurveyForm((f) => ({ ...f, satisfaction: n }))}
                      className={`rounded p-1.5 text-xl transition ${
                        surveyForm.satisfaction >= n
                          ? "text-amber-400"
                          : "text-neutral-300 hover:text-amber-200"
                      }`}
                      aria-label={`${n}점`}
                    >
                      ★
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-sm font-medium text-neutral-700">한줄평</p>
                <textarea
                  value={surveyForm.one_liner}
                  onChange={(e) => setSurveyForm((f) => ({ ...f, one_liner: e.target.value }))}
                  placeholder="한줄평을 입력해 주세요"
                  rows={2}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm placeholder:text-neutral-400 focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
                />
              </div>
              <div>
                <p className="mb-2 text-sm font-medium text-neutral-700">좋았던 점</p>
                <textarea
                  value={surveyForm.good_points}
                  onChange={(e) => setSurveyForm((f) => ({ ...f, good_points: e.target.value }))}
                  placeholder="좋았던 점을 입력해 주세요"
                  rows={3}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm placeholder:text-neutral-400 focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
                />
              </div>
              <div>
                <p className="mb-2 text-sm font-medium text-neutral-700">아쉬웠던 점</p>
                <textarea
                  value={surveyForm.improvement_points}
                  onChange={(e) => setSurveyForm((f) => ({ ...f, improvement_points: e.target.value }))}
                  placeholder="아쉬웠던 점을 입력해 주세요"
                  rows={3}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm placeholder:text-neutral-400 focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={async () => {
                try {
                  const res = await fetch("/api/submit-feedback", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      token,
                      satisfaction: surveyForm.satisfaction,
                      one_liner: surveyForm.one_liner,
                      good_points: surveyForm.good_points,
                      improvement_points: surveyForm.improvement_points,
                    }),
                  });
                  const data = await res.json();
                  if (data?.ok) setSurveyModalOpen(false);
                } catch {
                  // 제출 실패 시 모달 유지
                }
              }}
              className="mt-6 w-full rounded-lg bg-neutral-800 py-2.5 text-sm font-medium text-white hover:bg-neutral-700"
            >
              제출
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function VPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Loading...</div>}>
      <VPageContent />
    </Suspense>
  );
}
