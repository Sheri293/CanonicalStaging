const ExcelJS = require("exceljs");
const path = require("path");
const fs = require("fs-extra");
const Logger = require("../utils/Logger");

class ExcelReporter {
  constructor(config = {}) {
    this.config = {
      outputDir: config.outputDir || "./reports/excel",
      filename: config.filename || null,
      includeCharts: config.includeCharts !== false,
      ...config,
    };
    this.logger = new Logger("ExcelReporter");
  }

  async generate(auditResults, summary) {
    try {
      await fs.ensureDir(this.config.outputDir);

      const filename =
        this.config.filename ||
        `seo-audit-${summary.auditId}-${
          new Date().toISOString().split("T")[0]
        }.xlsx`;
      const filePath = path.join(this.config.outputDir, filename);

      const workbook = new ExcelJS.Workbook();

      workbook.creator = "SEO Landing Page Auditor";
      workbook.lastModifiedBy = "SEO Landing Page Auditor";
      workbook.created = new Date();
      workbook.modified = new Date();

      await this.createSummarySheet(workbook, summary);
      await this.createDetailedResultsSheet(workbook, auditResults);
      await this.createIssuesSheet(workbook, auditResults);
      await this.createCanonicalSheet(workbook, auditResults);
      await this.createMetaTagsSheet(workbook, auditResults);
      await this.createHeadingsSheet(workbook, auditResults);
      await this.createBrokenLinksSheet(workbook, auditResults);
      await this.createStructuredDataSheet(workbook, auditResults);

      if (auditResults.some((r) => r.performance)) {
        await this.createPerformanceSheet(workbook, auditResults);
      }

      if (auditResults.some((r) => r.accessibility)) {
        await this.createAccessibilitySheet(workbook, auditResults);
      }

      await workbook.xlsx.writeFile(filePath);

      this.logger.success(`Excel report generated: ${filePath}`);

      return {
        success: true,
        filePath,
        filename,
        size: (await fs.stat(filePath)).size,
      };
    } catch (error) {
      this.logger.error("Failed to generate Excel report", error);
      throw error;
    }
  }

