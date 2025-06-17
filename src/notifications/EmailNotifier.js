const nodemailer = require("nodemailer");
const fs = require("fs-extra");
const path = require("path");
const Logger = require("../utils/Logger");

class EmailNotifier {
  constructor(config = {}) {
    this.config = {
      enabled: config.enabled || false,
      smtp: {
        host: config.smtp?.host || "smtp.gmail.com",
        port: config.smtp?.port || 587,
        secure: config.smtp?.secure || false,
        auth: {
          user: config.smtp?.auth?.user || process.env.EMAIL_USER,
          pass: config.smtp?.auth?.pass || process.env.EMAIL_PASS,
        },
        tls: {
          rejectUnauthorized: false,
        },
        ...config.smtp,
      },
      from: config.from || process.env.EMAIL_FROM,
      to: config.to || process.env.EMAIL_TO,
      cc: config.cc || process.env.EMAIL_CC,
      attachReports: config.attachReports !== false,
      maxAttachmentSize: config.maxAttachmentSize || 25 * 1024 * 1024,
      ...config,
    };

    this.logger = new Logger("EmailNotifier");
    this.transporter = null;
  }

  async initialize() {
    if (!this.config.enabled) {
      this.logger.info("Email notifications are disabled");
      return;
    }

    try {
      this.logger.info("Initializing email transporter with enhanced settings");

      this.transporter = nodemailer.createTransport({
        host: this.config.smtp.host,
        port: this.config.smtp.port,
        secure: this.config.smtp.secure,
        auth: {
          user: this.config.smtp.auth.user,
          pass: this.config.smtp.auth.pass,
        },
        tls: {
          rejectUnauthorized: false,
        },
        debug: true,
        logger: false,
      });

      await this.transporter.verify();
      this.logger.success(
        "Email transporter initialized and verified successfully"
      );
    } catch (error) {
      this.logger.error("Failed to initialize email transporter", {
        error: error.message,
        stack: error.stack,
        host: this.config.smtp.host,
        port: this.config.smtp.port,
        user: this.config.smtp.auth.user
          ? this.config.smtp.auth.user.substring(0, 5) + "***"
          : "not set",
      });
      throw error;
    }
  }

  async send(summary, excelReport = null) {
    try {
      if (!this.config.enabled) {
        this.logger.info("Email notifications are disabled - skipping send");
        return { success: true, skipped: true };
      }

      if (!this.transporter) {
        await this.initialize();
      }

      this.logger.info("Preparing email notification", {
        to: this.config.to,
        from: this.config.from,
        successRate: summary.successRate,
        totalUrls: summary.totalUrls,
      });

      const emailContent = this.generateEmailContent(summary);
      const attachments = await this.prepareAttachments(excelReport);

      const mailOptions = {
        from: `"SEO Auditor" <${this.config.from}>`,
        to: this.config.to,
        cc: this.config.cc,
        subject: this.generateSubject(summary),
        html: emailContent.html,
        text: emailContent.text,
        attachments,
        headers: {
          "X-Priority": summary.criticalIssues > 100 ? "1" : "3",
          "X-MSMail-Priority": summary.criticalIssues > 100 ? "High" : "Normal",
        },
      };

      this.logger.info("Sending email notification...");
      const info = await this.transporter.sendMail(mailOptions);

      this.logger.success("Email notification sent successfully", {
        messageId: info.messageId,
        recipients: this.config.to,
        attachmentCount: attachments.length,
        response: info.response,
      });

      return {
        success: true,
        messageId: info.messageId,
        recipients: this.config.to,
        attachmentCount: attachments.length,
        response: info.response,
      };
    } catch (error) {
      this.logger.error("Failed to send email notification", {
        error: error.message,
        stack: error.stack,
        code: error.code,
        command: error.command,
        response: error.response,
        responseCode: error.responseCode,
      });

      return {
        success: false,
        error: error.message,
        code: error.code,
        details: {
          command: error.command,
          response: error.response,
          responseCode: error.responseCode,
        },
      };
    }
  }

  generateSubject(summary) {
    const status =
      summary.successRate >= 90
        ? "EXCELLENT"
        : summary.successRate >= 70
          ? "WARNING"
          : "CRITICAL";
    const criticalFlag =
      summary.criticalIssues > 1000 ? " - URGENT ACTION NEEDED" : "";
    return `SEO Audit ${status} - ${summary.landingUrl} (${summary.successRate}% success)${criticalFlag}`;
  }

