const fs = require("fs-extra");
const path = require("path");
const handlebars = require("handlebars");
const Logger = require("../utils/Logger");

class HTMLReporter {
  constructor(config = {}) {
    this.config = {
      outputDir: config.outputDir || "./reports/html",
      templatePath:
        config.templatePath || "./templates/reports/html-template.html",
      filename: config.filename || null,
      includeCharts: config.includeCharts !== false,
      ...config,
    };
    this.logger = new Logger("HTMLReporter");
  }

  async generate(auditResults, summary) {
    try {
      await fs.ensureDir(this.config.outputDir);

      const filename =
        this.config.filename ||
        `seo-audit-${summary.auditId}-${
          new Date().toISOString().split("T")[0]
        }.html`;
      const filePath = path.join(this.config.outputDir, filename);

      const templateData = this.prepareTemplateData(auditResults, summary);
      const htmlContent = await this.renderTemplate(templateData);

      await fs.writeFile(filePath, htmlContent, "utf8");

      this.logger.success(`HTML report generated: ${filePath}`);

      return {
        success: true,
        filePath,
        filename,
        size: (await fs.stat(filePath)).size,
      };
    } catch (error) {
      this.logger.error("Failed to generate HTML report", error);
      throw error;
    }
  }

  prepareTemplateData(auditResults, summary) {
    const successfulResults = auditResults.filter((r) => r.success);
    const failedResults = auditResults.filter((r) => !r.success);

    const issuesByCategory = this.groupIssuesByCategory(auditResults);
    const topIssues = this.getTopIssues(auditResults, 10);
    const performanceMetrics = this.aggregatePerformanceMetrics(auditResults);
    const chartData = this.prepareChartData(auditResults, summary);

    return {
      summary: {
        ...summary,
        auditDate: new Date(summary.startTime).toLocaleString(),
        duration: this.formatDuration(summary.duration),
        successRate: Math.round(
          (successfulResults.length / auditResults.length) * 100
        ),
      },
      results: {
        total: auditResults.length,
        successful: successfulResults.length,
        failed: failedResults.length,
        successfulResults: successfulResults.slice(0, 20),
        failedResults,
        topPerforming: successfulResults
          .sort((a, b) => (b.auditScore || 0) - (a.auditScore || 0))
          .slice(0, 10),
        worstPerforming: successfulResults
          .sort((a, b) => (a.auditScore || 0) - (b.auditScore || 0))
          .slice(0, 10),
      },
      issues: {
        byCategory: issuesByCategory,
        topIssues,
        critical: this.getCriticalIssues(auditResults),
        warnings: this.getWarnings(auditResults),
      },
      metrics: {
        canonical: this.getCanonicalMetrics(auditResults),
        metaTags: this.getMetaTagsMetrics(auditResults),
        headings: this.getHeadingsMetrics(auditResults),
        brokenLinks: this.getBrokenLinksMetrics(auditResults),
        structuredData: this.getStructuredDataMetrics(auditResults),
        performance: performanceMetrics,
        accessibility: this.getAccessibilityMetrics(auditResults),
      },
      charts: chartData,
      helpers: {
        formatNumber: this.formatNumber,
        formatDuration: this.formatDuration,
        getScoreClass: this.getScoreClass,
        getSeverityClass: this.getSeverityClass,
        truncateUrl: this.truncateUrl,
      },
    };
  }

  async renderTemplate(data) {
    try {
      let template;

      if (await fs.pathExists(this.config.templatePath)) {
        template = await fs.readFile(this.config.templatePath, "utf8");
      } else {
        template = this.getDefaultTemplate();
      }

      this.registerHandlebarsHelpers();
      const compiledTemplate = handlebars.compile(template);
      return compiledTemplate(data);
    } catch (error) {
      this.logger.warning(
        "Using fallback template due to template error",
        error
      );
      return this.generateFallbackHTML(data);
    }
  }

