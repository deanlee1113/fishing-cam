// /api/seacam?id=51  — 해양수산부 연안포털 바다캠 스냅샷 프록시
// 원본은 http://220.95.232.18/camera/{id}_0.jpg (HTTP, raw IP)뿐이라
// HTTPS 사이트에서 직접 못 부른다(혼합콘텐츠 차단·"안전하지 않음" 경고).
// Worker가 서버 측에서 HTTP로 받아 HTTPS로 전달 → 경고 해소 + 정상 표시.
// 스냅샷(약 3초 주기 갱신)이라 캐시하지 않는다.

const ORIGIN = "http://220.95.232.18/camera/"; // _0.jpg

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
    const upstream = await fetch(ORIGIN + id + "_0.jpg", {
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
