console.log(" Starting SEO Auditor...");

require("dotenv").config();
console.log(" Environment loaded");

const yargs = require("yargs/yargs");
const { hideBin } = require("yargs/helpers");
const colors = require("colors");

console.log(" Basic modules loaded");

try {
  const LandingPageAuditor = require("./src/core/LandingPageAuditor");
  console.log(" LandingPageAuditor loaded");
} catch (error) {
  console.error(" Failed to load LandingPageAuditor:", error.message);
  process.exit(1);
}

try {
  const Logger = require("./src/utils/Logger");
  console.log("Logger loaded");
} catch (error) {
  console.error(" Failed to load Logger:", error.message);
  process.exit(1);
}

try {
  const appConfig = require("./config");
  console.log("Config loaded");
  console.log(" Config keys:", Object.keys(appConfig));
} catch (error) {
  console.error(" Failed to load config:", error.message);
  process.exit(1);
}

const LandingPageAuditor = require("./src/core/LandingPageAuditor");
const Logger = require("./src/utils/Logger");
const appConfig = require("./config");

console.log("🔧 Parsing command line arguments...");

const argv = yargs(hideBin(process.argv))
  .usage("Usage: $0 <url> [options]")
  .positional("url", {
    describe: "Landing page URL to audit",
    type: "string",
  })
  .option("depth", {
    alias: "d",
    describe: "Maximum crawl depth",
    type: "number",
    default: 3,
  })
  .option("max-urls", {
    alias: "u",
    describe: "Maximum URLs to discover",
    type: "number",
    default: 100,
  })
  .option("concurrent", {
    alias: "c",
    describe: "Number of concurrent audits",
    type: "number",
    default: 5,
  })
  .option("timeout", {
    alias: "t",
    describe: "Page timeout in milliseconds",
    type: "number",
    default: 30000,
  })
  .option("include", {
    alias: "i",
    describe: "Additional audits to include",
    choices: ["performance", "accessibility", "all"],
    type: "string",
  })
  .option("output", {
    alias: "o",
    describe: "Output formats",
    choices: ["excel", "html", "json", "csv", "all"],
    type: "array",
    default: ["excel"],
  })
  .option("email", {
    describe: "Send email notification",
    type: "boolean",
    default: false,
  })
  .option("env", {
    describe: "Environment preset",
    choices: ["staging", "production", "local"],
    type: "string",
  })
  .option("exclude", {
    describe: "URL patterns to exclude (regex)",
    type: "array",
    default: [],
  })
  .option("headless", {
    describe: "Run browser in headless mode",
    type: "boolean",
    default: true,
  })
  .option("user-agent", {
    describe: "Custom user agent string",
    type: "string",
  })
  .option("verbose", {
    alias: "v",
    describe: "Verbose logging",
    type: "boolean",
    default: false,
  })
  .help()
  .version().argv;

console.log("Arguments parsed:", {
  url: argv._[0],
  depth: argv.depth,
  include: argv.include,
  verbose: argv.verbose,
});

class AuditRunner {
  constructor() {
    console.log(" Creating AuditRunner...");
    this.logger = new Logger("AuditRunner");
    this.startTime = Date.now();
    console.log(" AuditRunner created");
  }

  async run() {
    try {
      console.log(" Starting audit run...");

      console.log(" Parsing options...");
      const options = this.parseOptions(argv);
      console.log(" Options parsed");

      this.displayStartupInfo(options);

      console.log("Initializing LandingPageAuditor...");
      const auditor = new LandingPageAuditor(options.config);
      console.log(" LandingPageAuditor created");

      console.log(" Initializing auditor components...");
      await auditor.initialize();
      console.log(" Auditor initialized");

      console.log("Running health check...");
      const healthCheck = await auditor.healthCheck();
      console.log(" Health check completed:", healthCheck);

      if (healthCheck.status !== "healthy") {
        throw new Error(`System health check failed: ${healthCheck.error}`);
      }

      console.log("Starting landing page audit...");
      const results = await auditor.auditLandingPage(
        options.url,
        options.auditOptions
      );
      console.log("Audit completed");

      this.displayResults(results);

      process.exit(0);
    } catch (error) {
      console.error(" Error in run():", error.message);
      this.handleError(error);
      process.exit(1);
    }
  }

