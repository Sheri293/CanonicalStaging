const { chromium } = require("playwright");
const Logger = require("../utils/Logger");
const LinkDiscovery = require("../crawlers/LinkDiscovery");
const UrlResolver = require("../crawlers/UrlResolver");
const CrawlQueue = require("../crawlers/CrawlQueue");
const RateLimiter = require("../utils/RateLimiter");
const Cache = require("../utils/Cache");
const CrawlResult = require("../models/CrawlResult");

class CrawlerEngine {
  constructor(config = {}) {
    this.config = {
      maxDepth: config.maxDepth || 3,
      maxUrls: config.maxUrls || 100,
      timeout: config.timeout || 120000,
      pageLoadDelay: config.pageLoadDelay || 12000,
      userAgent:
        config.userAgent ||
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      respectRobots: config.respectRobots !== false,
      followRedirects: config.followRedirects !== false,
      includeBinaryUrls: config.includeBinaryUrls || false,
      excludePatterns: config.excludePatterns || [],
      includePatterns: config.includePatterns || [],
      headers: config.headers || {},
      humanSimulation: config.humanSimulation !== false,
      keepWindowsOpen: config.keepWindowsOpen || false,
      windowDisplayTime: config.windowDisplayTime || 5000,
      ...config,
    };

    this.logger = new Logger("CrawlerEngine");
    this.browser = null;
    this.linkDiscovery = new LinkDiscovery(this.config);
    this.urlResolver = new UrlResolver(this.config);
    this.crawlQueue = new CrawlQueue();
    this.rateLimiter = new RateLimiter(
      this.config.rateLimit || { requests: 5, window: 2000 }
    );
    this.cache = new Cache({ ttl: this.config.cacheTTL || 300000 });
    this.discoveredUrls = new Set();
    this.visitedUrls = new Set();
    this.failedUrls = new Set();
    this.activePages = new Map();
  }

