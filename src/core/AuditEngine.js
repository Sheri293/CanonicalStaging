const Logger = require("../utils/Logger");
const CanonicalAuditor = require("../auditors/CanonicalAuditor");
const MetaTagAuditor = require("../auditors/MetaTagAuditor");
const HeadingAuditor = require("../auditors/HeadingAuditor");
const RedirectAuditor = require("../auditors/RedirectAuditor");
const BrokenLinkAuditor = require("../auditors/BrokenLinkAuditor");
const StructuredDataAuditor = require("../auditors/StructuredDataAuditor");
const PerformanceAuditor = require("../auditors/PerformanceAuditor");
const AccessibilityAuditor = require("../auditors/AccessibilityAuditor");
const AuditResult = require("../models/AuditResult");

class AuditEngine {
  constructor(config = {}) {
    this.config = {
      timeout: config.timeout || 90000,
      pageLoadDelay: config.pageLoadDelay || 12000,
      concurrent: config.concurrent || 2,
      retries: config.retries || 3,
      userAgent:
        config.userAgent ||
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      includePerformance: config.includePerformance || false,
      includeAccessibility: config.includeAccessibility || false,
      humanSimulation: config.humanSimulation !== false,
      keepWindowsOpen: config.keepWindowsOpen || false,
      windowDisplayTime: config.windowDisplayTime || 8000,
      headless: config.headless !== false,
      rateLimitDelay: config.rateLimitDelay || 30000,
      maxRetryDelay: config.maxRetryDelay || 120000,
      ...config,
    };

    this.logger = new Logger("AuditEngine");
    this.auditors = new Map();
    this.browser = null;
    this.concurrentLimit = this.config.concurrent;
    this.runningTasks = 0;
    this.activePages = new Map();
    this.rateLimitRetries = new Map();
    this.requestCount = 0;
    this.startTime = Date.now();
  }