  parseOptions(argv) {
    console.log("🔧 Parsing options...");
    let url = argv._[0];

    if (!url) {
      console.log(colors.red("Error: Landing page URL is required"));
      console.log("Usage: npm run audit <url> [options]");
      process.exit(1);
    }

    try {
      new URL(url);
      console.log("URL validated:", url);
    } catch (error) {
      console.log(colors.red(`Error: Invalid URL format: ${url}`));
      process.exit(1);
    }

    const envConfig = this.getEnvironmentConfig(argv.env);

    const auditOptions = {
      maxDepth: argv.depth,
      maxUrls: argv.maxUrls,
      includePerformance:
        argv.include === "performance" || argv.include === "all",
      includeAccessibility:
        argv.include === "accessibility" || argv.include === "all",
      includeSecurity: argv.include === "all",
      email: argv.email,
      notifications: argv.email,
      includeHTML: argv.output.includes("html") || argv.output.includes("all"),
      includeJSON: argv.output.includes("json") || argv.output.includes("all"),
      includeCSV: argv.output.includes("csv") || argv.output.includes("all"),
      ...envConfig.auditOptions,
    };

    const config = {
      crawler: {
        maxDepth: argv.depth,
        maxUrls: argv.maxUrls,
        timeout: argv.timeout,
        headless: argv.headless,
        userAgent:
          argv.userAgent ||
          (appConfig.crawler
            ? appConfig.crawler.userAgent
            : "SEO-Landing-Page-Auditor/2.0"),
        excludePatterns: argv.exclude,
        ...envConfig.crawler,
      },
      audit: {
        concurrent: argv.concurrent,
        timeout: argv.timeout,
        includePerformance: auditOptions.includePerformance,
        includeAccessibility: auditOptions.includeAccessibility,
        ...envConfig.audit,
      },
      logging: {
        level: argv.verbose ? "debug" : "info",
        ...(appConfig.logging || {}),
      },
      email: appConfig.email || { enabled: false },
      reports: appConfig.reports || {
        excel: { outputDir: "./reports/excel" },
        html: { outputDir: "./reports/html" },
      },
      ...envConfig.config,
    };

    console.log(" Configuration built");
    return { url, auditOptions, config };
  }

  getEnvironmentConfig(env) {
    const configs = {
      staging: {
        auditOptions: { maxUrls: 50, includePerformance: false, email: false },
        crawler: { timeout: 15000 },
        audit: { concurrent: 3 },
      },
      production: {
        auditOptions: { maxUrls: 200, includePerformance: true, email: true },
        crawler: { timeout: 30000 },
        audit: { concurrent: 5 },
      },
      local: {
        auditOptions: { maxUrls: 25, includePerformance: false, email: false },
        crawler: { timeout: 10000 },
        audit: { concurrent: 2 },
      },
    };

    return (
      configs[env] || { auditOptions: {}, crawler: {}, audit: {}, config: {} }
    );
  }

  displayStartupInfo(options) {
    console.log(
      colors.cyan(`
╔════════════════════════════════════════════════════════════════╗
║                    LANDING PAGE SEO AUDITOR                    ║
║                                                        
╚════════════════════════════════════════════════════════════════╝
`)
    );

    console.log(colors.white(" Audit Configuration:"));
    console.log(colors.gray(`   Target URL: ${options.url}`));
    console.log(colors.gray(`   Max Depth: ${options.auditOptions.maxDepth}`));
    console.log(colors.gray(`   Max URLs: ${options.auditOptions.maxUrls}`));
    console.log(
      colors.gray(`   Concurrent: ${options.config.audit.concurrent}`)
    );
    console.log(
      colors.gray(
        `   Performance: ${
          options.auditOptions.includePerformance ? "Yes" : "No"
        }`
      )
    );
    console.log(
      colors.gray(
        `   Accessibility: ${
          options.auditOptions.includeAccessibility ? "Yes" : "No"
        }`
      )
    );
    console.log(
      colors.gray(
        `   Email Notifications: ${options.auditOptions.email ? "Yes" : "No"}`
      )
    );
    console.log("");
  }

  displayResults(results) {
    const duration = Date.now() - this.startTime;
    console.log(
      colors.green(`
╔════════════════════════════════════════════════════════════════╗
║                       AUDIT COMPLETED                         ║
╚════════════════════════════════════════════════════════════════╝
`)
    );

    console.log(colors.white(" Audit Results Summary:"));
    console.log(colors.gray(`   Audit ID: ${results.auditId}`));
    console.log(colors.gray(`   Duration: ${this.formatDuration(duration)}`));
    console.log(
      colors.gray(`   URLs Discovered: ${results.summary.totalUrls}`)
    );
    console.log(
      colors.gray(`   Success Rate: ${results.summary.successRate}%`)
    );
    console.log(
      colors.gray(`   Audit Score: ${results.summary.auditScore}/100`)
    );

    if (results.summary.criticalIssues > 0) {
      console.log(
        colors.red(`   Critical Issues: ${results.summary.criticalIssues}`)
      );
    } else {
      console.log(colors.green(`    No Critical Issues Found`));
    }

    console.log("");
    console.log(colors.white(" Generated Reports:"));
    if (results.reports.excel) {
      console.log(colors.gray(`    Excel: ${results.reports.excel.filePath}`));
    }
    if (results.reports.html) {
      console.log(colors.gray(`    HTML: ${results.reports.html.filePath}`));
    }

    console.log("");
    console.log(colors.green(" Landing page audit completed successfully!"));
  }

  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  handleError(error) {
    console.log(
      colors.red(`
╔════════════════════════════════════════════════════════════════╗
║                         AUDIT FAILED                          ║
╚════════════════════════════════════════════════════════════════╝
`)
    );

    console.log(colors.red("Error Details:"));
    console.log(colors.red(`   Message: ${error.message}`));

    if (error.stack && argv.verbose) {
      console.log(colors.gray("   Stack Trace:"));
      console.log(colors.gray(`   ${error.stack}`));
    }

    this.logger.error("Audit failed", error);
  }
}

console.log(" Starting audit runner...");

if (require.main === module) {
  const runner = new AuditRunner();
  runner.run().catch((error) => {
    console.error(" Fatal error:", error);
    process.exit(1);
  });
}

module.exports = AuditRunner;
