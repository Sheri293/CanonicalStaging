import Logger from "../utils/Logger.js";
import CrawlerEngine from "./CrawlerEngine.js";
import AuditEngine from "./AuditEngine.js";
import ProgressTracker from "../utils/ProgressTracker.js";
import MetricsCollector from "../utils/MetricsCollector.js";
import ExcelReporter from "../reporters/ExcelReporter.js";
import HTMLReporter from "../reporters/HTMLReporter.js";
import EmailNotifier from "../notifications/EmailNotifier.js";
import config from "../../config/index.js";
import AuditSummary from "../models/AuditSummary.js";
import colors from "colors";

class LandingPageAuditor {
  constructor(options = {}) {
    this.config = { ...config, ...options };
    this.logger = new Logger("LandingPageAuditor");
    this.crawlerEngine = new CrawlerEngine(this.config.crawler);
    this.auditEngine = new AuditEngine({
      ...this.config.audit,
      includeVisualRegression: options.includeVisualRegression || true,
      includeStructureComparison: options.includeStructureComparison || true,
      visualRegression: options.visualRegression || {},
      htmlStructure: options.htmlStructure || {},
    });
    this.progressTracker = new ProgressTracker();
    this.metricsCollector = new MetricsCollector();
    this.startTime = null;
    this.auditId = this.generateAuditId();
  }