  registerHandlebarsHelpers() {
    handlebars.registerHelper("formatNumber", (num) => {
      return typeof num === "number" ? num.toLocaleString() : num;
    });

    handlebars.registerHelper("formatDuration", (ms) => {
      return this.formatDuration(ms);
    });

    handlebars.registerHelper("getScoreClass", (score) => {
      return this.getScoreClass(score);
    });

    handlebars.registerHelper("getSeverityClass", (severity) => {
      return this.getSeverityClass(severity);
    });

    handlebars.registerHelper("truncateUrl", (url, length = 50) => {
      return this.truncateUrl(url, length);
    });

    handlebars.registerHelper("json", (context) => {
      return JSON.stringify(context);
    });

    handlebars.registerHelper("eq", (a, b) => {
      return a === b;
    });

    handlebars.registerHelper("gt", (a, b) => {
      return a > b;
    });

    handlebars.registerHelper("percentage", (value, total) => {
      return total > 0 ? Math.round((value / total) * 100) : 0;
    });
  }

  groupIssuesByCategory(auditResults) {
    const categories = {};

    auditResults.forEach((result) => {
      if (result.issues) {
        result.issues.forEach((issue) => {
          const category = this.getCategoryFromType(issue.type);
          if (!categories[category]) {
            categories[category] = [];
          }
          categories[category].push({
            ...issue,
            url: result.url,
          });
        });
      }
    });

    return Object.keys(categories)
      .map((category) => ({
        name: category,
        count: categories[category].length,
        issues: categories[category].slice(0, 10),
      }))
      .sort((a, b) => b.count - a.count);
  }