  async createSummarySheet(workbook, summary) {
    const sheet = workbook.addWorksheet("Summary");

    sheet.mergeCells("A1:D1");
    sheet.getCell("A1").value = "SEO AUDIT SUMMARY";
    sheet.getCell("A1").font = { size: 18, bold: true };
    sheet.getCell("A1").alignment = { horizontal: "center" };

    const summaryData = [
      ["Audit ID", summary.auditId],
      ["Landing Page URL", summary.landingUrl],
      ["Audit Date", new Date(summary.startTime).toLocaleString()],
      ["Duration", this.formatDuration(summary.duration)],
      ["Total URLs Audited", summary.totalUrls],
      ["Successful Audits", summary.successfulAudits],
      ["Failed Audits", summary.failedAudits],
      ["Success Rate", `${summary.successRate}%`],
      ["Overall Score", `${summary.auditScore}/100`],
      ["Critical Issues", summary.criticalIssues],
      ["Total Warnings", summary.totalWarnings],
      ["Canonical Issues", summary.canonicalIssues],
      ["Meta Tag Issues", summary.metaTagIssues],
      ["Heading Issues", summary.headingIssues],
      ["Broken Links", summary.brokenLinksCount],
      ["Redirects Found", summary.redirectsCount],
      ["Average Load Time", `${summary.avgLoadTime}ms`],
    ];

    summaryData.forEach((row, index) => {
      const rowNum = index + 3;
      sheet.getCell(`A${rowNum}`).value = row[0];
      sheet.getCell(`B${rowNum}`).value = row[1];
      sheet.getCell(`A${rowNum}`).font = { bold: true };
    });

    sheet.getColumn("A").width = 25;
    sheet.getColumn("B").width = 30;

    const scoreCell = sheet.getCell("B11");
    if (summary.auditScore >= 80) {
      scoreCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF90EE90" },
      };
    } else if (summary.auditScore >= 60) {
      scoreCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFFFF00" },
      };
    } else {
      scoreCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFF6B6B" },
      };
    }

    const criticalIssuesCell = sheet.getCell("B12");
    if (summary.criticalIssues > 0) {
      criticalIssuesCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFF6B6B" },
      };
    } else {
      criticalIssuesCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF90EE90" },
      };
    }
  }

  async createDetailedResultsSheet(workbook, auditResults) {
    const sheet = workbook.addWorksheet("Detailed Results");

    const headers = [
      "URL",
      "Status",
      "Status Code",
      "Load Time (ms)",
      "Audit Score",
      "Critical Issues",
      "Warnings",
      "Has Canonical",
      "Has Meta Description",
      "H1 Count",
      "Broken Links",
      "Redirects",
      "Structured Data",
    ];

    headers.forEach((header, index) => {
      const cell = sheet.getCell(1, index + 1);
      cell.value = header;
      cell.font = { bold: true };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE0E0E0" },
      };
    });

    auditResults.forEach((result, index) => {
      const row = index + 2;
      sheet.getCell(row, 1).value = result.url;
      sheet.getCell(row, 2).value = result.success ? "Success" : "Failed";
      sheet.getCell(row, 3).value = result.statusCode || "N/A";
      sheet.getCell(row, 4).value = result.loadTime || 0;
      sheet.getCell(row, 5).value = result.auditScore || 0;
      sheet.getCell(row, 6).value =
        result.issues?.filter((i) => i.severity === "error").length || 0;
      sheet.getCell(row, 7).value = result.warnings?.length || 0;
      sheet.getCell(row, 8).value = result.canonical?.hasCanonical
        ? "Yes"
        : "No";
      sheet.getCell(row, 9).value = result.metaTags?.description ? "Yes" : "No";
      sheet.getCell(row, 10).value = result.headings?.h1Count || 0;
      sheet.getCell(row, 11).value = result.brokenLinks?.length || 0;
      sheet.getCell(row, 12).value = result.redirects?.length || 0;
      sheet.getCell(row, 13).value = result.structuredData?.length || 0;

      if (!result.success) {
        for (let col = 1; col <= headers.length; col++) {
          sheet.getCell(row, col).fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFFFE0E0" },
          };
        }
      }

      const scoreCell = sheet.getCell(row, 5);
      const score = result.auditScore || 0;
      if (score >= 80) {
        scoreCell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF90EE90" },
        };
      } else if (score >= 60) {
        scoreCell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFFFF00" },
        };
      } else {
        scoreCell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFF6B6B" },
        };
      }
    });

    this.autoSizeColumns(sheet);
    this.addAutoFilter(sheet, headers.length, auditResults.length + 1);
  }

  async createIssuesSheet(workbook, auditResults) {
    const sheet = workbook.addWorksheet("Issues & Warnings");

    const headers = [
      "URL",
      "Type",
      "Severity",
      "Category",
      "Message",
      "Details",
    ];

    headers.forEach((header, index) => {
      const cell = sheet.getCell(1, index + 1);
      cell.value = header;
      cell.font = { bold: true };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE0E0E0" },
      };
    });

    let rowIndex = 2;

    auditResults.forEach((result) => {
      if (result.issues) {
        result.issues.forEach((issue) => {
          sheet.getCell(rowIndex, 1).value = result.url;
          sheet.getCell(rowIndex, 2).value = issue.type;
          sheet.getCell(rowIndex, 3).value = issue.severity;
          sheet.getCell(rowIndex, 4).value = this.getCategoryFromType(
            issue.type
          );
          sheet.getCell(rowIndex, 5).value = issue.message;
          sheet.getCell(rowIndex, 6).value = JSON.stringify(
            issue.details || {}
          );

          if (issue.severity === "error") {
            for (let col = 1; col <= headers.length; col++) {
              sheet.getCell(rowIndex, col).fill = {
                type: "pattern",
                pattern: "solid",
                fgColor: { argb: "FFFFE0E0" },
              };
            }
          }

          rowIndex++;
        });
      }

      if (result.warnings) {
        result.warnings.forEach((warning) => {
          sheet.getCell(rowIndex, 1).value = result.url;
          sheet.getCell(rowIndex, 2).value = warning.type;
          sheet.getCell(rowIndex, 3).value = warning.severity || "warning";
          sheet.getCell(rowIndex, 4).value = this.getCategoryFromType(
            warning.type
          );
          sheet.getCell(rowIndex, 5).value = warning.message;
          sheet.getCell(rowIndex, 6).value = JSON.stringify(
            warning.details || {}
          );

          for (let col = 1; col <= headers.length; col++) {
            sheet.getCell(rowIndex, col).fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFFFFF00" },
            };
          }

          rowIndex++;
        });
      }
    });

    this.autoSizeColumns(sheet);
    this.addAutoFilter(sheet, headers.length, rowIndex - 1);
  }

  async createCanonicalSheet(workbook, auditResults) {
    const sheet = workbook.addWorksheet("Canonical URLs");

    const headers = [
      "URL",
      "Has Canonical",
      "Canonical URL",
      "Issues",
      "Score",
    ];

    headers.forEach((header, index) => {
      const cell = sheet.getCell(1, index + 1);
      cell.value = header;
      cell.font = { bold: true };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE0E0E0" },
      };
    });

    auditResults.forEach((result, index) => {
      if (result.canonical) {
        const row = index + 2;
        sheet.getCell(row, 1).value = result.url;
        sheet.getCell(row, 2).value = result.canonical.hasCanonical
          ? "Yes"
          : "No";
        sheet.getCell(row, 3).value = result.canonical.canonical || "None";
        sheet.getCell(row, 4).value = result.canonical.issues?.length || 0;
        sheet.getCell(row, 5).value = result.canonical.score || 0;

        if (!result.canonical.hasCanonical) {
          for (let col = 1; col <= headers.length; col++) {
            sheet.getCell(row, col).fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFFFE0E0" },
            };
          }
        }
      }
    });

    this.autoSizeColumns(sheet);
  }

  async createMetaTagsSheet(workbook, auditResults) {
    const sheet = workbook.addWorksheet("Meta Tags");

    const headers = [
      "URL",
      "Title",
      "Title Length",
      "Description",
      "Description Length",
      "Viewport",
      "Open Graph",
      "Twitter Cards",
      "Issues",
      "Score",
    ];

    headers.forEach((header, index) => {
      const cell = sheet.getCell(1, index + 1);
      cell.value = header;
      cell.font = { bold: true };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE0E0E0" },
      };
    });

    auditResults.forEach((result, index) => {
      if (result.metaTags) {
        const row = index + 2;
        const meta = result.metaTags;

        sheet.getCell(row, 1).value = result.url;
        sheet.getCell(row, 2).value = meta.title || "Missing";
        sheet.getCell(row, 3).value = meta.title ? meta.title.length : 0;
        sheet.getCell(row, 4).value = meta.description || "Missing";
        sheet.getCell(row, 5).value = meta.description
          ? meta.description.length
          : 0;
        sheet.getCell(row, 6).value = meta.viewport || "Missing";
        sheet.getCell(row, 7).value = meta.openGraph?.title ? "Yes" : "No";
        sheet.getCell(row, 8).value = meta.twitter?.card ? "Yes" : "No";
        sheet.getCell(row, 9).value = meta.issues?.length || 0;
        sheet.getCell(row, 10).value = meta.score || 0;

        if (!meta.title || !meta.description) {
          for (let col = 1; col <= headers.length; col++) {
            sheet.getCell(row, col).fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFFFE0E0" },
            };
          }
        }

        const titleLengthCell = sheet.getCell(row, 3);
        const titleLength = meta.title ? meta.title.length : 0;
        if (titleLength < 30 || titleLength > 60) {
          titleLengthCell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFFFFF00" },
          };
        }

        const descLengthCell = sheet.getCell(row, 5);
        const descLength = meta.description ? meta.description.length : 0;
        if (descLength < 120 || descLength > 160) {
          descLengthCell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFFFFF00" },
          };
        }
      }
    });

    this.autoSizeColumns(sheet);
  }

  async createHeadingsSheet(workbook, auditResults) {
    const sheet = workbook.addWorksheet("Headings");

    const headers = [
      "URL",
      "H1 Count",
      "H2 Count",
      "H3 Count",
      "H4 Count",
      "H5 Count",
      "H6 Count",
      "Total Headings",
      "Issues",
      "Score",
    ];

    headers.forEach((header, index) => {
      const cell = sheet.getCell(1, index + 1);
      cell.value = header;
      cell.font = { bold: true };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE0E0E0" },
      };
    });

    auditResults.forEach((result, index) => {
      if (result.headings) {
        const row = index + 2;
        const headings = result.headings;

        sheet.getCell(row, 1).value = result.url;
        sheet.getCell(row, 2).value = headings.h1Count || 0;

        for (let level = 2; level <= 6; level++) {
          const count =
            headings.headings?.filter((h) => h.level === level).length || 0;
          sheet.getCell(row, level + 1).value = count;
        }

        sheet.getCell(row, 8).value = headings.totalHeadings || 0;
        sheet.getCell(row, 9).value = headings.issues?.length || 0;
        sheet.getCell(row, 10).value = headings.score || 0;

        const h1Cell = sheet.getCell(row, 2);
        if (headings.h1Count === 0) {
          h1Cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFFF6B6B" },
          };
        } else if (headings.h1Count > 1) {
          h1Cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFFFFF00" },
          };
        } else {
          h1Cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FF90EE90" },
          };
        }
      }
    });

    this.autoSizeColumns(sheet);
  }

  async createBrokenLinksSheet(workbook, auditResults) {
    const sheet = workbook.addWorksheet("Broken Links");

    const headers = [
      "URL",
      "Total Links",
      "Broken Links",
      "Working Links",
      "External Links",
      "Internal Links",
      "Details",
    ];

    headers.forEach((header, index) => {
      const cell = sheet.getCell(1, index + 1);
      cell.value = header;
      cell.font = { bold: true };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE0E0E0" },
      };
    });

    auditResults.forEach((result, index) => {
      if (result.brokenLinks !== undefined) {
        const row = index + 2;

        sheet.getCell(row, 1).value = result.url;
        sheet.getCell(row, 2).value = result.brokenLinks.totalLinks || 0;
        sheet.getCell(row, 3).value = result.brokenLinks.brokenLinks || 0;
        sheet.getCell(row, 4).value = result.brokenLinks.workingLinks || 0;
        sheet.getCell(row, 5).value = result.brokenLinks.externalLinks || 0;
        sheet.getCell(row, 6).value = result.brokenLinks.internalLinks || 0;

        const brokenLinksList =
          result.brokenLinks.links?.filter((link) => link.isBroken) || [];
        sheet.getCell(row, 7).value = brokenLinksList
          .map((link) => `${link.url} (${link.error})`)
          .join("; ");

        if (result.brokenLinks.brokenLinks > 0) {
          for (let col = 1; col <= headers.length; col++) {
            sheet.getCell(row, col).fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFFFE0E0" },
            };
          }
        }
      }
    });

    this.autoSizeColumns(sheet);
  }

  async createStructuredDataSheet(workbook, auditResults) {
    const sheet = workbook.addWorksheet("Structured Data");

    const headers = [
      "URL",
      "Has Structured Data",
      "JSON-LD Count",
      "Microdata Count",
      "RDFa Count",
      "Schema Types",
      "Issues",
      "Score",
    ];

    headers.forEach((header, index) => {
      const cell = sheet.getCell(1, index + 1);
      cell.value = header;
      cell.font = { bold: true };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE0E0E0" },
      };
    });

    auditResults.forEach((result, index) => {
      if (result.structuredData !== undefined) {
        const row = index + 2;
        const structured = result.structuredData;

        sheet.getCell(row, 1).value = result.url;
        sheet.getCell(row, 2).value = structured.hasStructuredData
          ? "Yes"
          : "No";
        sheet.getCell(row, 3).value = structured.jsonLd?.length || 0;
        sheet.getCell(row, 4).value = structured.microdata?.length || 0;
        sheet.getCell(row, 5).value = structured.rdfa?.length || 0;

        const schemaTypes = [];
        if (structured.jsonLd) {
          structured.jsonLd.forEach((schema) => {
            if (schema.type && schema.type !== "Unknown") {
              schemaTypes.push(schema.type);
            }
          });
        }
        sheet.getCell(row, 6).value = schemaTypes.join(", ");

        sheet.getCell(row, 7).value = structured.issues?.length || 0;
        sheet.getCell(row, 8).value = structured.score || 0;

        if (!structured.hasStructuredData) {
          for (let col = 1; col <= headers.length; col++) {
            sheet.getCell(row, col).fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFFFFF00" },
            };
          }
        }
      }
    });

    this.autoSizeColumns(sheet);
  }

  async createPerformanceSheet(workbook, auditResults) {
    const sheet = workbook.addWorksheet("Performance");

    const headers = [
      "URL",
      "FCP (ms)",
      "LCP (ms)",
      "CLS",
      "FID (ms)",
      "TTFB (ms)",
      "DOM Content Loaded (ms)",
      "Load Complete (ms)",
      "Total Requests",
      "Score",
    ];

    headers.forEach((header, index) => {
      const cell = sheet.getCell(1, index + 1);
      cell.value = header;
      cell.font = { bold: true };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE0E0E0" },
      };
    });

    auditResults.forEach((result, index) => {
      if (result.performance) {
        const row = index + 2;
        const perf = result.performance;

        sheet.getCell(row, 1).value = result.url;
        sheet.getCell(row, 2).value = Math.round(perf.coreWebVitals?.fcp || 0);
        sheet.getCell(row, 3).value = Math.round(perf.coreWebVitals?.lcp || 0);
        sheet.getCell(row, 4).value = parseFloat(
          (perf.coreWebVitals?.cls || 0).toFixed(3)
        );
        sheet.getCell(row, 5).value = Math.round(perf.coreWebVitals?.fid || 0);
        sheet.getCell(row, 6).value = Math.round(perf.coreWebVitals?.ttfb || 0);
        sheet.getCell(row, 7).value = Math.round(
          perf.loadTimes?.domContentLoaded || 0
        );
        sheet.getCell(row, 8).value = Math.round(
          perf.loadTimes?.loadComplete || 0
        );
        sheet.getCell(row, 9).value = perf.resources?.totalRequests || 0;
        sheet.getCell(row, 10).value = perf.score || 0;

        this.applyPerformanceColors(sheet, row, perf);
      }
    });

    this.autoSizeColumns(sheet);
  }

  async createAccessibilitySheet(workbook, auditResults) {
    const sheet = workbook.addWorksheet("Accessibility");

    const headers = [
      "URL",
      "Images without Alt",
      "Empty Links",
      "Form Issues",
      "Heading Issues",
      "Color Issues",
      "ARIA Elements",
      "Score",
    ];

    headers.forEach((header, index) => {
      const cell = sheet.getCell(1, index + 1);
      cell.value = header;
      cell.font = { bold: true };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE0E0E0" },
      };
    });

    auditResults.forEach((result, index) => {
      if (result.accessibility) {
        const row = index + 2;
        const a11y = result.accessibility;

        sheet.getCell(row, 1).value = result.url;
        sheet.getCell(row, 2).value =
          a11y.images?.filter((img) => !img.hasAlt).length || 0;
        sheet.getCell(row, 3).value =
          a11y.links?.filter((link) => link.isEmpty).length || 0;
        sheet.getCell(row, 4).value = this.countFormIssues(a11y.forms || []);
        sheet.getCell(row, 5).value =
          a11y.headings?.filter((h) => h.isEmpty).length || 0;
        sheet.getCell(row, 6).value = "Manual Check Required";
        sheet.getCell(row, 7).value = a11y.aria?.length || 0;
        sheet.getCell(row, 8).value = a11y.score || 0;

        if (a11y.score < 80) {
          for (let col = 1; col <= headers.length; col++) {
            sheet.getCell(row, col).fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFFFFF00" },
            };
          }
        }
      }
    });

    this.autoSizeColumns(sheet);
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
    };
    return categories[type] || "Other";
  }

  applyPerformanceColors(sheet, row, perf) {
    const fcpCell = sheet.getCell(row, 2);
    const fcp = perf.coreWebVitals?.fcp || 0;
    if (fcp > 2500) {
      fcpCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFF6B6B" },
      };
    } else if (fcp > 1800) {
      fcpCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFFFF00" },
      };
    } else {
      fcpCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF90EE90" },
      };
    }

    const lcpCell = sheet.getCell(row, 3);
    const lcp = perf.coreWebVitals?.lcp || 0;
    if (lcp > 4000) {
      lcpCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFF6B6B" },
      };
    } else if (lcp > 2500) {
      lcpCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFFFF00" },
      };
    } else {
      lcpCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF90EE90" },
      };
    }

    const clsCell = sheet.getCell(row, 4);
    const cls = perf.coreWebVitals?.cls || 0;
    if (cls > 0.25) {
      clsCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFF6B6B" },
      };
    } else if (cls > 0.1) {
      clsCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFFFF00" },
      };
    } else {
      clsCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF90EE90" },
      };
    }
  }

  countFormIssues(forms) {
    let issues = 0;
    forms.forEach((form) => {
      issues +=
        form.inputs?.filter((input) => !input.hasLabel && !input.ariaLabel)
          .length || 0;
    });
    return issues;
  }

  autoSizeColumns(sheet) {
    sheet.columns.forEach((column) => {
      let maxLength = 0;
      column.eachCell({ includeEmpty: true }, (cell) => {
        const columnLength = cell.value ? cell.value.toString().length : 10;
        if (columnLength > maxLength) {
          maxLength = columnLength;
        }
      });
      column.width = Math.min(maxLength + 2, 50);
    });
  }

  addAutoFilter(sheet, columnCount, rowCount) {
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: rowCount, column: columnCount },
    };
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
}

module.exports = ExcelReporter;
