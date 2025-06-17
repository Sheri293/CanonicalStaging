module.exports = {
  maxDepth: parseInt(process.env.CRAWLER_MAX_DEPTH) || 3,
  maxUrls: parseInt(process.env.CRAWLER_MAX_URLS) || 100,
  timeout: parseInt(process.env.CRAWLER_TIMEOUT) || 120000,
  pageLoadDelay: parseInt(process.env.CRAWLER_PAGE_LOAD_DELAY) || 12000,
  headless: process.env.CRAWLER_HEADLESS !== "false",
  humanSimulation: process.env.CRAWLER_HUMAN_SIMULATION !== "false",
  keepWindowsOpen: process.env.CRAWLER_KEEP_WINDOWS_OPEN === "true",
  windowDisplayTime: parseInt(process.env.CRAWLER_WINDOW_DISPLAY_TIME) || 5000,
  userAgent:
    process.env.CRAWLER_USER_AGENT ||
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  respectRobots: process.env.CRAWLER_RESPECT_ROBOTS !== "false",
  followRedirects: process.env.CRAWLER_FOLLOW_REDIRECTS !== "false",
  excludePatterns: process.env.CRAWLER_EXCLUDE_PATTERNS
    ? process.env.CRAWLER_EXCLUDE_PATTERNS.split(",")
    : ["\\.pdf$", "\\.doc$", "\\.docx$", "\\.zip$", "\\.jpg$", "\\.png$"],
  headers: {
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    Connection: "keep-alive",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
  },
  rateLimit: {
    requests: parseInt(process.env.CRAWLER_RATE_LIMIT_REQUESTS) || 1,
    window: parseInt(process.env.CRAWLER_RATE_LIMIT_WINDOW) || 8000,
  },
  crawlDelay: parseInt(process.env.CRAWLER_DELAY) || 8000,
};
