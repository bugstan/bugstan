const token = process.env.GITHUB_TOKEN || process.env.METRICS_TOKEN || "";

async function github(path) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "bugstan-profile-metrics",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`https://api.github.com${path}`, { headers });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API ${response.status} for ${path}: ${body}`);
  }

  return response.json();
}

async function paginate(path) {
  const results = [];
  let page = 1;

  while (true) {
    const separator = path.includes("?") ? "&" : "?";
    const chunk = await github(`${path}${separator}per_page=100&page=${page}`);
    if (!Array.isArray(chunk) || chunk.length === 0) {
      break;
    }

    results.push(...chunk);

    if (chunk.length < 100) {
      break;
    }

    page += 1;
  }

  return results;
}

async function listPublicSourceRepos(owner) {
  const isOrg = owner === "n2ns";
  const path = isOrg ? `/orgs/${owner}/repos?type=public` : `/users/${owner}/repos?type=owner`;
  const repos = await paginate(path);

  return repos
    .filter((repo) => repo.owner?.login === owner)
    .filter((repo) => repo.private === false)
    .filter((repo) => repo.fork === false)
    .map((repo) => repo.full_name)
    .sort((a, b) => a.localeCompare(b));
}

async function listAuthenticatedOwnerSourceRepos(owner) {
  const repos = await paginate("/user/repos?visibility=all&affiliation=owner");

  return repos
    .filter((repo) => repo.owner?.login === owner)
    .filter((repo) => repo.fork === false)
    .map((repo) => repo.full_name)
    .sort((a, b) => a.localeCompare(b));
}

async function listAllPublicSourceRepos(owners) {
  const reposByOwner = await Promise.all(owners.map(listPublicSourceRepos));
  return reposByOwner.flat();
}

module.exports = {
  github,
  listAllPublicSourceRepos,
  listAuthenticatedOwnerSourceRepos,
  listPublicSourceRepos,
  paginate,
};
