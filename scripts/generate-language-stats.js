const fs = require("fs");
const { github, listAuthenticatedOwnerSourceRepos, listPublicSourceRepos } = require("./github-public-repos");

const CONFIG = {
  ignoredLanguages: new Set(["HTML", "CSS"]),
  output: process.env.LANGUAGE_STATS_OUTPUT || "top-langs.svg",
};

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function repositoryLanguages(repo) {
  const encodedRepo = repo.split("/").map(encodeURIComponent).join("/");
  return github(`/repos/${encodedRepo}/languages`);
}

function colorFor(language) {
  const colors = {
    PHP: "#4F5D95",
    TypeScript: "#3178c6",
    JavaScript: "#f1e05a",
    Rust: "#dea584",
    Go: "#00ADD8",
    Java: "#b07219",
    Kotlin: "#A97BFF",
    "C++": "#f34b7d",
    Python: "#3572A5",
    Blade: "#f7523f",
    Shell: "#89e051",
    Vue: "#41b883",
  };

  return colors[language] || "#8b949e";
}

function renderSvg({ totals, repoCount }) {
  const rows = Array.from(totals.entries())
    .map(([language, bytes]) => ({ language, bytes }))
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 8);

  const totalBytes = rows.reduce((sum, row) => sum + row.bytes, 0);
  const width = 480;
  const height = 220;
  const barWidth = 440;
  const barX = 20;
  const barY = 68;

  let offset = 0;
  const barSegments = rows
    .map((row) => {
      const segmentWidth = totalBytes ? (row.bytes / totalBytes) * barWidth : 0;
      const rect = `<rect x="${offset.toFixed(2)}" y="0" width="${segmentWidth.toFixed(2)}" height="10" fill="${colorFor(row.language)}" />`;
      offset += segmentWidth;
      return rect;
    })
    .join("\n");

  const rowMarkup = rows
    .map((row, index) => {
      const percent = totalBytes ? ((row.bytes / totalBytes) * 100).toFixed(2) : "0.00";
      const x = index % 2 === 0 ? 28 : 260;
      const y = 108 + Math.floor(index / 2) * 26;
      return `
        <circle cx="${x}" cy="${y - 4}" r="5" fill="${colorFor(row.language)}" />
        <text x="${x + 13}" y="${y}" class="language">${escapeXml(row.language)}</text>
        <text x="${x + 188}" y="${y}" class="percent">${percent}%</text>`;
    })
    .join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">Language Distribution</title>
  <desc id="desc">Language distribution across bugstan personal repositories and n2ns public organization repositories, excluding HTML and CSS.</desc>
  <style>
    svg { background: transparent; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
    .panel { fill: transparent; }
    .heading { fill: #fe428e; font-size: 24px; font-weight: 700; }
    .subtitle { fill: #777; font-size: 13px; }
    .language { fill: #777; font-size: 14px; font-weight: 600; }
    .percent { fill: #666; font-size: 13px; text-anchor: end; }
  </style>
  <rect x="0" y="0" width="${width}" height="${height}" class="panel" />
  <text x="20" y="34" class="heading">Most used languages</text>
  <text x="20" y="54" class="subtitle">${repoCount} source repositories · bugstan personal + n2ns public</text>
  <svg x="${barX}" y="${barY}" width="${barWidth}" height="10" viewBox="0 0 ${barWidth} 10">
    <clipPath id="bar-clip"><rect x="0" y="0" width="${barWidth}" height="10" rx="5" /></clipPath>
    <g clip-path="url(#bar-clip)">
      ${barSegments}
    </g>
  </svg>
${rowMarkup}
</svg>
`;
}

async function main() {
  const personalRepos = await listAuthenticatedOwnerSourceRepos("bugstan");
  const organizationRepos = await listPublicSourceRepos("n2ns");
  const repos = [...personalRepos, ...organizationRepos];
  const totals = new Map();

  for (const repo of repos) {
    const languages = await repositoryLanguages(repo);
    for (const [language, bytes] of Object.entries(languages)) {
      if (CONFIG.ignoredLanguages.has(language)) {
        continue;
      }
      totals.set(language, (totals.get(language) || 0) + bytes);
    }
  }

  fs.writeFileSync(CONFIG.output, renderSvg({ totals, repoCount: repos.length }), "utf8");
  console.log(`Generated ${CONFIG.output} from ${personalRepos.length} bugstan repositories and ${organizationRepos.length} n2ns public repositories.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