  getTopIssues(auditResults, limit = 10) {
    const issueCount = {};

    auditResults.forEach((result) => {
      if (result.issues) {
        result.issues.forEach((issue) => {
          const key = issue.type;
          if (!issueCount[key]) {
            issueCount[key] = {
              type: issue.type,
              message: issue.message,
              severity: issue.severity,
              count: 0,
              examples: [],
            };
          }
          issueCount[key].count++;
          if (issueCount[key].examples.length < 3) {
            issueCount[key].examples.push(result.url);
          }
        });
      }
    });

    return Object.values(issueCount)
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  getCriticalIssues(auditResults) {
    const critical = [];
    auditResults.forEach((result) => {
      if (result.issues) {
        result.issues
          .filter((issue) => issue.severity === "error")
          .forEach((issue) => {
            critical.push({
              ...issue,
              url: result.url,
            });
          });
      }
    });
    return critical.slice(0, 20);
  }

  getWarnings(auditResults) {
    const warnings = [];
    auditResults.forEach((result) => {
      if (result.warnings) {
        result.warnings.forEach((warning) => {
          warnings.push({
            ...warning,
            url: result.url,
          });
        });
      }
    });
    return warnings.slice(0, 20);
  }

  getCanonicalMetrics(auditResults) {
    const total = auditResults.length;
    const withCanonical = auditResults.filter(
      (r) => r.canonical?.hasCanonical
    ).length;
    const issues = auditResults.reduce(
      (sum, r) => sum + (r.canonical?.issues?.length || 0),
      0
    );

    return {
      total,
      withCanonical,
      withoutCanonical: total - withCanonical,
      percentage: Math.round((withCanonical / total) * 100),
      issues,
    };
  }

  getMetaTagsMetrics(auditResults) {
    const total = auditResults.length;
    const withTitle = auditResults.filter((r) => r.metaTags?.title).length;
    const withDescription = auditResults.filter(
      (r) => r.metaTags?.description
    ).length;
    const withViewport = auditResults.filter(
      (r) => r.metaTags?.viewport
    ).length;
    const withOpenGraph = auditResults.filter(
      (r) => r.metaTags?.openGraph?.title
    ).length;

    return {
      total,
      withTitle,
      withDescription,
      withViewport,
      withOpenGraph,
      titlePercentage: Math.round((withTitle / total) * 100),
      descriptionPercentage: Math.round((withDescription / total) * 100),
    };
  }

  getHeadingsMetrics(auditResults) {
    const total = auditResults.length;
    const withH1 = auditResults.filter((r) => r.headings?.h1Count > 0).length;
    const multipleH1 = auditResults.filter(
      (r) => r.headings?.h1Count > 1
    ).length;
    const avgHeadings =
      auditResults.reduce(
        (sum, r) => sum + (r.headings?.totalHeadings || 0),
        0
      ) / total;

    return {
      total,
      withH1,
      withoutH1: total - withH1,
      multipleH1,
      avgHeadings: Math.round(avgHeadings),
      h1Percentage: Math.round((withH1 / total) * 100),
    };
  }

  getBrokenLinksMetrics(auditResults) {
    const total = auditResults.length;
    const totalLinks = auditResults.reduce(
      (sum, r) => sum + (r.brokenLinks?.totalLinks || 0),
      0
    );
    const brokenLinks = auditResults.reduce(
      (sum, r) => sum + (r.brokenLinks?.brokenLinks || 0),
      0
    );
    const pagesWithBrokenLinks = auditResults.filter(
      (r) => (r.brokenLinks?.brokenLinks || 0) > 0
    ).length;

    return {
      total,
      totalLinks,
      brokenLinks,
      workingLinks: totalLinks - brokenLinks,
      pagesWithBrokenLinks,
      brokenPercentage:
        totalLinks > 0 ? Math.round((brokenLinks / totalLinks) * 100) : 0,
    };
  }

  getStructuredDataMetrics(auditResults) {
    const total = auditResults.length;
    const withStructuredData = auditResults.filter(
      (r) => r.structuredData?.hasStructuredData
    ).length;
    const withJsonLd = auditResults.filter(
      (r) => (r.structuredData?.jsonLd?.length || 0) > 0
    ).length;
    const totalSchemas = auditResults.reduce(
      (sum, r) => sum + (r.structuredData?.totalSchemas || 0),
      0
    );

    return {
      total,
      withStructuredData,
      withoutStructuredData: total - withStructuredData,
      withJsonLd,
      totalSchemas,
      percentage: Math.round((withStructuredData / total) * 100),
    };
  }

  aggregatePerformanceMetrics(auditResults) {
    const performanceResults = auditResults.filter((r) => r.performance);

    if (performanceResults.length === 0) {
      return null;
    }

    const avgFCP =
      performanceResults.reduce(
        (sum, r) => sum + (r.performance.coreWebVitals?.fcp || 0),
        0
      ) / performanceResults.length;
    const avgLCP =
      performanceResults.reduce(
        (sum, r) => sum + (r.performance.coreWebVitals?.lcp || 0),
        0
      ) / performanceResults.length;
    const avgCLS =
      performanceResults.reduce(
        (sum, r) => sum + (r.performance.coreWebVitals?.cls || 0),
        0
      ) / performanceResults.length;
    const avgTTFB =
      performanceResults.reduce(
        (sum, r) => sum + (r.performance.coreWebVitals?.ttfb || 0),
        0
      ) / performanceResults.length;
    const avgScore =
      performanceResults.reduce(
        (sum, r) => sum + (r.performance.score || 0),
        0
      ) / performanceResults.length;

    return {
      total: performanceResults.length,
      avgFCP: Math.round(avgFCP),
      avgLCP: Math.round(avgLCP),
      avgCLS: parseFloat(avgCLS.toFixed(3)),
      avgTTFB: Math.round(avgTTFB),
      avgScore: Math.round(avgScore),
      goodFCP: performanceResults.filter(
        (r) => (r.performance.coreWebVitals?.fcp || 0) <= 2500
      ).length,
      goodLCP: performanceResults.filter(
        (r) => (r.performance.coreWebVitals?.lcp || 0) <= 4000
      ).length,
      goodCLS: performanceResults.filter(
        (r) => (r.performance.coreWebVitals?.cls || 0) <= 0.25
      ).length,
    };
  }

  getAccessibilityMetrics(auditResults) {
    const accessibilityResults = auditResults.filter((r) => r.accessibility);

    if (accessibilityResults.length === 0) {
      return null;
    }

    const imagesWithoutAlt = accessibilityResults.reduce(
      (sum, r) =>
        sum +
        (r.accessibility.images?.filter((img) => !img.hasAlt).length || 0),
      0
    );
    const emptyLinks = accessibilityResults.reduce(
      (sum, r) =>
        sum +
        (r.accessibility.links?.filter((link) => link.isEmpty).length || 0),
      0
    );
    const avgScore =
      accessibilityResults.reduce(
        (sum, r) => sum + (r.accessibility.score || 0),
        0
      ) / accessibilityResults.length;

    return {
      total: accessibilityResults.length,
      imagesWithoutAlt,
      emptyLinks,
      avgScore: Math.round(avgScore),
      goodScore: accessibilityResults.filter(
        (r) => (r.accessibility.score || 0) >= 80
      ).length,
    };
  }

  prepareChartData(auditResults, summary) {
    return {
      scoreDistribution: this.getScoreDistribution(auditResults),
      issuesByCategory: this.getIssuesByCategoryChart(auditResults),
      performanceTrends: this.getPerformanceTrends(auditResults),
      auditCoverage: {
        successful: summary.successfulAudits,
        failed: summary.failedAudits,
      },
    };
  }

  getScoreDistribution(auditResults) {
    const ranges = {
      "90-100": 0,
      "80-89": 0,
      "70-79": 0,
      "60-69": 0,
      "50-59": 0,
      "0-49": 0,
    };

    auditResults.forEach((result) => {
      const score = result.auditScore || 0;
      if (score >= 90) ranges["90-100"]++;
      else if (score >= 80) ranges["80-89"]++;
      else if (score >= 70) ranges["70-79"]++;
      else if (score >= 60) ranges["60-69"]++;
      else if (score >= 50) ranges["50-59"]++;
      else ranges["0-49"]++;
    });

    return Object.keys(ranges).map((range) => ({
      range,
      count: ranges[range],
    }));
  }

  getIssuesByCategoryChart(auditResults) {
    const categories = {};

    auditResults.forEach((result) => {
      if (result.issues) {
        result.issues.forEach((issue) => {
          const category = this.getCategoryFromType(issue.type);
          categories[category] = (categories[category] || 0) + 1;
        });
      }
    });

    return Object.keys(categories)
      .map((category) => ({
        category,
        count: categories[category],
      }))
      .sort((a, b) => b.count - a.count);
  }

  getPerformanceTrends(auditResults) {
    const performanceResults = auditResults.filter((r) => r.performance);

    return performanceResults.map((result, index) => ({
      index: index + 1,
      url: this.truncateUrl(result.url, 30),
      fcp: Math.round(result.performance.coreWebVitals?.fcp || 0),
      lcp: Math.round(result.performance.coreWebVitals?.lcp || 0),
      cls: parseFloat((result.performance.coreWebVitals?.cls || 0).toFixed(3)),
      score: result.performance.score || 0,
    }));
  }

  getCategoryFromType(type) {
    const categories = {
      missing_canonical: "Canonical",
      invalid_canonical: "Canonical",
      missing_title: "Meta Tags",
      missing_description: "Meta Tags",
      title_too_short: "Meta Tags",
      title_too_long: "Meta Tags",
      description_too_short: "Meta Tags",
      description_too_long: "Meta Tags",
      missing_h1: "Headings",
      multiple_h1: "Headings",
      empty_heading: "Headings",
      broken_link: "Links",
      broken_image: "Links",
      missing_json_ld: "Structured Data",
      invalid_json_ld: "Structured Data",
      poor_fcp: "Performance",
      poor_lcp: "Performance",
      poor_cls: "Performance",
      image_missing_alt: "Accessibility",
      empty_link: "Accessibility",
    };
    return categories[type] || "Other";
  }

  formatNumber(num) {
    return typeof num === "number" ? num.toLocaleString() : num;
  }

  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  getScoreClass(score) {
    if (score >= 80) return "score-good";
    if (score >= 60) return "score-average";
    return "score-poor";
  }

  getSeverityClass(severity) {
    switch (severity) {
      case "error":
        return "severity-error";
      case "warning":
        return "severity-warning";
      default:
        return "severity-info";
    }
  }

  truncateUrl(url, maxLength = 50) {
    if (!url || url.length <= maxLength) return url;
    return url.substring(0, maxLength) + "...";
  }

  getDefaultTemplate() {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SEO Audit Report - {{summary.auditId}}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px; border-radius: 10px; margin-bottom: 30px; text-align: center; }
        .header h1 { font-size: 2.5rem; margin-bottom: 10px; }
        .header p { font-size: 1.1rem; opacity: 0.9; }
        .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 40px; }
        .summary-card { background: white; padding: 25px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .summary-card h3 { color: #667eea; margin-bottom: 15px; font-size: 1.1rem; }
        .metric { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
        .metric-value { font-weight: bold; font-size: 1.2rem; }
        .score-good { color: #28a745; }
        .score-average { color: #ffc107; }
        .score-poor { color: #dc3545; }
        .section { background: white; margin-bottom: 30px; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .section-header { background: #667eea; color: white; padding: 20px; font-size: 1.3rem; font-weight: bold; }
        .section-content { padding: 25px; }
        .table { width: 100%; border-collapse: collapse; margin-top: 15px; }
        .table th, .table td { padding: 12px; text-align: left; border-bottom: 1px solid #e9ecef; }
        .table th { background: #f8f9fa; font-weight: 600; }
        .table tr:hover { background: #f8f9fa; }
        .severity-error { color: #dc3545; font-weight: bold; }
        .severity-warning { color: #ffc107; font-weight: bold; }
        .url-cell { max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 0.8rem; font-weight: bold; }
        .badge-success { background: #d4edda; color: #155724; }
        .badge-warning { background: #fff3cd; color: #856404; }
        .badge-danger { background: #f8d7da; color: #721c24; }
        .no-data { text-align: center; color: #6c757d; font-style: italic; padding: 40px; }
        .chart-container { margin: 20px 0; }
        @media (max-width: 768px) {
            .summary-grid { grid-template-columns: 1fr; }
            .table { font-size: 0.9rem; }
            .header h1 { font-size: 2rem; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>SEO Audit Report</h1>
            <p>Landing Page: {{summary.landingUrl}}</p>
            <p>Generated: {{summary.auditDate}} | Duration: {{summary.duration}}</p>
        </div>

        <div class="summary-grid">
            <div class="summary-card">
                <h3>📊 Overview</h3>
                <div class="metric">
                    <span>Total URLs Audited:</span>
                    <span class="metric-value">{{summary.totalUrls}}</span>
                </div>
                <div class="metric">
                    <span>Success Rate:</span>
                    <span class="metric-value {{getScoreClass summary.successRate}}">{{summary.successRate}}%</span>
                </div>
                <div class="metric">
                    <span>Overall Score:</span>
                    <span class="metric-value {{getScoreClass summary.auditScore}}">{{summary.auditScore}}/100</span>
                </div>
            </div>

            <div class="summary-card">
                <h3>🚨 Issues</h3>
                <div class="metric">
                    <span>Critical Issues:</span>
                    <span class="metric-value severity-error">{{summary.criticalIssues}}</span>
                </div>
                <div class="metric">
                    <span>Warnings:</span>
                    <span class="metric-value severity-warning">{{summary.totalWarnings}}</span>
                </div>
                <div class="metric">
                    <span>Avg Load Time:</span>
                    <span class="metric-value">{{summary.avgLoadTime}}ms</span>
                </div>
            </div>

            <div class="summary-card">
                <h3>🔗 Technical</h3>
                <div class="metric">
                    <span>Canonical Issues:</span>
                    <span class="metric-value">{{summary.canonicalIssues}}</span>
                </div>
                <div class="metric">
                    <span>Meta Tag Issues:</span>
                    <span class="metric-value">{{summary.metaTagIssues}}</span>
                </div>
                <div class="metric">
                    <span>Broken Links:</span>
                    <span class="metric-value">{{summary.brokenLinksCount}}</span>
                </div>
            </div>

            <div class="summary-card">
                <h3>📈 Content</h3>
                <div class="metric">
                    <span>Heading Issues:</span>
                    <span class="metric-value">{{summary.headingIssues}}</span>
                </div>
                <div class="metric">
                    <span>Redirects Found:</span>
                    <span class="metric-value">{{summary.redirectsCount}}</span>
                </div>
                <div class="metric">
                    <span>Pages with Canonical:</span>
                    <span class="metric-value">{{metrics.canonical.withCanonical}}</span>
                </div>
            </div>
        </div>

        {{#if issues.critical}}
        <div class="section">
            <div class="section-header">🚨 Critical Issues</div>
            <div class="section-content">
                <table class="table">
                    <thead>
                        <tr>
                            <th>URL</th>
                            <th>Issue Type</th>
                            <th>Message</th>
                        </tr>
                    </thead>
                    <tbody>
                        {{#each issues.critical}}
                        <tr>
                            <td class="url-cell">{{truncateUrl this.url 40}}</td>
                            <td><span class="badge badge-danger">{{this.type}}</span></td>
                            <td>{{this.message}}</td>
                        </tr>
                        {{/each}}
                    </tbody>
                </table>
            </div>
        </div>
        {{/if}}

        {{#if results.topPerforming}}
        <div class="section">
            <div class="section-header">🏆 Top Performing Pages</div>
            <div class="section-content">
                <table class="table">
                    <thead>
                        <tr>
                            <th>URL</th>
                            <th>Score</th>
                            <th>Load Time</th>
                            <th>Issues</th>
                        </tr>
                    </thead>
                    <tbody>
                        {{#each results.topPerforming}}
                        <tr>
                            <td class="url-cell">{{truncateUrl this.url 50}}</td>
                            <td><span class="metric-value {{getScoreClass this.auditScore}}">{{this.auditScore}}</span></td>
                            <td>{{this.loadTime}}ms</td>
                            <td>{{this.issues.length}}</td>
                        </tr>
                        {{/each}}
                    </tbody>
                </table>
            </div>
        </div>
        {{/if}}

        {{#if results.failedResults}}
        <div class="section">
            <div class="section-header">❌ Failed Audits</div>
            <div class="section-content">
                {{#if results.failedResults.length}}
                <table class="table">
                    <thead>
                        <tr>
                            <th>URL</th>
                            <th>Error</th>
                        </tr>
                    </thead>
                    <tbody>
                        {{#each results.failedResults}}
                        <tr>
                            <td class="url-cell">{{truncateUrl this.url 50}}</td>
                            <td class="severity-error">{{this.error}}</td>
                        </tr>
                        {{/each}}
                    </tbody>
                </table>
                {{else}}
                <div class="no-data">🎉 All audits completed successfully!</div>
                {{/if}}
            </div>
        </div>
        {{/if}}

        <div class="section">
            <div class="section-header">📊 Audit Summary</div>
            <div class="section-content">
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px;">
                    <div>
                        <h4>Meta Tags Coverage</h4>
                        <p>Title Tags: {{metrics.metaTags.titlePercentage}}%</p>
                        <p>Descriptions: {{metrics.metaTags.descriptionPercentage}}%</p>
                    </div>
                    <div>
                        <h4>Heading Structure</h4>
                        <p>Pages with H1: {{metrics.headings.h1Percentage}}%</p>
                        <p>Multiple H1s: {{metrics.headings.multipleH1}}</p>
                    </div>
                    <div>
                        <h4>Link Quality</h4>
                        <p>Total Links: {{formatNumber metrics.brokenLinks.totalLinks}}</p>
                        <p>Broken: {{metrics.brokenLinks.brokenPercentage}}%</p>
                    </div>
                    <div>
                        <h4>Structured Data</h4>
                        <p>Coverage: {{metrics.structuredData.percentage}}%</p>
                        <p>Total Schemas: {{metrics.structuredData.totalSchemas}}</p>
                    </div>
                </div>
            </div>
        </div>

        <div style="text-align: center; margin: 40px 0; color: #6c757d; font-size: 0.9rem;">
            <p>Generated by SEO Landing Page Auditor v2.0</p>
            <p>Report ID: {{summary.auditId}}</p>
        </div>
    </div>
</body>
</html>`;
  }

  generateFallbackHTML(data) {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>SEO Audit Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .header { background: #f0f0f0; padding: 20px; margin-bottom: 20px; }
        .section { margin-bottom: 30px; }
        .metric { display: flex; justify-content: space-between; margin-bottom: 10px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
    </style>
</head>
<body>
    <div class="header">
        <h1>SEO Audit Report</h1>
        <p>Landing Page: ${data.summary.landingUrl}</p>
        <p>Generated: ${data.summary.auditDate}</p>
    </div>
    
    <div class="section">
        <h2>Summary</h2>
        <div class="metric"><span>Total URLs:</span><span>${data.summary.totalUrls}</span></div>
        <div class="metric"><span>Success Rate:</span><span>${data.summary.successRate}%</span></div>
        <div class="metric"><span>Overall Score:</span><span>${data.summary.auditScore}/100</span></div>
        <div class="metric"><span>Critical Issues:</span><span>${data.summary.criticalIssues}</span></div>
    </div>

    <p><em>Full report template could not be loaded. This is a simplified version.</em></p>
</body>
</html>`;
  }
}

module.exports = HTMLReporter;
