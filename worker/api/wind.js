// /api/wind — 한국 연안 시간별 바람 격자 (leaflet-velocity grib2json 프레임)
// 출처: open-meteo (API 키 불필요). 엣지 캐시 1시간.
// 격자: lat 39→33°N, lon 124→132°E, 0.5° = 17×13 = 221점
// 시간: forecast_days=2 시간별(48h) → 3시간 간격 16프레임
// 데이터 순서: 북→남(la1=39), 각 행 서→동(lo1=124) — leaflet-velocity 규격

const LA1 = 39, LA2 = 33, LO1 = 124, LO2 = 132, D = 0.5;
const NY = Math.round((LA1 - LA2) / D) + 1; // 13
const NX = Math.round((LO2 - LO1) / D) + 1; // 17
const STRIDE = 3; // 시간 간격(h)

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
    "&hourly=wind_speed_10m,wind_direction_10m&wind_speed_unit=ms" +
    "&forecast_days=2&timezone=Asia%2FSeoul";

  try {
    const res = await fetch(api);
    if (!res.ok) {
      return json(res.status, { error: `open-meteo ${res.status}` }, headers);
    }
    const arr = await res.json();
    const list = Array.isArray(arr) ? arr : [arr];
    const n = NX * NY;

    const times = (list[0] && list[0].hourly && list[0].hourly.time) || [];
    const frameIdx = [];
    for (let t = 0; t < times.length; t += STRIDE) frameIdx.push(t);

    const mkHeader = (paramNo) => ({
      parameterCategory: 2,
      parameterNumber: paramNo, // 2=U, 3=V
      lo1: LO1, la1: LA1, lo2: LO2, la2: LA2,
      dx: D, dy: D, nx: NX, ny: NY,
      refTime: new Date().toISOString(), forecastTime: 0,
    });

    const frames = frameIdx.map((ti) => {
      const u = new Array(n).fill(0);
      const v = new Array(n).fill(0);
      for (let i = 0; i < list.length && i < n; i++) {
        const h = list[i] && list[i].hourly ? list[i].hourly : null;
        if (!h) continue;
        const sp = Number(h.wind_speed_10m && h.wind_speed_10m[ti]) || 0;
        const deg = Number(h.wind_direction_10m && h.wind_direction_10m[ti]) || 0;
        const rad = (deg * Math.PI) / 180;
        u[i] = -sp * Math.sin(rad);
        v[i] = -sp * Math.cos(rad);
      }
      return {
        time: times[ti] || "",
        data: [
          { header: mkHeader(2), data: u },
          { header: mkHeader(3), data: v },
        ],
      };
    });

    const body = {
      source: "open-meteo",
      grid: { la1: LA1, lo1: LO1, la2: LA2, lo2: LO2, dx: D, dy: D, nx: NX, ny: NY },
      strideHours: STRIDE,
      frames, // [{time:"YYYY-MM-DDTHH:mm", data:[Urec,Vrec]}], ~16개
    };

    const resp = new Response(JSON.stringify(body), { headers });
    ctx.waitUntil(cache.put(cacheKey, resp.clone()));
    return resp;
  } catch (e) {
    return json(502, { error: `Fetch failed: ${e.message}` }, headers);
  }
}

function json(status, body, headers) {
  return new Response(JSON.stringify(body), { status, headers });
}
