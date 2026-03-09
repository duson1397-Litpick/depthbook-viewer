export function normalizeEpubUrl(url: string): string {
  if (!url) {
    console.error("normalizeEpubUrl: empty URL provided");
    return url;
  }
  
  // //로 시작하는 경우 https: 붙이기
  if (url.startsWith("//")) {
    return `https:${url}`;
  }
  
  // https:만 있는 경우 (잘린 URL) 에러 로그
  if (url === "https:" || url === "http:") {
    console.error("normalizeEpubUrl: incomplete URL detected:", url);
  }
  
  return url;
}
