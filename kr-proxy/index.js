// 한국(서울 리전) 바다캠 중계 프록시 — Google Cloud Run 용
// 카메라(http://220.95.232.18)가 한국 외 IP를 403 차단하므로,
// 서울 리전에서 동작하는 이 작은 서버가 대신 받아 전달한다.
// 의존성 없음(Node 18+ 내장 http + fetch).

const http = require("http");
const PORT = process.env.PORT || 8080;
const ORIGIN = "http://220.95.232.18/camera/"; // {id}_0.jpg

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, "http://localhost");

    // 헬스체크 / 루트
    if (u.pathname === "/" || u.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      return res.end("kr-proxy ok");
    }

    if (u.pathname !== "/seacam") {
      res.writeHead(404, { "Content-Type": "text/plain" });
      return res.end("not found");
    }

    const id = u.searchParams.get("id") || "";
    if (!/^\d{1,4}$/.test(id)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "invalid id" }));
    }

    const up = await fetch(ORIGIN + id + "_0.jpg", {
      headers: { "User-Agent": "Mozilla/5.0 (fishing-cam kr-proxy)" },
    });
    if (!up.ok) {
      res.writeHead(502, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "upstream " + up.status }));
    }
    const buf = Buffer.from(await up.arrayBuffer());
    res.writeHead(200, {
      "Content-Type": up.headers.get("content-type") || "image/jpeg",
      "Cache-Control": "no-store, max-age=0",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(buf);
  } catch (e) {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "fetch failed: " + (e && e.message) }));
  }
});

server.listen(PORT, () => console.log("kr-proxy listening on " + PORT));