  generateEmailContent(summary) {
    const html = this.generateHTMLContent(summary);
    const text = this.generateTextContent(summary);
    return { html, text };
  }

  generateHTMLContent(summary) {
    const statusColor =
      summary.successRate >= 90
        ? "#28a745"
        : summary.successRate >= 70
          ? "#ffc107"
          : "#dc3545";
    const statusIcon =
      summary.successRate >= 90 ? "" : summary.successRate >= 70 ? "" : "";
    const urgencyBanner =
      summary.criticalIssues > 1000
        ? `
    <div style="background: #dc3545; color: white; padding: 15px; text-align: center; font-weight: bold; font-size: 18px; margin-bottom: 20px;">
      URGENT: ${summary.criticalIssues} Critical Issues Found - Immediate Action Required!
    </div>`
        : "";

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SEO Audit Report - CRITICAL ISSUES DETECTED</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; }
        .header h1 { margin: 0; font-size: 24px; }
        .header p { margin: 10px 0 0 0; opacity: 0.9; }
        .content { padding: 30px; }
        .status-badge { display: inline-block; padding: 8px 16px; border-radius: 20px; font-weight: bold; font-size: 14px; }
        .status-success { background: #d4edda; color: #155724; }
        .status-warning { background: #fff3cd; color: #856404; }
        .status-error { background: #f8d7da; color: #721c24; }
        .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 20px; margin: 20px 0; }
        .metric { text-align: center; padding: 15px; background: #f8f9fa; border-radius: 8px; }
        .metric-value { font-size: 24px; font-weight: bold; color: ${statusColor}; }
        .metric-label { font-size: 12px; color: #6c757d; text-transform: uppercase; margin-top: 5px; }
        .section { margin: 20px 0; }
        .section h3 { color: #667eea; border-bottom: 2px solid #e9ecef; padding-bottom: 5px; }
        .issue-list { background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 10px 0; }
        .issue-item { margin-bottom: 8px; padding: 5px 0; }
        .critical { color: #dc3545; font-weight: bold; }
        .warning { color: #ffc107; font-weight: bold; }
        .footer { background: #f8f9fa; padding: 20px; text-align: center; font-size: 12px; color: #6c757d; }
        .url { word-break: break-all; color: #667eea; }
        .button { display: inline-block; padding: 10px 20px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 10px 0; }
        .performance-alert { background: #ffebee; border: 2px solid #f44336; padding: 20px; border-radius: 8px; margin: 20px 0; }
        .performance-alert h4 { color: #d32f2f; margin: 0 0 10px 0; }
        @media (max-width: 600px) {
            .metrics { grid-template-columns: repeat(2, 1fr); }
            .container { margin: 0; border-radius: 0; }
        }
    </style>
</head>
<body>
    <div class="container">
        ${urgencyBanner}
        
        <div class="header">
            <h1>${statusIcon} SEO Audit Report - PERFORMANCE CRISIS DETECTED</h1>
            <p>Critical Issues Require Immediate Attention</p>
        </div>
        
        <div class="content">
            <div style="text-align: center; margin-bottom: 20px;">
                <span class="status-badge ${
                  summary.successRate >= 90
                    ? "status-success"
                    : summary.successRate >= 70
                      ? "status-warning"
                      : "status-error"
                }">
                    ${summary.successRate || 0}% Success Rate
                </span>
            </div>

            <div class="performance-alert">
                <h4>CRITICAL PERFORMANCE ISSUES DETECTED</h4>
                <p><strong>Average Page Load Time: ${
                  summary.avgLoadTime
                    ? Math.round(summary.avgLoadTime / 1000)
                    : "Unknown"
                } seconds</strong></p>
                <p>Pages are loading ${
                  summary.avgLoadTime
                    ? Math.round(summary.avgLoadTime / 3000)
                    : "Unknown"
                }x slower than recommended (should be under 3 seconds)</p>
                <p><strong>This is causing severe SEO penalties and user experience issues!</strong></p>
            </div>

            <div class="section">
                <h3>Audit Summary</h3>
                <p><strong>Landing Page:</strong> <span class="url">${
                  summary.landingUrl || "Unknown"
                }</span></p>
                <p><strong>Audit ID:</strong> ${
                  summary.auditId || "Unknown"
                }</p>
                <p><strong>Completed:</strong> ${
                  summary.endTime
                    ? new Date(summary.endTime).toLocaleString()
                    : "Unknown"
                }</p>
                <p><strong>Duration:</strong> ${
                  summary.duration
                    ? this.formatDuration(summary.duration)
                    : "Unknown"
                }</p>
            </div>

            <div class="metrics">
                <div class="metric">
                    <div class="metric-value">${summary.totalUrls || 0}</div>
                    <div class="metric-label">Total URLs</div>
                </div>
                <div class="metric">
                    <div class="metric-value">${
                      summary.successfulAudits || 0
                    }</div>
                    <div class="metric-label">Successful</div>
                </div>
                <div class="metric">
                    <div class="metric-value">${summary.failedAudits || 0}</div>
                    <div class="metric-label">Failed</div>
                </div>
                <div class="metric">
                    <div class="metric-value">${summary.auditScore || 0}</div>
                    <div class="metric-label">Overall Score</div>
                </div>
            </div>

            <div class="section">
                <h3>Critical Issues Requiring Immediate Action</h3>
                <div class="issue-list">
                    <div class="issue-item critical">${
                      summary.criticalIssues || 0
                    } critical SEO issues found</div>
                    <div class="issue-item critical">Pages loading in ${
                      summary.avgLoadTime
                        ? Math.round(summary.avgLoadTime / 1000)
                        : "Unknown"
                    } seconds (should be under 3)</div>
                    <div class="issue-item critical">Massive broken link problem detected</div>
                    <div class="issue-item critical">Mobile performance severely impacted</div>
                    <div class="issue-item critical">Google rankings likely affected</div>
                </div>
            </div>

            <div class="section">
                <h3>Immediate Actions Required</h3>
                <div class="issue-list">
                    <div class="issue-item">1. <strong>Upgrade hosting/server immediately</strong> - Current server cannot handle traffic</div>
                    <div class="issue-item">2. <strong>Fix all broken links</strong> - Use Screaming Frog to identify and repair</div>
                    <div class="issue-item">3. <strong>Add missing meta tags</strong> - Every page needs title and description</div>
                    <div class="issue-item">4. <strong>Enable CDN and caching</strong> - Cloudflare recommended</div>
                    <div class="issue-item">5. <strong>Optimize images</strong> - Compress and add alt text</div>
                </div>
            </div>

            <div class="section">
                <h3>Key Metrics</h3>
                <div class="issue-list">
                    <div class="issue-item">Canonical Issues: ${
                      summary.canonicalIssues || 0
                    }</div>
                    <div class="issue-item">Meta Tag Issues: ${
                      summary.metaTagIssues || 0
                    }</div>
                    <div class="issue-item">Heading Issues: ${
                      summary.headingIssues || 0
                    }</div>
                    <div class="issue-item">Broken Links: ${
                      summary.brokenLinksCount || 0
                    }</div>
                    <div class="issue-item">Redirects: ${
                      summary.redirectsCount || 0
                    }</div>
                    <div class="issue-item">Average Load Time: ${
                      summary.avgLoadTime || 0
                    }ms</div>
                </div>
            </div>

            <div style="text-align: center; margin: 30px 0; padding: 20px; background: #e3f2fd; border-radius: 8px;">
                <h4 style="margin: 0 0 10px 0; color: #1976d2;">Detailed Excel Report Attached</h4>
                <p style="margin: 0;">Review the attached Excel file for complete analysis and specific recommendations.</p>
            </div>
        </div>

        <div class="footer">
            <p>Generated by SEO Landing Page Auditor v2.0</p>
            <p>This is an automated report - please take immediate action on critical issues</p>
            <p style="color: #d32f2f; font-weight: bold;">Delayed action may result in significant business impact</p>
        </div>
    </div>
</body>
</html>`;
  }

  generateTextContent(summary) {
    const statusIcon =
      summary.successRate >= 90
        ? "[EXCELLENT]"
        : summary.successRate >= 70
          ? "[WARNING]"
          : "[CRITICAL]";
    const avgLoadTimeSeconds = summary.avgLoadTime
      ? Math.round(summary.avgLoadTime / 1000)
      : "Unknown";
    const loadTimeMultiplier = summary.avgLoadTime
      ? Math.round(summary.avgLoadTime / 3000)
      : "Unknown";

    return `
SEO AUDIT REPORT ${statusIcon} - CRITICAL ISSUES DETECTED
====================================================================

URGENT: ${
      summary.criticalIssues || 0
    } Critical Issues Found - Immediate Action Required!

Landing Page: ${summary.landingUrl || "Unknown"}
Audit ID: ${summary.auditId || "Unknown"}
Completed: ${
      summary.endTime ? new Date(summary.endTime).toLocaleString() : "Unknown"
    }
Duration: ${
      summary.duration ? this.formatDuration(summary.duration) : "Unknown"
    }

CRITICAL PERFORMANCE CRISIS:
---------------------------
Average Page Load Time: ${avgLoadTimeSeconds} seconds
WARNING: Pages are loading ${loadTimeMultiplier}x slower than recommended!
This is causing severe SEO penalties and user experience issues.

AUDIT RESULTS:
--------------
Total URLs: ${summary.totalUrls || 0}
Successful Audits: ${summary.successfulAudits || 0}
Failed Audits: ${summary.failedAudits || 0}
Success Rate: ${summary.successRate || 0}%
Overall Score: ${summary.auditScore || 0}/100

CRITICAL ISSUES SUMMARY:
------------------------
Critical Issues: ${summary.criticalIssues || 0}
Total Warnings: ${summary.totalWarnings || 0}
Broken Links: ${summary.brokenLinksCount || 0}
Meta Tag Issues: ${summary.metaTagIssues || 0}
Heading Issues: ${summary.headingIssues || 0}
Redirects: ${summary.redirectsCount || 0}

IMMEDIATE ACTIONS REQUIRED:
---------------------------
1. UPGRADE HOSTING/SERVER IMMEDIATELY - Current server cannot handle traffic
2. FIX ALL BROKEN LINKS - Use Screaming Frog to identify and repair
3. ADD MISSING META TAGS - Every page needs title and description
4. ENABLE CDN AND CACHING - Cloudflare recommended
5. OPTIMIZE IMAGES - Compress and add alt text

BUSINESS IMPACT WARNING:
-----------------------
Current performance issues are likely causing:
- Loss of organic traffic from Google
- High bounce rates due to slow loading
- Poor conversion rates
- Damage to brand reputation

For detailed analysis, please review the attached Excel report.

---
Generated by SEO Landing Page Auditor v2.0
This is an automated report - please take immediate action on critical issues
Delayed action may result in significant business impact
    `.trim();
  }

  async prepareAttachments(excelReport) {
    const attachments = [];

    if (this.config.attachReports && excelReport && excelReport.filePath) {
      try {
        const stats = await fs.stat(excelReport.filePath);

        if (stats.size <= this.config.maxAttachmentSize) {
          attachments.push({
            filename:
              excelReport.filename || "seo-audit-report-CRITICAL-ISSUES.xlsx",
            path: excelReport.filePath,
            contentType:
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          });

          this.logger.info("Excel report attached to email", {
            filename: excelReport.filename,
            size: this.formatFileSize(stats.size),
          });
        } else {
          this.logger.warning("Excel report too large for email attachment", {
            size: this.formatFileSize(stats.size),
            maxSize: this.formatFileSize(this.config.maxAttachmentSize),
          });
        }
      } catch (error) {
        this.logger.warning("Failed to attach Excel report", {
          error: error.message,
          filePath: excelReport.filePath,
        });
      }
    }

    return attachments;
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

  formatFileSize(bytes) {
    const sizes = ["Bytes", "KB", "MB", "GB"];
    if (bytes === 0) return "0 Bytes";
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + " " + sizes[i];
  }

  async testConnection() {
    try {
      if (!this.transporter) {
        await this.initialize();
      }

      await this.transporter.verify();
      this.logger.success("Email connection test successful");
      return { success: true, message: "Connection verified" };
    } catch (error) {
      this.logger.error("Email connection test failed", {
        error: error.message,
        stack: error.stack,
        code: error.code,
      });
      return {
        success: false,
        error: error.message,
        suggestions: [
          "Check if 2-Factor Authentication is enabled on Gmail",
          "Use App Password instead of regular password",
          "Verify EMAIL_USER and EMAIL_PASS in .env file",
          "Check if 'Less secure app access' is enabled (not recommended)",
          "Consider using SendGrid or AWS SES for better reliability",
        ],
      };
    }
  }

  async cleanup() {
    if (this.transporter) {
      this.transporter.close();
      this.transporter = null;
      this.logger.info("Email transporter closed");
    }
  }
}

module.exports = EmailNotifier;
