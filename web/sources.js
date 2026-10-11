// Live data loaders. Every source is fetched straight from the browser; nothing passes through a server.

export const ROLE_PATTERN = /\b(data scien\w*|data analy\w*|data engineer\w*|machine learning|ml engineer\w*|ai engineer\w*|ai\/ml|analytics engineer\w*|applied scien\w*|research scien\w*|business intelligence|bi analyst|llm|genai|mlops)\b/i;

export function roleOf(title) {
  const t = (title || "").toLowerCase();
  if (/\banalytics engineer/.test(t)) return "Analytics Engineer";
  if (/\b(ai engineer|ai\/ml|llm|genai|generative ai)\b/.test(t)) return "AI Engineer";
  if (/\b(machine learning|ml engineer|mlops)/.test(t)) return "ML Engineer";
  if (/\bdata engineer/.test(t)) return "Data Engineer";
  if (/\b(data scien|applied scien)/.test(t)) return "Data Scientist";
  if (/\bresearch scien/.test(t)) return "Research Scientist";
  if (/\b(business intelligence|bi analyst)/.test(t)) return "BI Analyst";
  if (/\bdata analy/.test(t)) return "Data Analyst";
  return null;
}

// Public job boards. Greenhouse, Ashby, and Lever publish these feeds for career pages.
export const BOARDS = {
  greenhouse: ["stripe","databricks","airbnb","instacart","robinhood","coinbase","figma","dropbox","pinterest","lyft","reddit","discord",
               "duolingo","anthropic","scaleai","datadog","mongodb","elastic","gusto","affirm","doordashusa","chime","brex","asana"],
  ashby: ["openai","notion","ramp","linear","perplexity","cohere","replit","vanta","plaid"],
  lever: ["palantir","spotify","shieldai"],
};
const NAMES = {doordashusa: "DoorDash", scaleai: "Scale AI", shieldai: "Shield AI", openai: "OpenAI", mongodb: "MongoDB"};
const pretty = (c) => NAMES[c] || c.charAt(0).toUpperCase() + c.slice(1);
const isRemote = (loc) => /remote/i.test(loc || "");

async function getJSON(url) { const r = await fetch(url); if (!r.ok) throw new Error(r.status); return r.json(); }

export async function loadLiveJobs(onProgress) {
  const tasks = [];
  for (const c of BOARDS.greenhouse) tasks.push(getJSON(`https://boards-api.greenhouse.io/v1/boards/${c}/jobs`).then((d) =>
    d.jobs.map((j) => ({company: pretty(c), title: j.title, location: j.location?.name || "", posted: (j.updated_at || "").slice(0, 10), url: j.absolute_url, board: "Greenhouse"}))));
  for (const c of BOARDS.ashby) tasks.push(getJSON(`https://api.ashbyhq.com/posting-api/job-board/${c}`).then((d) =>
    d.jobs.map((j) => ({company: pretty(c), title: j.title, location: (j.isRemote ? "Remote · " : "") + (j.location || ""), posted: (j.publishedAt || "").slice(0, 10), url: j.jobUrl, board: "Ashby"}))));
  for (const c of BOARDS.lever) tasks.push(getJSON(`https://api.lever.co/v0/postings/${c}?mode=json`).then((d) =>
    d.map((j) => ({company: pretty(c), title: j.text, location: j.categories?.location || "", posted: j.createdAt ? new Date(j.createdAt).toISOString().slice(0, 10) : "", url: j.hostedUrl, board: "Lever"}))));
  let done = 0;
  const results = await Promise.allSettled(tasks.map((t) => t.finally(() => onProgress?.(++done, tasks.length))));
  const rows = results.filter((r) => r.status === "fulfilled").flatMap((r) => r.value)
    .map((j) => ({...j, role: roleOf(j.title), remote: isRemote(j.location)})).filter((j) => j.role);
  return {rows, boardsOk: results.filter((r) => r.status === "fulfilled").length, boardsTotal: tasks.length};
}

// Hacker News "Who is hiring?": the latest monthly thread, via the public Algolia API.
const SKILL_WORDS = ["python","sql","llm","rag","pytorch","spark","dbt","snowflake","databricks","aws","gcp","azure","kubernetes","typescript","rust","golang","airflow","tensorflow","langchain","agents"];
const strip = (h) => (h || "").replace(/<p>/g, "\n").replace(/<[^>]+>/g, "").replace(/&#x2F;/g, "/").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&gt;/g, ">").replace(/&lt;/g, "<");

export async function loadHN() {
  const s = await getJSON("https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&query=who%20is%20hiring&hitsPerPage=10");
  const story = s.hits.find((h) => /who is hiring/i.test(h.title));
  const item = await getJSON(`https://hn.algolia.com/api/v1/items/${story.objectID}`);
  const posts = [], skills = [];
  for (const c of item.children || []) {
    if (!c.text) continue;
    const text = strip(c.text);
    const dataAI = ROLE_PATTERN.test(text);
    posts.push({id: c.id, company: text.split(/[|\n]/)[0].trim().slice(0, 60), data_ai: dataAI, remote: /\bremote\b/i.test(text),
                excerpt: text.slice(0, 280), url: `https://news.ycombinator.com/item?id=${c.id}`, text});
    for (const w of SKILL_WORDS) if (new RegExp(`\\b${w}\\b`, "i").test(text)) skills.push({id: c.id, skill: w});
  }
  return {title: story.title, date: story.created_at.slice(0, 10), url: `https://news.ycombinator.com/item?id=${story.objectID}`, posts, skills};
}

// Indeed Hiring Lab: weekly-refreshed postings index by sector, and the share of postings mentioning AI.
export async function loadIndeedText() {
  const base = "https://raw.githubusercontent.com/hiring-lab";
  const [sectors, all, ai] = await Promise.all([
    fetch(`${base}/job_postings_tracker/master/US/job_postings_by_sector_US.csv`).then((r) => r.text()),
    fetch(`${base}/job_postings_tracker/master/US/aggregate_job_postings_US.csv`).then((r) => r.text()),
    fetch(`${base}/ai-tracker/master/AI_posting.csv`).then((r) => r.text()),
  ]);
  return {sectors, all, ai};
}