  generateAuditId() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const random = Math.random().toString(36).substring(2, 8);
    return `audit-${timestamp}-${random}`;
  }

  async initialize() {
    try {
      this.logger.info("Initializing Landing Page Auditor", {
        auditId: this.auditId,
      });

      await this.crawlerEngine.initialize();
      await this.auditEngine.initialize();
      await this.progressTracker.initialize();

      this.logger.success("All systems initialized successfully");
      return { success: true, auditId: this.auditId };
    } catch (error) {
      this.logger.error("Failed to initialize auditor", error);
      throw error;
    }
  }

  async auditLandingPage(landingUrl, options = {}) {
    this.startTime = Date.now();
    let crawlResults = [];
    let auditResults = [];
    let summary = null;

    try {
      this.logger.info("Starting landing page audit", {
        landingUrl,
        auditId: this.auditId,
        options,
      });

      this.displayHeader(landingUrl);

      this.logger.info("Phase 1: Discovering URLs from landing page");
      crawlResults = await this.discoverUrls(landingUrl, options);

      if (crawlResults.length === 0) {
        throw new Error("No URLs discovered from landing page");
      }

      this.logger.info("Phase 2: Performing comprehensive SEO analysis");
      auditResults = await this.auditUrls(crawlResults, options);

      this.logger.info("Phase 3: Generating analysis and reports");
      summary = await this.generateSummary(auditResults, landingUrl);

      const reports = await this.generateReports(
        auditResults,
        summary,
        options
      );

      if (options.notifications !== false) {
        await this.sendNotifications(summary, reports, options);
      }

      const duration = Date.now() - this.startTime;
      this.logger.success("Landing page audit completed successfully", {
        duration: `${duration}ms`,
        urlsDiscovered: crawlResults.length,
        urlsAudited: auditResults.length,
        auditId: this.auditId,
      });

      return {
        success: true,
        auditId: this.auditId,
        summary,
        reports,
        auditResults,
        duration,
        metrics: this.metricsCollector.getMetrics(),
      };
    } catch (error) {
      this.logger.error("Landing page audit failed", error);

      if (auditResults.length > 0) {
        try {
          summary = await this.generateSummary(auditResults, landingUrl, true);
          await this.generateReports(auditResults, summary, {
            ...options,
            isFailure: true,
          });
        } catch (reportError) {
          this.logger.error("Failed to generate failure report", reportError);
        }
      }

      throw error;
    } finally {
      await this.cleanup();
    }
  }

  async discoverUrls(landingUrl, options) {
    const discoveryOptions = {
      maxDepth: options.maxDepth || this.config.crawler.maxDepth,
      maxUrls: options.maxUrls || this.config.crawler.maxUrls,
      followExternalLinks: options.followExternalLinks || false,
      respectRobots: options.respectRobots !== false,
      userAgent: options.userAgent || this.config.crawler.userAgent,
    };

    this.progressTracker.startPhase("URL Discovery");

    const results = await this.crawlerEngine.discoverUrls(
      landingUrl,
      discoveryOptions
    );

    this.progressTracker.completePhase("URL Discovery", results.length);

    this.logger.info("URL discovery completed", {
      totalUrls: results.length,
      landingUrl,
      depth: discoveryOptions.maxDepth,
    });

    return results;
  }

  async auditUrls(crawlResults, options) {
    const auditOptions = {
      includePerformance: options.includePerformance || false,
      includeAccessibility: options.includeAccessibility || false,
      includeSecurity: options.includeSecurity || false,
      includeVisualRegression: options.includeVisualRegression || false,
      includeStructureComparison: options.includeStructureComparison || false,
      timeout: options.timeout || this.config.audit.timeout,
      concurrent: options.concurrent || this.config.audit.concurrent,
    };

    this.progressTracker.startPhase("SEO Auditing");
    this.progressTracker.setTotal(crawlResults.length);

    const results = await this.auditEngine.auditUrls(
      crawlResults,
      auditOptions,
      (progress) => this.progressTracker.updateProgress(progress)
    );

    this.progressTracker.completePhase("SEO Auditing", results.length);

    this.logger.info("SEO auditing completed", {
      totalAudited: results.length,
      successfulAudits: results.filter((r) => r.success).length,
      failedAudits: results.filter((r) => !r.success).length,
    });

    return results;
  }

  async generateSummary(auditResults, landingUrl, isFailure = false) {
    this.logger.info("Generating audit summary");

    const summary = new AuditSummary({
      auditId: this.auditId,
      landingUrl,
      startTime: this.startTime,
      endTime: Date.now(),
      totalUrls: auditResults.length,
      isFailure,
      results: auditResults,
    });

    this.logger.info("Summary generated", {
      totalUrls: summary.totalUrls,
      successRate: summary.successRate,
      criticalIssues: summary.criticalIssues,
      auditScore: summary.auditScore,
    });

    return summary;
  }

  async generateReports(auditResults, summary, options) {
    this.logger.info("Generating reports");

    const reports = {};

    try {
      const excelReporter = new ExcelReporter(this.config.reports.excel);
      reports.excel = await excelReporter.generate(auditResults, summary);
      this.logger.info("Excel report generated", {
        path: reports.excel.filePath,
      });

      if (options.includeHTML !== false) {
        const htmlReporter = new HTMLReporter(this.config.reports.html);
        reports.html = await htmlReporter.generate(auditResults, summary);
        this.logger.info("HTML report generated", {
          path: reports.html.filePath,
        });
      }

      if (options.includeJSON) {
        try {
          const { default: JSONReporter } = await import(
            "../reporters/JSONReporter.js"
          );
          const jsonReporter = new JSONReporter();
          reports.json = await jsonReporter.generate(auditResults, summary);
          this.logger.info("JSON report generated", {
            path: reports.json.filePath,
          });
        } catch (error) {
          this.logger.warning(
            "JSON reporter not available, skipping JSON report"
          );
        }
      }

      if (options.includeCSV) {
        try {
          const { default: CSVReporter } = await import(
            "../reporters/CSVReporter.js"
          );
          const csvReporter = new CSVReporter();
          reports.csv = await csvReporter.generate(auditResults, summary);
          this.logger.info("CSV report generated", {
            path: reports.csv.filePath,
          });
        } catch (error) {
          this.logger.warning(
            "CSV reporter not available, skipping CSV report"
          );
        }
      }

      return reports;
    } catch (error) {
      this.logger.error("Failed to generate reports", error);
      throw error;
    }
  }

  async sendNotifications(summary, reports, options) {
    try {
      this.logger.info("Sending notifications");

      if (options.email !== false && this.config.email.enabled) {
        const emailNotifier = new EmailNotifier(this.config.email);
        const emailResult = await emailNotifier.send(summary, reports.excel);

        if (emailResult.success) {
          this.logger.success("Email notification sent successfully");
        } else {
          this.logger.warning("Email notification failed", emailResult.error);
        }
      }

      if (options.slack && this.config.slack.enabled) {
        try {
          const { default: SlackNotifier } = await import(
            "../notifications/SlackNotifier.js"
          );
          const slackNotifier = new SlackNotifier(this.config.slack);
          await slackNotifier.send(summary);
          this.logger.info("Slack notification sent");
        } catch (error) {
          this.logger.warning(
            "Slack notifier not available, skipping Slack notification"
          );
        }
      }

      if (options.webhook && this.config.webhook.enabled) {
        try {
          const { default: WebhookNotifier } = await import(
            "../notifications/WebhookNotifier.js"
          );
          const webhookNotifier = new WebhookNotifier(this.config.webhook);
          await webhookNotifier.send(summary, reports);
          this.logger.info("Webhook notification sent");
        } catch (error) {
          this.logger.warning(
            "Webhook notifier not available, skipping webhook notification"
          );
        }
      }
    } catch (error) {
      this.logger.warning("Notification sending failed", error);
    }
  }

  displayHeader(landingUrl) {
    console.log(
      colors.cyan(`
╔════════════════════════════════════════════════════════════════╗
║                    LANDING PAGE SEO AUDITOR                    ║
║                                         
╚════════════════════════════════════════════════════════════════╝
`)
    );

    console.log(colors.white("Audit Configuration:"));
    console.log(colors.gray(`  Landing Page: ${landingUrl}`));
    console.log(colors.gray(`  Audit ID: ${this.auditId}`));
    console.log(colors.gray(`  Max Depth: ${this.config.crawler.maxDepth}`));
    console.log(colors.gray(`  Max URLs: ${this.config.crawler.maxUrls}`));
    console.log(colors.gray(`  Concurrent: ${this.config.audit.concurrent}`));
    console.log("");
  }

  async cleanup() {
    try {
      this.logger.info("Cleaning up resources");

      await Promise.all([
        this.crawlerEngine.cleanup(),
        this.auditEngine.cleanup(),
        this.progressTracker.cleanup(),
      ]);

      this.logger.success("Cleanup completed successfully");
    } catch (error) {
      this.logger.warning("Some cleanup operations failed", error);
    }
  }

  static async auditLandingPage(landingUrl, options = {}) {
    const auditor = new LandingPageAuditor(options);
    await auditor.initialize();
    return await auditor.auditLandingPage(landingUrl, options);
  }

  async healthCheck() {
    try {
      await this.crawlerEngine.healthCheck();
      await this.auditEngine.healthCheck();
      return { status: "healthy", timestamp: new Date().toISOString() };
    } catch (error) {
      return {
        status: "unhealthy",
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }
}

export default LandingPageAuditor;
