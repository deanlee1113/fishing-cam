// /api/tide?station=DT_0001&date=YYYYMMDD
// KHOA 조석예보(고,저조) 프록시
// data.go.kr 1192136 · tideFcstHghLw/GetTideFcstHghLwApiService
// 응답 body.items.item[]: { obsvtrNm, lot, lat, predcDt:"YYYY-MM-DD HH:mm", predcTdlvVl(cm), extrSe }
// 키(KHOA_API_KEY)는 Cloudflare "변수 및 암호"에만 — 코드/클라이언트에 없음.

const ENDPOINT =
  "https://apis.data.go.kr/1192136/tideFcstHghLw/GetTideFcstHghLwApiService";

export async function handleTide(request, env, ctx) {
  const url = new URL(request.url);
  const station = url.searchParams.get("station") || "DT_0001";
  const date =
    url.searchParams.get("date") ||
    new Date()
      .toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" })
      .replace(/-/g, "");

  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "public, max-age=3600",
  };

  if (!env.KHOA_API_KEY) {
    return json(500, { error: "KHOA_API_KEY 환경변수 미설정" }, headers);
  }

  // 조석예보는 일 단위 정적 → 엣지 캐시 1시간
  const cache = caches.default;
  const cacheKey = new Request(url.toString());
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const api =
    ENDPOINT +
    `?serviceKey=${encodeURIComponent(env.KHOA_API_KEY)}` +
    `&type=json` +
    `&obsCode=${encodeURIComponent(station)}` +
    `&reqDate=${encodeURIComponent(date)}` +
    `&numOfRows=100&pageNo=1`;

  try {
    const res = await fetch(api);
    if (!res.ok) {
      return json(res.status, { error: `KHOA API ${res.status}` }, headers);
    }
    const data = await res.json();

    const rc = data?.header?.resultCode;
    if (rc && rc !== "00") {
      return json(
        502,
        { error: `KHOA ${rc}: ${data?.header?.resultMsg || ""}` },
        headers
      );
    }

    const out = new Response(JSON.stringify(normalize(data, station, date)), {
      headers,
    });
    ctx.waitUntil(cache.put(cacheKey, out.clone()));
    return out;
  } catch (e) {
    return json(502, { error: `Fetch failed: ${e.message}` }, headers);
  }
}

function normalize(raw, station, date) {
  let list = raw?.body?.items?.item ?? [];
  if (!Array.isArray(list)) list = list ? [list] : []; // 단건이면 객체

  // 시간순 정렬
  list.sort((a, b) =>
    String(a.predcDt).localeCompare(String(b.predcDt))
  );

  // 고조/저조는 하루 동안 교대로 발생 → 첫 항목이 고조인지 판정 후 교대 라벨링
  const lvl = (x) => Number(x.predcTdlvVl);
  const firstIsHigh =
    list.length >= 2 ? lvl(list[0]) > lvl(list[1]) : true;

  const items = list.map((d, i) => {
    const isHigh = i % 2 === 0 ? firstIsHigh : !firstIsHigh;
    const t = String(d.predcDt || "");
    const time = t.includes(" ") ? t.split(" ")[1].slice(0, 5) : t;
    return {
      time, // "HH:mm"
      type: isHigh ? "만조" : "간조",
      levelCm: Math.round(lvl(d)),
    };
  });

  return {
    source: "국립해양조사원 (KHOA) · data.go.kr",
    fetchedAt: new Date().toISOString(),
    station: list[0]?.obsvtrNm ?? null,
    obsCode: station,
    date,
    items,
  };
}

function json(status, body, headers) {
  return new Response(JSON.stringify(body), { status, headers });
}
