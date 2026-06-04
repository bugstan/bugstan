const fs = require("fs");
const { listAllPublicSourceRepos, paginate } = require("./github-public-repos");

const CONFIG = {
  owners: ["bugstan", "n2ns"],
  author: "bugstan",
  days: Number.parseInt(process.env.CONTRIBUTION_DAYS || "30", 10),
  output: process.env.CONTRIBUTION_GRAPH_OUTPUT || "contribution-graph.svg",
};

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function dayLabel(date) {
  return String(date.getUTCDate());
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function listAuthorCommits(repo, since, until) {
  const encodedRepo = repo.split("/").map(encodeURIComponent).join("/");
  const path = `/repos/${encodedRepo}/commits?author=${encodeURIComponent(CONFIG.author)}&since=${encodeURIComponent(since)}&until=${encodeURIComponent(until)}`;
  return paginate(path);
}

function buildDateBuckets(days) {
  const end = new Date();
  end.setUTCHours(23, 59, 59, 999);

  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days + 1);
  start.setUTCHours(0, 0, 0, 0);

  const buckets = new Map();
  for (let i = 0; i < days; i += 1) {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + i);
    buckets.set(isoDate(date), 0);
  }

  return { start, end, buckets };
}

function renderSvg({ buckets, repoCount, commitCount }) {
  const width = 900;
  const height = 360;
  const chart = {
    x: 92,
    y: 74,
    width: 742,
    height: 206,
  };

  const entries = Array.from(buckets.entries()).map(([date, count]) => ({
    date,
    label: dayLabel(new Date(`${date}T00:00:00Z`)),
    count,
  }));

  const maxCount = Math.max(1, ...entries.map((entry) => entry.count));
  const yMax = Math.max(5, Math.ceil(maxCount / 5) * 5);
  const stepX = entries.length > 1 ? chart.width / (entries.length - 1) : chart.width;

  const points = entries.map((entry, index) => {
    const x = chart.x + index * stepX;
    const y = chart.y + chart.height - (entry.count / yMax) * chart.height;
    return { ...entry, x, y };
  });

  const polyline = points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
  const area = `${chart.x},${chart.y + chart.height} ${polyline} ${chart.x + chart.width},${chart.y + chart.height}`;
  const xLabels = points
    .map((point) => `<text x="${point.x.toFixed(2)}" y="${chart.y + chart.height + 23}" class="axis-label">${escapeXml(point.label)}</text>`)
    .join("\n");

  const yTicks = [];
  for (let tick = 0; tick <= yMax; tick += Math.max(1, Math.ceil(yMax / 12))) {
    const y = chart.y + chart.height - (tick / yMax) * chart.height;
    yTicks.push({ tick, y });
  }

  const yGrid = yTicks
    .map(({ tick, y }) => `
      <line x1="${chart.x}" y1="${y.toFixed(2)}" x2="${chart.x + chart.width}" y2="${y.toFixed(2)}" class="grid" />
      <text x="${chart.x - 8}" y="${(y + 4).toFixed(2)}" class="axis-label y-label">${tick}</text>`)
    .join("\n");

  const xGrid = points
    .map((point) => `<line x1="${point.x.toFixed(2)}" y1="${chart.y}" x2="${point.x.toFixed(2)}" y2="${chart.y + chart.height}" class="grid" />`)
    .join("\n");

  const markers = points
    .map((point) => `<circle cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="3.5"><title>${escapeXml(point.date)}: ${point.count} commits</title></circle>`)
    .join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">bugstan Public Contribution Graph</title>
  <desc id="desc">Public commits by bugstan across bugstan personal repositories and n2ns organization repositories over the last ${CONFIG.days} days.</desc>
  <style>
    svg { background: transparent; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
    .panel { fill: #282c34; }
    .title, .axis-title, .summary { fill: #ffffff; font-weight: 700; }
    .title { font-size: 14px; }
    .axis-title { font-size: 11px; }
    .summary { font-size: 12px; }
    .axis-label { fill: #ffffff; font-size: 9px; font-weight: 600; text-anchor: middle; }
    .y-label { text-anchor: end; }
    .grid { stroke: #6b7280; stroke-width: 1; stroke-dasharray: 1 3; opacity: .55; }
    .line { fill: none; stroke: #61dafb; stroke-width: 4; stroke-linejoin: round; stroke-linecap: round; }
    .area { fill: #61dafb; opacity: .08; }
    circle { fill: #61dafb; }
  </style>
  <rect x="30" y="24" width="838" height="312" class="panel" />
  <text x="449" y="54" class="title" text-anchor="middle">bugstan Public Contribution Graph</text>
  <text x="449" y="322" class="summary" text-anchor="middle">${commitCount} commits · ${repoCount} public source repositories · bugstan + n2ns</text>
  <text x="53" y="178" class="axis-title" text-anchor="middle" transform="rotate(-90 53 178)">Contributions</text>
  <text x="463" y="315" class="axis-title" text-anchor="middle">Days</text>
  ${yGrid}
  ${xGrid}
  <polygon points="${area}" class="area" />
  <polyline points="${polyline}" class="line" />
  ${markers}
  ${xLabels}
</svg>
`;
}

async function main() {
  const { start, end, buckets } = buildDateBuckets(CONFIG.days);
  const repos = await listAllPublicSourceRepos(CONFIG.owners);
  let commitCount = 0;

  for (const repo of repos) {
    const commits = await listAuthorCommits(repo, start.toISOString(), end.toISOString());
    for (const commit of commits) {
      const date = commit.commit?.author?.date ? isoDate(new Date(commit.commit.author.date)) : null;
      if (date && buckets.has(date)) {
        buckets.set(date, buckets.get(date) + 1);
        commitCount += 1;
      }
    }
  }

  fs.writeFileSync(CONFIG.output, renderSvg({ buckets, repoCount: repos.length, commitCount }), "utf8");
  console.log(`Generated ${CONFIG.output} from ${repos.length} public source repositories and ${commitCount} commits.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
