// /api/seacam?id=51  — 해양수산부 연안포털 바다캠 스냅샷 프록시
// 카메라(http://220.95.232.18)는 한국 외 IP를 403 차단 → Cloudflare에서
// 직접 못 받음. 서울 리전 Cloud Run 중계(KR IP)를 거쳐 받아 HTTPS로 전달.
// 경로: 브라우저 → CF Worker(HTTPS) → KR Cloud Run(서울) → 카메라(HTTP·KR)
// 스냅샷(약 3초 주기)이라 캐시하지 않는다.

const ORIGIN =
  "https://fishing-kr-proxy-864488079860.asia-northeast3.run.app/seacam?id=";

export async function handleSeacam(request, env, ctx) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id") || "";

  // SSRF 방지: 숫자 ID만 허용
  if (!/^\d{1,4}$/.test(id)) {
    return new Response(JSON.stringify({ error: "invalid id" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const upstream = await fetch(ORIGIN + id, {
      cf: { cacheTtl: 0 },
      headers: { "User-Agent": "Mozilla/5.0 (fishing-cam proxy)" },
    });
    if (!upstream.ok || !upstream.body) {
      return new Response(JSON.stringify({ error: `upstream ${upstream.status}` }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": upstream.headers.get("Content-Type") || "image/jpeg",
        // 라이브 스냅샷 — 캐시 금지 (클라이언트가 3초마다 새 프레임 요청)
        "Cache-Control": "no-store, max-age=0",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: `fetch failed: ${e.message}` }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
}