  async initialize() {
    try {
      this.logger.info("Initializing Crawler Engine with human simulation");

      this.browser = await chromium.launch({
        headless: this.config.headless !== false,
        slowMo: this.config.humanSimulation ? 100 : 0,
        devtools: this.config.keepWindowsOpen,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--disable-gpu",
          "--window-size=1366,768",
          "--disable-web-security",
          "--disable-blink-features=AutomationControlled",
          "--disable-background-timer-throttling",
          "--disable-backgrounding-occluded-windows",
          "--disable-renderer-backgrounding",
          "--disable-features=TranslateUI",
          "--disable-ipc-flooding-protection",
          "--no-first-run",
          "--no-default-browser-check",
          "--no-pings",
          "--password-store=basic",
          "--use-mock-keychain",
          "--start-maximized",
        ],
      });

      this.logger.success("Browser initialized with human simulation features");

      await this.linkDiscovery.initialize();
      await this.crawlQueue.initialize();

      this.logger.success("Crawler Engine initialized successfully");
    } catch (error) {
      this.logger.error("Failed to initialize Crawler Engine", error);
      throw error;
    }
  }

  async discoverUrls(startUrl, options = {}) {
    try {
      this.logger.info(
        "Starting URL discovery with enhanced human simulation",
        {
          startUrl,
          pageLoadDelay: this.config.pageLoadDelay,
          humanSimulation: this.config.humanSimulation,
        }
      );

      const normalizedStartUrl = this.urlResolver.normalize(startUrl);
      const baseDomain = this.urlResolver.extractDomain(normalizedStartUrl);

      this.logger.info(`Base domain: ${baseDomain}`);

      this.crawlQueue.add(normalizedStartUrl, 0);
      this.discoveredUrls.add(normalizedStartUrl);

      while (
        !this.crawlQueue.isEmpty() &&
        this.discoveredUrls.size < this.config.maxUrls
      ) {
        await this.rateLimiter.acquire();

        const { url, depth } = this.crawlQueue.next();

        if (this.visitedUrls.has(url) || depth > this.config.maxDepth) {
          continue;
        }

        await this.crawlPage(url, depth, baseDomain, options);
      }

      if (this.config.keepWindowsOpen) {
        this.logger.info("Keeping windows open for inspection...");
        await this.sleep(this.config.windowDisplayTime);
      }

      const results = Array.from(this.discoveredUrls).map(
        (url) =>
          new CrawlResult({
            url,
            discovered: true,
            depth: this.getUrlDepth(url, normalizedStartUrl),
            source: this.getUrlSource(url, normalizedStartUrl),
          })
      );

      this.logger.success("URL discovery completed", {
        totalDiscovered: results.length,
        totalVisited: this.visitedUrls.size,
        totalFailed: this.failedUrls.size,
      });

      return results;
    } catch (error) {
      this.logger.error("URL discovery failed with detailed error", {
        error: error.message,
        stack: error.stack,
        name: error.name,
        code: error.code,
      });
      throw error;
    }
  }

  async crawlPage(url, depth, baseDomain, options) {
    let page = null;
    let context = null;
    const crawlStartTime = Date.now();

    try {
      this.logger.info(`Starting crawl for: ${url} (depth: ${depth})`);

      this.visitedUrls.add(url);

      const cacheKey = `crawl:${url}`;
      let links = this.cache.get(cacheKey);

      if (!links) {
        context = await this.browser.newContext({
          userAgent: this.config.userAgent,
          viewport: { width: 1366, height: 768 },
          ignoreHTTPSErrors: true,
          extraHTTPHeaders: {
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
            "Accept-Language": "en-US,en;q=0.9",
            "Accept-Encoding": "gzip, deflate, br",
            "Cache-Control": "no-cache",
            Pragma: "no-cache",
            "Sec-Ch-Ua":
              '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
            "Sec-Ch-Ua-Mobile": "?0",
            "Sec-Ch-Ua-Platform": '"Windows"',
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "none",
            "Sec-Fetch-User": "?1",
            "Upgrade-Insecure-Requests": "1",
            ...this.config.headers,
          },
        });

        page = await context.newPage();

        await this.setupPageForHumanSimulation(page);

        this.logger.info(`Navigating to: ${url}`);

        try {
          const navigationStartTime = Date.now();

          const response = await page.goto(url, {
            waitUntil: "domcontentloaded",
            timeout: this.config.timeout,
          });

          if (!response) {
            throw new Error(
              `No response received for ${url} after ${
                Date.now() - navigationStartTime
              }ms`
            );
          }

          const status = response.status();
          this.logger.info(
            `Response received for ${url}: ${status} (${
              Date.now() - navigationStartTime
            }ms)`
          );

          if (status >= 400) {
            throw new Error(
              `HTTP ${status} - Failed to load page: ${response.statusText()}`
            );
          }

          this.logger.info(
            `Waiting ${this.config.pageLoadDelay}ms for page to fully load: ${url}`
          );
          await this.sleep(this.config.pageLoadDelay);

          await page
            .waitForLoadState("networkidle", { timeout: 15000 })
            .catch(() => {
              this.logger.info(
                "Network idle timeout reached, continuing with human simulation..."
              );
            });

          if (this.config.humanSimulation) {
            await this.simulateHumanBehavior(page, url);
          }

          this.logger.info(
            `Page fully loaded and simulated, extracting links from: ${url}`
          );

          links = await this.linkDiscovery.extractLinks(page, url);

          this.logger.info(
            `Successfully extracted ${
              links.length
            } links from ${url} (total time: ${Date.now() - crawlStartTime}ms)`
          );

          this.cache.set(cacheKey, links);

          if (this.config.keepWindowsOpen) {
            this.activePages.set(url, { page, context, timestamp: Date.now() });
            this.logger.info(`Keeping page open for inspection: ${url}`);
          }
        } catch (error) {
          const errorDetails = {
            url,
            error: error.message,
            name: error.name,
            code: error.code,
            stack: error.stack,
            timestamp: new Date().toISOString(),
            duration: Date.now() - navigationStartTime,
          };

          this.logger.error(`Navigation failed for ${url}`, errorDetails);

          if (error.message.includes("net::ERR_NAME_NOT_RESOLVED")) {
            this.logger.error(
              `DNS RESOLUTION FAILED: ${url} - Domain does not exist or is unreachable`
            );
          } else if (error.message.includes("net::ERR_CONNECTION_REFUSED")) {
            this.logger.error(
              `CONNECTION REFUSED: ${url} - Server is not responding on this port`
            );
          } else if (error.message.includes("net::ERR_SSL_PROTOCOL_ERROR")) {
            this.logger.error(
              `SSL PROTOCOL ERROR: ${url} - SSL certificate issue or invalid configuration`
            );
          } else if (error.message.includes("Timeout")) {
            this.logger.error(
              `TIMEOUT ERROR: ${url} - Page took longer than ${this.config.timeout}ms to load`
            );
          } else if (error.message.includes("net::ERR_FAILED")) {
            this.logger.error(
              `GENERIC FAILURE: ${url} - Possible bot protection, firewall, or access restriction`
            );
          } else if (error.message.includes("net::ERR_CERT_")) {
            this.logger.error(
              `CERTIFICATE ERROR: ${url} - SSL certificate is invalid, expired, or untrusted`
            );
          } else if (error.message.includes("net::ERR_BLOCKED_")) {
            this.logger.error(
              `ACCESS BLOCKED: ${url} - Request was blocked by security policy or firewall`
            );
          }

          throw error;
        }
      } else {
        this.logger.info(`Using cached links for: ${url}`);
      }

      for (const link of links) {
        const resolvedUrl = this.urlResolver.resolve(link.href, url);

        if (this.shouldIncludeUrl(resolvedUrl, baseDomain, options)) {
          if (!this.discoveredUrls.has(resolvedUrl)) {
            this.discoveredUrls.add(resolvedUrl);

            if (depth < this.config.maxDepth) {
              this.crawlQueue.add(resolvedUrl, depth + 1);
            }
          }
        }
      }

      this.logger.success(
        `Successfully completed crawl for ${url} - Found ${
          links.length
        } links (total time: ${Date.now() - crawlStartTime}ms)`
      );
    } catch (error) {
      const errorDetails = {
        url,
        depth,
        error: error.message,
        name: error.name,
        code: error.code,
        stack: error.stack,
        timestamp: new Date().toISOString(),
        totalDuration: Date.now() - crawlStartTime,
        phase: "crawlPage",
      };

      this.logger.error(`Comprehensive error details for ${url}`, errorDetails);
      this.failedUrls.add(url);
    } finally {
      if (!this.config.keepWindowsOpen) {
        if (page) {
          await page
            .close()
            .catch((e) => this.logger.error("Error closing page", e));
        }
        if (context) {
          await context
            .close()
            .catch((e) => this.logger.error("Error closing context", e));
        }
      }
    }
  }

  async setupPageForHumanSimulation(page) {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", {
        get: () => undefined,
      });
      Object.defineProperty(navigator, "plugins", {
        get: () => [1, 2, 3, 4, 5],
      });
      Object.defineProperty(navigator, "languages", {
        get: () => ["en-US", "en"],
      });
      window.chrome = { runtime: {} };
      Object.defineProperty(navigator, "permissions", {
        get: () => ({ query: () => Promise.resolve({ state: "granted" }) }),
      });

      delete navigator.__proto__.webdriver;

      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => {
        return parameters.name === "notifications"
          ? Promise.resolve({ state: Notification.permission })
          : originalQuery(parameters);
      };
    });
  }

  async simulateHumanBehavior(page, url) {
    try {
      this.logger.info(`Starting human behavior simulation for: ${url}`);

      const viewport = page.viewportSize();
      const maxX = viewport.width;
      const maxY = viewport.height;

      await this.sleep(1000);

      for (let i = 0; i < 3; i++) {
        const randomX = Math.floor(Math.random() * maxX);
        const randomY = Math.floor(Math.random() * maxY);

        await page.mouse.move(randomX, randomY, { steps: 10 });
        await this.sleep(200 + Math.random() * 300);
      }

      const scrollSteps = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < scrollSteps; i++) {
        const scrollAmount = 200 + Math.random() * 400;
        await page.mouse.wheel(0, scrollAmount);
        await this.sleep(800 + Math.random() * 1200);
      }

      await page.mouse.wheel(0, -100);
      await this.sleep(500);

      const finalX = Math.floor(Math.random() * maxX);
      const finalY = Math.floor(Math.random() * (maxY / 2));
      await page.mouse.move(finalX, finalY, { steps: 15 });

      this.logger.info(`Completed human behavior simulation for: ${url}`);
    } catch (error) {
      this.logger.error(`Human simulation failed for ${url}`, {
        error: error.message,
        stack: error.stack,
      });
    }
  }

  async sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  shouldIncludeUrl(url, baseDomain, options) {
    if (!url) return false;

    try {
      const urlObj = new URL(url);

      if (
        options.followExternalLinks !== true &&
        urlObj.hostname !== baseDomain
      ) {
        return false;
      }

      if (
        this.config.excludePatterns.some((pattern) =>
          new RegExp(pattern, "i").test(url)
        )
      ) {
        return false;
      }

      if (
        this.config.includePatterns.length > 0 &&
        !this.config.includePatterns.some((pattern) =>
          new RegExp(pattern, "i").test(url)
        )
      ) {
        return false;
      }

      if (!this.config.includeBinaryUrls) {
        const binaryExtensions =
          /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar|tar|gz|mp3|mp4|avi|mov|jpg|jpeg|png|gif|svg|ico|css|js)$/i;
        if (binaryExtensions.test(urlObj.pathname)) {
          return false;
        }
      }

      if (!["http:", "https:"].includes(urlObj.protocol)) {
        return false;
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  getUrlDepth(url, startUrl) {
    try {
      const startPath = new URL(startUrl).pathname.split("/").filter(Boolean);
      const urlPath = new URL(url).pathname.split("/").filter(Boolean);
      return Math.max(0, urlPath.length - startPath.length);
    } catch (error) {
      return 0;
    }
  }

  getUrlSource(url, startUrl) {
    if (url === startUrl) return "landing-page";
    return "discovered";
  }

  async cleanup() {
    try {
      this.logger.info("Starting Crawler Engine cleanup");

      if (this.activePages.size > 0) {
        this.logger.info(`Closing ${this.activePages.size} active pages`);
        for (const [url, pageData] of this.activePages) {
          try {
            await pageData.page.close();
            await pageData.context.close();
          } catch (error) {
            this.logger.error(`Failed to close page for ${url}`, error);
          }
        }
        this.activePages.clear();
      }

      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }

      await this.crawlQueue.cleanup();
      this.cache.clear();

      this.logger.success("Crawler Engine cleanup completed");
    } catch (error) {
      this.logger.error("Crawler Engine cleanup failed", {
        error: error.message,
        stack: error.stack,
      });
    }
  }

  async healthCheck() {
    try {
      if (!this.browser) {
        throw new Error("Browser not initialized");
      }

      const context = await this.browser.newContext();
      const page = await context.newPage();
      await page.goto("data:text/html,<html><body>Health Check</body></html>");
      await page.close();
      await context.close();

      return { status: "healthy", timestamp: new Date().toISOString() };
    } catch (error) {
      throw new Error(`Crawler Engine health check failed: ${error.message}`);
    }
  }

  getDiscoveredUrls() {
    return Array.from(this.discoveredUrls);
  }

  getVisitedUrls() {
    return Array.from(this.visitedUrls);
  }

  getFailedUrls() {
    return Array.from(this.failedUrls);
  }

  getStats() {
    return {
      discovered: this.discoveredUrls.size,
      visited: this.visitedUrls.size,
      failed: this.failedUrls.size,
      queued: this.crawlQueue.size(),
      activePages: this.activePages.size,
    };
  }
}

module.exports = CrawlerEngine;
