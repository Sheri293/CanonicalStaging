const parseIntWithDefault = (envVar, defaultValue) =>
  parseInt(envVar) || defaultValue;
const parseFloatWithDefault = (envVar, defaultValue) =>
  parseFloat(envVar) || defaultValue;

const config = {
  timeout: parseIntWithDefault(process.env.AUDIT_TIMEOUT, 90000),
  pageLoadDelay: parseIntWithDefault(process.env.AUDIT_PAGE_LOAD_DELAY, 12000),
  concurrent: parseIntWithDefault(process.env.AUDIT_CONCURRENT, 3),
  retries: parseIntWithDefault(process.env.AUDIT_RETRIES, 3),
  userAgent:
    process.env.AUDIT_USER_AGENT ||
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  headless: process.env.AUDIT_HEADLESS !== "false",
  humanSimulation: process.env.AUDIT_HUMAN_SIMULATION !== "false",
  keepWindowsOpen: process.env.AUDIT_KEEP_WINDOWS_OPEN === "true",
  windowDisplayTime: parseIntWithDefault(
    process.env.AUDIT_WINDOW_DISPLAY_TIME,
    8000
  ),
  includePerformance: process.env.AUDIT_INCLUDE_PERFORMANCE === "true",
  includeAccessibility: process.env.AUDIT_INCLUDE_ACCESSIBILITY === "true",

  canonical: {
    enabled: process.env.AUDIT_CANONICAL_ENABLED !== "false",
    timeout: 150000,
  },

  metaTags: {
    titleMinLength: parseIntWithDefault(process.env.META_TITLE_MIN_LENGTH, 30),
    titleMaxLength: parseIntWithDefault(process.env.META_TITLE_MAX_LENGTH, 60),
    descriptionMinLength: parseIntWithDefault(
      process.env.META_DESC_MIN_LENGTH,
      120
    ),
    descriptionMaxLength: parseIntWithDefault(
      process.env.META_DESC_MAX_LENGTH,
      160
    ),
    timeout: 150000,
  },

  headings: {
    enabled: process.env.AUDIT_HEADINGS_ENABLED !== "false",
    timeout: 150000,
  },

  brokenLinks: {
    enabled: process.env.AUDIT_BROKEN_LINKS_ENABLED !== "false",
    checkExternal: process.env.AUDIT_CHECK_EXTERNAL_LINKS !== "false",
    concurrent: parseIntWithDefault(process.env.AUDIT_LINK_CONCURRENT, 2),
    timeout: 180000,
  },

  redirects: {
    timeout: 180000,
  },

  structuredData: {
    timeout: 150000,
  },

  performance: {
    fcpThreshold: parseIntWithDefault(process.env.PERF_FCP_THRESHOLD, 2500),
    lcpThreshold: parseIntWithDefault(process.env.PERF_LCP_THRESHOLD, 4000),
    clsThreshold: parseFloatWithDefault(process.env.PERF_CLS_THRESHOLD, 0.25),
    fidThreshold: parseIntWithDefault(process.env.PERF_FID_THRESHOLD, 300),
    ttfbThreshold: parseIntWithDefault(process.env.PERF_TTFB_THRESHOLD, 800),
    timeout: 300000,
  },

  accessibility: {
    timeout: 240000,
  },
};

export default config;
