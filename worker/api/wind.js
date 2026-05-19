// /api/wind — 한국 연안 바람 격자 (leaflet-velocity grib2json 포맷)
// 출처: open-meteo (API 키 불필요). 엣지 캐시 1시간.
// 격자: lat 39→33°N, lon 124→132°E, 0.5° 간격 = 17×13 = 221점
// 데이터 순서: 북→남(la1=39 시작), 각 행 서→동(lo1=124 시작) — leaflet-velocity 규격과 동일

const LA1 = 39, LA2 = 33, LO1 = 124, LO2 = 132, D = 0.5;
const NY = Math.round((LA1 - LA2) / D) + 1; // 13 (위도 점 수)
const NX = Math.round((LO2 - LO1) / D) + 1; // 17 (경도 점 수)

export async function handleWind(request, env, ctx) {
  const url = new URL(request.url);
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "public, max-age=3600",
  };

  const cache = caches.default;
  const cacheKey = new Request(url.origin + "/api/wind");
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  // 격자 좌표 (북→남, 서→동)
  const lats = [], lons = [];
  for (let r = 0; r < NY; r++) {
    for (let c = 0; c < NX; c++) {
      lats.push((LA1 - r * D).toFixed(2));
      lons.push((LO1 + c * D).toFixed(2));
    }
  }

  const api =
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${lats.join(",")}&longitude=${lons.join(",")}` +
    "&current=wind_speed_10m,wind_direction_10m&wind_speed_unit=ms";

  try {
    const res = await fetch(api);
    if (!res.ok) {
      return json(res.status, { error: `open-meteo ${res.status}` }, headers);
    }
    const arr = await res.json();
    const list = Array.isArray(arr) ? arr : [arr];

    const n = NX * NY;
    const u = new Array(n).fill(0);
    const v = new Array(n).fill(0);
    for (let i = 0; i < list.length && i < n; i++) {
      const cur = list[i] && list[i].current ? list[i].current : {};
      const sp = Number(cur.wind_speed_10m) || 0;
      const deg = Number(cur.wind_direction_10m) || 0;
      const rad = (deg * Math.PI) / 180;
      // 기상학 풍향(불어오는 방향) → 벡터 성분
      u[i] = -sp * Math.sin(rad); // 동향(+동)
      v[i] = -sp * Math.cos(rad); // 북향(+북)
    }

    const refTime = new Date().toISOString();
    const mkHeader = (paramNo) => ({
      parameterCategory: 2, // momentum
      parameterNumber: paramNo, // 2 = U-component, 3 = V-component
      lo1: LO1, la1: LA1, lo2: LO2, la2: LA2,
      dx: D, dy: D, nx: NX, ny: NY,
      refTime, forecastTime: 0,
    });

    const out = [
      { header: mkHeader(2), data: u },
      { header: mkHeader(3), data: v },
    ];

    const resp = new Response(JSON.stringify(out), { headers });
    ctx.waitUntil(cache.put(cacheKey, resp.clone()));
    return resp;
  } catch (e) {
    return json(502, { error: `Fetch failed: ${e.message}` }, headers);
  }
}

function json(status, body, headers) {
  return new Response(JSON.stringify(body), { status, headers });
}
