// r6-fetch-and-post.js
import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// -------- ENV --------
// Required: Discord webhook URL + TRN API key
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const TRN_API_KEY = process.env.TRN_API_KEY; // Dev key is fine for this project

if (!DISCORD_WEBHOOK_URL) throw new Error("Missing DISCORD_WEBHOOK_URL env.");
if (!TRN_API_KEY) throw new Error("Missing TRN_API_KEY env.");

// Optional: title/icon tweaks
const EMBED_TITLE = process.env.EMBED_TITLE || "🛡️ Rainbow Six Siege — Daily Update";

// Files
const PLAYERS_PATH = path.join(__dirname, "players.json");
const CACHE_PATH = path.join(__dirname, "stats-cache.json"); // we commit this daily so we can diff yesterday→today

// -------- Helpers --------
const readJSON = (p) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null);
const writeJSON = (p, data) => fs.writeFileSync(p, JSON.stringify(data, null, 2));

const deltaEmoji = (n) => (n > 0 ? "⬆️" : n < 0 ? "⬇️" : "➡️");

/**
 * Map Tracker Network R6 response → minimal fields we need.
 * NOTE: TRN response structure can vary; this maps common fields.
 */
function mapR6Stats(json) {
  // Typical structure:
  // json.data.platformInfo.platformUserHandle
  // json.data.segments[0].stats.rank.mmr.value
  // json.data.segments[0].stats.rank.metadata.iconUrl
  // json.data.segments[0].stats.kd.value
  const data = json?.data;
  const seg0 = data?.segments?.[0];
  const stats = seg0?.stats || {};
  const mmr = stats?.mmr?.value ?? stats?.rank?.mmr?.value ?? null;
  const rankName =
    stats?.rank?.metadata?.name ?? stats?.rankName?.value ?? stats?.rank?.metadata?.rankName ?? "Unranked";
  const rankBadgeUrl =
    stats?.rank?.metadata?.iconUrl ||
    stats?.rank?.metadata?.icon ||
    stats?.rankIcon?.value ||
    null;
  const seasonKD = stats?.kd?.value ?? stats?.kdr?.value ?? stats?.killsPerDeath?.value ?? "—";

  return {
    rankName: typeof rankName === "string" ? rankName : `${rankName ?? "Unranked"}`,
    mmr: typeof mmr === "number" ? Math.round(mmr) : null,
    seasonKD: typeof seasonKD === "number" ? seasonKD.toFixed(2) : `${seasonKD}`,
    rankBadgeUrl
  };
}

/**
 * Fetch stats for one player from TRN.
 */
async function fetchPlayer({ username, platform }) {
  const url = `https://public-api.tracker.gg/v2/r6siege/standard/profile/${platform}/${encodeURIComponent(
    username
  )}`;
  const res = await fetch(url, { headers: { "TRN-Api-Key": TRN_API_KEY } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`TRN ${res.status} for ${username}: ${text}`);
  }
  const json = await res.json();
  return mapR6Stats(json);
}

/**
 * Build Discord webhook payload:
 * - one embed summarizing all players
 * - "Most Improved" based on daily delta MMR
 */
function buildEmbed(playersSummary, mostImproved) {
  const lines = playersSummary.map((p) => {
    const d = p.deltaMMR ?? 0;
    return `• **${p.username}** — ${p.rankName} (${p.mmr ?? "—"} MMR) ${deltaEmoji(d)} ${d >= 0 ? "+" : ""}${d}`;
  });

  const fields = [
    {
      name: "Players",
      value: lines.join("\n")
    }
  ];

  if (mostImproved) {
    fields.unshift({
      name: "🥇 Most Improved",
      value: `**${mostImproved.username}** (+${mostImproved.deltaMMR} MMR)`
    });
  }

  return {
    username: "Tracker",
    embeds: [
      {
        title: EMBED_TITLE,
        description: "Daily ranks & changes vs. yesterday",
        color: 5814783,
        fields,
        footer: { text: "Hearts Break • R6 stats" },
        timestamp: new Date().toISOString()
      }
    ]
  };
}

async function main() {
  // Read players
  const players = readJSON(PLAYERS_PATH);
  if (!Array.isArray(players) || players.length === 0) {
    throw new Error("players.json missing or empty.");
  }

  // Load cache from previous run (object: { "<username>@<platform>": { mmr: number, date: "YYYY-MM-DD" } })
  const cache = readJSON(CACHE_PATH) || {};

  // Fetch all player stats
  const results = [];
  for (const p of players) {
    const stats = await fetchPlayer(p);
    const key = `${p.username}@${p.platform}`;
    const prev = cache[key]?.mmr ?? null;
    const curr = typeof stats.mmr === "number" ? stats.mmr : null;
    const deltaMMR = prev != null && curr != null ? curr - prev : 0;

    results.push({
      username: p.username,
      platform: p.platform,
      rankName: stats.rankName,
      mmr: curr,
      seasonKD: stats.seasonKD,
      rankBadgeUrl: stats.rankBadgeUrl,
      deltaMMR
    });

    // Update cache with current mmr
    cache[key] = { mmr: curr, date: new Date().toISOString().slice(0, 10) };
  }

  // Determine Most Improved (max positive delta)
  const mostImproved = results
    .filter((r) => typeof r.deltaMMR === "number")
    .sort((a, b) => (b.deltaMMR || 0) - (a.deltaMMR || 0))[0];

  const payload = buildEmbed(results, mostImproved?.deltaMMR > 0 ? mostImproved : null);

  // Post to Discord
  const post = await fetch(DISCORD_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!post.ok) throw new Error(`Discord post failed: ${post.status} ${await post.text()}`);

  // Save cache so tomorrow we can compute deltas
  writeJSON(CACHE_PATH, cache);

  console.log("Posted daily R6 update ✅");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
