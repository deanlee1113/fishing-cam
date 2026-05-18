// Cloudflare Worker 진입점
// /api/* 요청은 서버 측 프록시로, 그 외 모든 요청은 정적 파일(ASSETS)로 처리.
// 키(KHOA_API_KEY)는 Cloudflare 대시보드 "변수 및 암호"에만 저장 — 코드/클라이언트에 없음.

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/tide") {
      const { handleTide } = await import("./api/tide.js");
      return handleTide(request, env, ctx);
    }

    // 추후 동일 패턴으로 추가 예정:
    // if (url.pathname === "/api/marine")  { ... }
    // if (url.pathname === "/api/weather") { ... }
    // if (url.pathname === "/api/fishing") { ... }

    // 그 외 전부 정적 파일
    return env.ASSETS.fetch(request);
  },
};
