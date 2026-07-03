// 毎朝、天気と今日のシフトをLINEに送るスクリプト（GitHub Actionsから実行）
const LINE_TOKEN = process.env.LINE_CHANNEL_TOKEN;
const LINE_USER_ID = process.env.LINE_USER_ID;

const LAT = 35.73289, LON = 139.82085; // 墨田区
const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTkXwoSdEeG7kg3uapTKDSSX-JAULtiS6UiJ-lfuOPQvtYl6p76X2FCRhT75s9PYc_V5YtBZGnI5PPs/pub?gid=275679152&single=true&output=csv";

const WEATHER_CODE_JA = {
  0: "快晴", 1: "ほぼ快晴", 2: "晴れ時々曇り", 3: "曇り",
  45: "霧", 48: "霧氷",
  51: "小雨", 53: "雨", 55: "強い霧雨",
  56: "着氷性の霧雨", 57: "強い着氷性の霧雨",
  61: "小雨", 63: "雨", 65: "大雨",
  66: "着氷性の雨", 67: "強い着氷性の雨",
  71: "小雪", 73: "雪", 75: "大雪", 77: "雪粒",
  80: "にわか雨", 81: "にわか雨", 82: "激しいにわか雨",
  85: "にわか雪", 86: "激しいにわか雪",
  95: "雷雨", 96: "雷雨（ひょう）", 99: "雷雨（激しいひょう）",
};

function getJstToday() {
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return { month: jst.getUTCMonth() + 1, day: jst.getUTCDate() };
}

function parseTimeRange(label) {
  const m = label.match(/(\d{1,2}:\d{2})\s*[-–—〜~](\d{1,2}:\d{2})/);
  return m ? { start: m[1], end: m[2] } : null;
}

async function getWeatherText(month, day) {
  const res = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
    `&timezone=Asia%2FTokyo&forecast_days=1`
  );
  const data = await res.json();
  const code = data.daily.weather_code[0];
  const tMax = data.daily.temperature_2m_max[0];
  const tMin = data.daily.temperature_2m_min[0];
  const pop = data.daily.precipitation_probability_max[0];
  const desc = WEATHER_CODE_JA[code] || `天気コード${code}`;
  return `${desc}\n最高${tMax}℃ / 最低${tMin}℃\n降水確率${pop}%`;
}

async function getShiftText(month, day) {
  try {
    const res = await fetch(SHEET_CSV_URL + "&t=" + Date.now());
    const csv = await res.text();
    const rows = csv.trim().split("\n").map(l => l.replace(/\r$/, "").split(","));
    const todayKey = `${month}/${day}`;
    const row = rows.find(r => (r[0] || "").trim() === todayKey);
    if (!row) return "シフト情報が見つかりませんでした";
    const label = (row[1] || "").trim();
    if (!label) return "登録なし";
    if (/休|off|お休み/i.test(label)) return "休み";
    const t = parseTimeRange(label);
    return t ? `${t.start}〜${t.end}` : label;
  } catch (e) {
    return "シフト情報の取得に失敗しました";
  }
}

async function main() {
  const { month, day } = getJstToday();
  const [weatherText, shiftText] = await Promise.all([
    getWeatherText(month, day),
    getShiftText(month, day),
  ]);

  const message =
    `おはようございます☀️\n\n` +
    `【${month}/${day}の天気(墨田区)】\n${weatherText}\n\n` +
    `【今日のシフト】\n${shiftText}`;

  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${LINE_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: LINE_USER_ID,
      messages: [{ type: "text", text: message }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LINE push failed: ${res.status} ${body}`);
  }
  console.log("送信しました:\n" + message);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