  async initialize() {
    try {
      this.logger.info(
        "Initializing Audit Engine with enhanced rate limit handling",
        {
          concurrent: this.config.concurrent,
          pageLoadDelay: this.config.pageLoadDelay,
          rateLimitDelay: this.config.rateLimitDelay,
          humanSimulation: this.config.humanSimulation,
        }
      );

      const { chromium } = require("playwright");
      this.browser = await chromium.launch({
        headless: this.config.headless,
        slowMo: this.config.humanSimulation ? 150 : 0,
        devtools: this.config.keepWindowsOpen,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--disable-gpu",
          "--window-size=1366,768",
          "--start-maximized",
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
          "--disable-extensions",
          "--disable-plugins",
          "--disable-images",
          "--disable-javascript-harmony-shipping",
          "--disable-background-networking",
          "--disable-sync",
          "--metrics-recording-only",
          "--disable-default-apps",
          "--mute-audio",
          "--no-default-browser-check",
          "--no-first-run",
          "--disable-gpu-sandbox",
          "--disable-software-rasterizer",
        ],
      });

      await this.initializeAuditors();

      this.logger.success(
        "Audit Engine initialized with rate limit protection and human simulation"
      );
    } catch (error) {
      this.logger.error("Failed to initialize Audit Engine", {
        error: error.message,
        stack: error.stack,
        name: error.name,
      });
      throw error;
    }
  }

  async initializeAuditors() {
    const auditorConfigs = {
      canonical: { ...this.config.canonical, browser: this.browser },
      metaTags: { ...this.config.metaTags, browser: this.browser },
      headings: { ...this.config.headings, browser: this.browser },
      redirects: { ...this.config.redirects, browser: this.browser },
      brokenLinks: { ...this.config.brokenLinks, browser: this.browser },
      structuredData: { ...this.config.structuredData, browser: this.browser },
    };

    if (this.config.includePerformance) {
      auditorConfigs.performance = {
        ...this.config.performance,
        browser: this.browser,
      };
    }

    if (this.config.includeAccessibility) {
      auditorConfigs.accessibility = {
        ...this.config.accessibility,
        browser: this.browser,
      };
    }

    this.auditors.set(
      "canonical",
      new CanonicalAuditor(auditorConfigs.canonical)
    );
    this.auditors.set("metaTags", new MetaTagAuditor(auditorConfigs.metaTags));
    this.auditors.set("headings", new HeadingAuditor(auditorConfigs.headings));
    this.auditors.set(
      "redirects",
      new RedirectAuditor(auditorConfigs.redirects)
    );
    this.auditors.set(
      "brokenLinks",
      new BrokenLinkAuditor(auditorConfigs.brokenLinks)
    );
    this.auditors.set(
      "structuredData",
      new StructuredDataAuditor(auditorConfigs.structuredData)
    );

    if (this.config.includePerformance) {
      this.auditors.set(
        "performance",
        new PerformanceAuditor(auditorConfigs.performance)
      );
    }

    if (this.config.includeAccessibility) {
      this.auditors.set(
        "accessibility",
        new AccessibilityAuditor(auditorConfigs.accessibility)
      );
    }

    for (const [name, auditor] of this.auditors) {
      try {
        await auditor.initialize();
        this.logger.info(`${name} auditor initialized successfully`);
      } catch (error) {
        this.logger.error(`Failed to initialize ${name} auditor`, {
          auditor: name,
          error: error.message,
          stack: error.stack,
        });
      }
    }
  }

  async auditUrls(crawlResults, options = {}, progressCallback = null) {
    try {
      this.logger.info(
        "Starting comprehensive URL auditing with enhanced protection",
        {
          totalUrls: crawlResults.length,
          concurrent: this.config.concurrent,
          pageLoadDelay: this.config.pageLoadDelay,
          rateLimitDelay: this.config.rateLimitDelay,
          humanSimulation: this.config.humanSimulation,
        }
      );

      const auditResults = [];
      const pending = [...crawlResults];
      const failed = [];
      const successful = [];

      while (pending.length > 0 || this.runningTasks > 0) {
        while (this.runningTasks < this.concurrentLimit && pending.length > 0) {
          const crawlResult = pending.shift();
          this.runningTasks++;

          this.auditSingleUrl(crawlResult, options)
            .then((result) => {
              auditResults.push(result);
              this.runningTasks--;

              if (result.success) {
                successful.push(result.url);
              } else {
                failed.push({ url: result.url, error: result.error });
              }

              this.requestCount++;

              if (progressCallback) {
                progressCallback({
                  current: auditResults.length,
                  total: crawlResults.length,
                  url: crawlResult.url,
                  result,
                  successful: successful.length,
                  failed: failed.length,
                });
              }

              this.logger.info(
                `Progress: ${auditResults.length}/${
                  crawlResults.length
                } (${Math.round(
                  (auditResults.length / crawlResults.length) * 100
                )}%) - Success: ${successful.length}, Failed: ${failed.length}`
              );
            })
            .catch((error) => {
              const errorDetails = {
                url: crawlResult.url,
                error: error.message,
                name: error.name,
                code: error.code,
                stack: error.stack,
                timestamp: new Date().toISOString(),
                phase: "auditSingleUrl",
              };

              this.logger.error(
                `Comprehensive audit failure for URL ${crawlResult.url}`,
                errorDetails
              );

              const failedResult = new AuditResult({
                url: crawlResult.url,
                success: false,
                error: error.message,
                timestamp: new Date().toISOString(),
              });

              auditResults.push(failedResult);
              failed.push({ url: crawlResult.url, error: error.message });
              this.runningTasks--;
            });
        }

        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      if (this.config.keepWindowsOpen && this.activePages.size > 0) {
        this.logger.info(
          `Keeping ${this.activePages.size} audit windows open for inspection...`
        );
        await this.sleep(this.config.windowDisplayTime);
      }

      const totalDuration = Date.now() - this.startTime;

      this.logger.success("URL auditing completed with enhanced protection", {
        total: auditResults.length,
        successful: successful.length,
        failed: failed.length,
        rateLimitHits: this.rateLimitRetries.size,
        totalRequests: this.requestCount,
        duration: `${Math.round(totalDuration / 1000)}s`,
        avgTimePerUrl: `${Math.round(totalDuration / auditResults.length)}ms`,
      });

      return auditResults;
    } catch (error) {
      this.logger.error(
        "URL auditing failed with comprehensive error details",
        {
          error: error.message,
          stack: error.stack,
          name: error.name,
          code: error.code,
          phase: "auditUrls",
        }
      );
      throw error;
    }
  }

  async auditSingleUrl(crawlResult, options = {}) {
    const startTime = Date.now();
    let page = null;
    let context = null;
    const urlKey = crawlResult.url;

    try {
      this.logger.info(`Starting comprehensive audit for: ${crawlResult.url}`);

      await this.applyRateLimit(urlKey);

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
          DNT: "1",
          Connection: "keep-alive",
        },
      });

      page = await context.newPage();
      await this.setupPageForHumanSimulation(page);

      const navigationStartTime = Date.now();
      const response = await this.navigateWithRetry(page, crawlResult.url);

      if (!response) {
        throw new Error("No response received during navigation");
      }

      const statusCode = response.status();
      this.logger.info(
        `Navigation response for ${crawlResult.url}: ${statusCode} (${
          Date.now() - navigationStartTime
        }ms)`
      );

      if (statusCode === 429) {
        await page.close();
        await context.close();
        return await this.handleRateLimit(crawlResult, statusCode);
      }

      if (statusCode >= 400) {
        throw new Error(
          `HTTP ${statusCode} - Failed to load page: ${response.statusText()}`
        );
      }

      this.logger.info(
        `Waiting ${this.config.pageLoadDelay}ms for complete page load: ${crawlResult.url}`
      );
      await this.sleep(this.config.pageLoadDelay);

      await page
        .waitForLoadState("domcontentloaded", { timeout: 15000 })
        .catch(() => {
          this.logger.warning("DOM content loaded timeout, continuing...");
        });

      await page
        .waitForLoadState("networkidle", { timeout: 10000 })
        .catch(() => {
          this.logger.info(
            "Network idle timeout, proceeding with human simulation"
          );
        });

      if (this.config.humanSimulation) {
        await this.simulateHumanBehavior(page, crawlResult.url);
      }

      const auditPromises = [];
      const enabledAuditors = [];

      for (const [name, auditor] of this.auditors) {
        if (this.shouldRunAuditor(name, options)) {
          enabledAuditors.push(name);
          auditPromises.push(
            this.runAuditorWithTimeout(auditor, page, crawlResult.url, name)
          );
        }
      }

      this.logger.info(
        `Running ${auditPromises.length} auditors for: ${crawlResult.url}`,
        {
          auditors: enabledAuditors,
        }
      );

      const auditResults = await Promise.allSettled(auditPromises);
      const compiledResults = this.compileAuditResults(
        auditResults,
        crawlResult.url
      );

      const loadTime = Date.now() - startTime;

      if (this.config.keepWindowsOpen) {
        this.activePages.set(crawlResult.url, {
          page,
          context,
          timestamp: Date.now(),
          statusCode: statusCode,
        });
        this.logger.info(
          `Keeping audit page open for inspection: ${crawlResult.url}`
        );
      }

      const auditResult = new AuditResult({
        url: crawlResult.url,
        success: true,
        loadTime,
        statusCode: statusCode,
        crawlDepth: crawlResult.depth,
        crawlSource: crawlResult.source,
        timestamp: new Date().toISOString(),
        ...compiledResults,
      });

      this.logger.success(
        `Audit completed successfully for ${crawlResult.url}`,
        {
          loadTime: `${loadTime}ms`,
          statusCode: statusCode,
          totalTime: `${Date.now() - startTime}ms`,
          auditsRun: auditPromises.length,
          issues: compiledResults.issues.length,
          warnings: compiledResults.warnings.length,
        }
      );

      return auditResult;
    } catch (error) {
      const loadTime = Date.now() - startTime;
      const errorDetails = {
        url: crawlResult.url,
        error: error.message,
        name: error.name,
        code: error.code,
        stack: error.stack,
        loadTime,
        timestamp: new Date().toISOString(),
        phase: "auditSingleUrl",
        totalDuration: Date.now() - startTime,
      };

      this.logger.error(
        `Comprehensive audit failure for ${crawlResult.url}`,
        errorDetails
      );

      return new AuditResult({
        url: crawlResult.url,
        success: false,
        error: error.message,
        loadTime,
        timestamp: new Date().toISOString(),
      });
    } finally {
      if (!this.config.keepWindowsOpen) {
        if (page) {
          await page.close().catch((e) =>
            this.logger.error("Error closing audit page", {
              error: e.message,
              url: crawlResult.url,
            })
          );
        }
        if (context) {
          await context.close().catch((e) =>
            this.logger.error("Error closing audit context", {
              error: e.message,
              url: crawlResult.url,
            })
          );
        }
      }
    }
  }

  async applyRateLimit(url) {
    const baseDelay = Math.random() * 2000 + 1000;
    await this.sleep(baseDelay);

    if (this.requestCount > 0 && this.requestCount % 10 === 0) {
      const cooldownDelay = 5000 + Math.random() * 5000;
      this.logger.info(
        `Applying cooldown delay: ${Math.round(cooldownDelay / 1000)}s after ${
          this.requestCount
        } requests`
      );
      await this.sleep(cooldownDelay);
    }
  }

  async handleRateLimit(crawlResult, statusCode) {
    const url = crawlResult.url;
    const retryCount = this.rateLimitRetries.get(url) || 0;

    if (retryCount >= 3) {
      this.logger.error(
        `Rate limit exceeded for ${url} after ${retryCount} retries`
      );
      return new AuditResult({
        url: crawlResult.url,
        success: false,
        error: "Rate limit exceeded - maximum retries reached",
        statusCode: 429,
        timestamp: new Date().toISOString(),
      });
    }

    this.rateLimitRetries.set(url, retryCount + 1);

    const exponentialDelay =
      this.config.rateLimitDelay * Math.pow(2, retryCount);
    const maxDelay = Math.min(exponentialDelay, this.config.maxRetryDelay);
    const jitterDelay = maxDelay + Math.random() * 10000;

    this.logger.warning(
      `Rate limited (429) for ${url}. Waiting ${Math.round(
        jitterDelay / 1000
      )}s before retry ${retryCount + 1}/3`
    );

    await this.sleep(jitterDelay);

    this.logger.info(`Retrying after rate limit delay: ${url}`);
    return await this.auditSingleUrl(crawlResult, {});
  }

  async setupPageForHumanSimulation(page) {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", {
        get: () => undefined,
      });
      Object.defineProperty(navigator, "plugins", {
        get: () => [
          {
            name: "Chrome PDF Plugin",
            description: "Portable Document Format",
          },
          { name: "Chrome PDF Viewer", description: "PDF Viewer" },
          { name: "Native Client", description: "Native Client" },
        ],
      });
      Object.defineProperty(navigator, "languages", {
        get: () => ["en-US", "en"],
      });
      Object.defineProperty(navigator, "platform", {
        get: () => "Win32",
      });
      Object.defineProperty(navigator, "hardwareConcurrency", {
        get: () => 4,
      });
      window.chrome = {
        runtime: {},
        loadTimes: function () {
          return {
            requestTime: performance.timing.navigationStart / 1000,
            startLoadTime: performance.timing.navigationStart / 1000,
            commitLoadTime: performance.timing.responseStart / 1000,
            finishDocumentLoadTime:
              performance.timing.domContentLoadedEventEnd / 1000,
            finishLoadTime: performance.timing.loadEventEnd / 1000,
            firstPaintTime: performance.timing.loadEventEnd / 1000,
            firstPaintAfterLoadTime: 0,
            navigationType: "Other",
            wasFetchedViaSpdy: false,
            wasNpnNegotiated: false,
            npnNegotiatedProtocol: "unknown",
            wasAlternateProtocolAvailable: false,
            connectionInfo: "http/1.1",
          };
        },
        csi: function () {
          return {};
        },
      };

      Object.defineProperty(navigator, "permissions", {
        get: () => ({
          query: (parameters) => {
            return parameters.name === "notifications"
              ? Promise.resolve({ state: Notification.permission })
              : Promise.resolve({ state: "granted" });
          },
        }),
      });

      delete navigator.__proto__.webdriver;

      window.outerHeight = window.innerHeight;
      window.outerWidth = window.innerWidth;

      Object.defineProperty(screen, "availWidth", { get: () => 1366 });
      Object.defineProperty(screen, "availHeight", { get: () => 728 });
      Object.defineProperty(screen, "width", { get: () => 1366 });
      Object.defineProperty(screen, "height", { get: () => 768 });
    });
  }

  async simulateHumanBehavior(page, url) {
    try {
      this.logger.info(`Starting human behavior simulation for audit: ${url}`);

      const viewport = page.viewportSize();
      const maxX = viewport.width;
      const maxY = viewport.height;

      await this.sleep(800 + Math.random() * 1200);

      for (let i = 0; i < 4; i++) {
        const randomX = Math.floor(Math.random() * maxX * 0.8) + maxX * 0.1;
        const randomY = Math.floor(Math.random() * maxY * 0.8) + maxY * 0.1;

        await page.mouse.move(randomX, randomY, {
          steps: 10 + Math.floor(Math.random() * 10),
        });
        await this.sleep(200 + Math.random() * 600);
      }

      const scrollSteps = 3 + Math.floor(Math.random() * 5);
      for (let i = 0; i < scrollSteps; i++) {
        const scrollAmount = 200 + Math.random() * 400;
        await page.mouse.wheel(0, scrollAmount);
        await this.sleep(1000 + Math.random() * 2000);
      }

      await this.sleep(500 + Math.random() * 1000);

      const scrollUpAmount = -(scrollSteps * 150 + Math.random() * 200);
      await page.mouse.wheel(0, scrollUpAmount);
      await this.sleep(600 + Math.random() * 400);

      const finalX = Math.floor(Math.random() * maxX * 0.6) + maxX * 0.2;
      const finalY = Math.floor(Math.random() * (maxY / 3));
      await page.mouse.move(finalX, finalY, {
        steps: 15 + Math.floor(Math.random() * 10),
      });

      await this.sleep(500 + Math.random() * 1000);

      this.logger.info(`Completed human behavior simulation for audit: ${url}`);
    } catch (error) {
      this.logger.error(`Human simulation failed during audit for ${url}`, {
        error: error.message,
        stack: error.stack,
        name: error.name,
      });
    }
  }

  async sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async navigateWithRetry(page, url, retries = this.config.retries) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        this.logger.info(
          `Navigation attempt ${attempt + 1}/${retries + 1} for ${url}`
        );

        const response = await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: this.config.timeout,
        });

        this.logger.info(
          `Navigation successful on attempt ${attempt + 1} for ${url}`
        );
        return response;
      } catch (error) {
        const errorDetails = {
          url,
          attempt: attempt + 1,
          maxRetries: retries + 1,
          error: error.message,
          name: error.name,
          code: error.code,
          stack: error.stack,
        };

        if (attempt === retries) {
          this.logger.error(
            `All navigation attempts failed for ${url}`,
            errorDetails
          );

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

        this.logger.warning(
          `Navigation attempt ${attempt + 1} failed for ${url}, retrying...`,
          errorDetails
        );

        const baseRetryDelay = 2000 * (attempt + 1);
        const jitterDelay = baseRetryDelay + Math.random() * 2000;
        this.logger.info(
          `Waiting ${Math.round(jitterDelay / 1000)}s before retry...`
        );
        await this.sleep(jitterDelay);
      }
    }
  }

  async runAuditorWithTimeout(auditor, page, url, auditorName) {
    const auditorStartTime = Date.now();

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              `${auditorName} auditor timeout after ${this.config.timeout}ms`
            )
          ),
        this.config.timeout
      )
    );

    try {
      this.logger.info(`Starting ${auditorName} auditor for ${url}`);

      const result = await Promise.race([
        auditor.audit(page, url),
        timeoutPromise,
      ]);

      const auditorDuration = Date.now() - auditorStartTime;
      this.logger.info(
        `${auditorName} auditor completed for ${url} (${auditorDuration}ms)`
      );

      return {
        name: auditorName,
        success: true,
        result,
        duration: auditorDuration,
      };
    } catch (error) {
      const auditorDuration = Date.now() - auditorStartTime;
      const errorDetails = {
        auditor: auditorName,
        url,
        error: error.message,
        name: error.name,
        code: error.code,
        stack: error.stack,
        duration: auditorDuration,
      };

      this.logger.error(
        `${auditorName} auditor failed for ${url}`,
        errorDetails
      );
      return {
        name: auditorName,
        success: false,
        error: error.message,
        duration: auditorDuration,
      };
    }
  }

  shouldRunAuditor(auditorName, options) {
    const coreAuditors = [
      "canonical",
      "metaTags",
      "headings",
      "redirects",
      "brokenLinks",
      "structuredData",
    ];

    if (coreAuditors.includes(auditorName)) {
      return true;
    }

    if (
      auditorName === "performance" &&
      (options.includePerformance || this.config.includePerformance)
    ) {
      return true;
    }

    if (
      auditorName === "accessibility" &&
      (options.includeAccessibility || this.config.includeAccessibility)
    ) {
      return true;
    }

    return false;
  }

  compileAuditResults(auditResults, url) {
    const compiled = {
      canonical: null,
      metaTags: null,
      headings: null,
      redirects: [],
      brokenLinks: [],
      structuredData: [],
      performance: null,
      accessibility: null,
      issues: [],
      warnings: [],
      recommendations: [],
    };

    let successfulAuditors = 0;
    let failedAuditors = 0;

    auditResults.forEach((result, index) => {
      if (result.status === "fulfilled" && result.value.success) {
        const { name, result: auditResult, duration } = result.value;
        compiled[name] = auditResult;
        successfulAuditors++;

        this.logger.info(
          `Auditor ${name} completed successfully for ${url} (${duration}ms)`
        );

        if (auditResult && auditResult.issues) {
          compiled.issues.push(...auditResult.issues);
        }
        if (auditResult && auditResult.warnings) {
          compiled.warnings.push(...auditResult.warnings);
        }
        if (auditResult && auditResult.recommendations) {
          compiled.recommendations.push(...auditResult.recommendations);
        }
      } else {
        failedAuditors++;
        const error =
          result.status === "rejected" ? result.reason : result.value.error;
        const auditorName = result.value?.name || "unknown";

        const errorDetails = {
          auditor: auditorName,
          url,
          error: error,
          resultStatus: result.status,
          index,
        };

        this.logger.error(`Auditor compilation error for ${url}`, errorDetails);

        compiled.issues.push({
          type: "audit_failure",
          severity: "error",
          message: `Audit failure in ${auditorName}: ${error}`,
          auditor: auditorName,
          details: errorDetails,
        });
      }
    });

    this.logger.info(`Audit compilation completed for ${url}`, {
      successfulAuditors,
      failedAuditors,
      totalIssues: compiled.issues.length,
      totalWarnings: compiled.warnings.length,
      totalRecommendations: compiled.recommendations.length,
    });

    return compiled;
  }

  async cleanup() {
    try {
      this.logger.info("Starting comprehensive Audit Engine cleanup");

      if (this.activePages.size > 0) {
        this.logger.info(`Closing ${this.activePages.size} active audit pages`);
        const closePromises = [];

        for (const [url, pageData] of this.activePages) {
          closePromises.push(
            (async () => {
              try {
                await pageData.page.close();
                await pageData.context.close();
                this.logger.info(`Closed audit page for: ${url}`);
              } catch (error) {
                this.logger.error(`Failed to close audit page for ${url}`, {
                  error: error.message,
                  stack: error.stack,
                });
              }
            })()
          );
        }

        await Promise.allSettled(closePromises);
        this.activePages.clear();
      }

      for (const [name, auditor] of this.auditors) {
        try {
          if (auditor.cleanup) {
            await auditor.cleanup();
            this.logger.info(`${name} auditor cleaned up successfully`);
          }
        } catch (error) {
          this.logger.error(`Failed to cleanup ${name} auditor`, {
            auditor: name,
            error: error.message,
            stack: error.stack,
          });
        }
      }

      if (this.browser) {
        await this.browser.close();
        this.browser = null;
        this.logger.info("Browser closed successfully");
      }

      this.rateLimitRetries.clear();
      this.requestCount = 0;

      this.logger.success("Audit Engine cleanup completed successfully", {
        totalRequestsProcessed: this.requestCount,
        totalDuration: `${Math.round((Date.now() - this.startTime) / 1000)}s`,
      });
    } catch (error) {
      this.logger.error(
        "Audit Engine cleanup failed with comprehensive error details",
        {
          error: error.message,
          stack: error.stack,
          name: error.name,
          code: error.code,
        }
      );
    }
  }

  async healthCheck() {
    try {
      if (!this.browser) {
        throw new Error("Browser not initialized");
      }

      const context = await this.browser.newContext();
      const page = await context.newPage();

      const testStartTime = Date.now();
      await page.goto(
        "data:text/html,<html><body><h1>Health Check</h1><p>System operational</p></body></html>"
      );
      const pageLoadTime = Date.now() - testStartTime;

      await page.close();
      await context.close();

      for (const [name, auditor] of this.auditors) {
        if (auditor.healthCheck) {
          await auditor.healthCheck();
        }
      }

      return {
        status: "healthy",
        timestamp: new Date().toISOString(),
        browserReady: true,
        pageLoadTime: `${pageLoadTime}ms`,
        activePages: this.activePages.size,
        auditors: Array.from(this.auditors.keys()),
        rateLimitRetries: this.rateLimitRetries.size,
        totalRequests: this.requestCount,
        uptime: `${Math.round((Date.now() - this.startTime) / 1000)}s`,
      };
    } catch (error) {
      throw new Error(`Audit Engine health check failed: ${error.message}`);
    }
  }

  getAuditorStats() {
    const stats = {
      totalAuditors: this.auditors.size,
      activePages: this.activePages.size,
      runningTasks: this.runningTasks,
      concurrentLimit: this.concurrentLimit,
      rateLimitRetries: this.rateLimitRetries.size,
      totalRequests: this.requestCount,
      uptime: Date.now() - this.startTime,
      config: {
        timeout: this.config.timeout,
        pageLoadDelay: this.config.pageLoadDelay,
        concurrent: this.config.concurrent,
        humanSimulation: this.config.humanSimulation,
        rateLimitDelay: this.config.rateLimitDelay,
      },
    };

    for (const [name, auditor] of this.auditors) {
      if (auditor.getStats) {
        stats[name] = auditor.getStats();
      }
    }

    return stats;
  }

  async pauseAuditing(duration = 10000) {
    this.logger.info(`Pausing auditing for ${duration}ms`);
    await this.sleep(duration);
    this.logger.info("Resuming auditing");
  }

  getCurrentLoad() {
    return {
      runningTasks: this.runningTasks,
      maxConcurrent: this.concurrentLimit,
      loadPercentage: Math.round(
        (this.runningTasks / this.concurrentLimit) * 100
      ),
      activePages: this.activePages.size,
      requestsProcessed: this.requestCount,
    };
  }

  async adjustConcurrency(newLimit) {
    const oldLimit = this.concurrentLimit;
    this.concurrentLimit = Math.max(1, Math.min(newLimit, 10));

    this.logger.info(
      `Concurrency adjusted from ${oldLimit} to ${this.concurrentLimit}`
    );

    return {
      oldLimit,
      newLimit: this.concurrentLimit,
      currentRunning: this.runningTasks,
    };
  }

  getRateLimitStats() {
    const stats = {
      totalRateLimitHits: this.rateLimitRetries.size,
      urlsAffected: Array.from(this.rateLimitRetries.keys()),
      retryDistribution: {},
    };

    for (const [url, retryCount] of this.rateLimitRetries) {
      stats.retryDistribution[retryCount] =
        (stats.retryDistribution[retryCount] || 0) + 1;
    }

    return stats;
  }

  async emergencyStop() {
    this.logger.warning("Emergency stop initiated");

    try {
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }

      this.activePages.clear();
      this.runningTasks = 0;

      this.logger.info("Emergency stop completed");
      return { success: true, timestamp: new Date().toISOString() };
    } catch (error) {
      this.logger.error("Emergency stop failed", error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = AuditEngine;
