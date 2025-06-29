import ExcelJS from "exceljs";
import path from "path";
import fs from "fs-extra";
import Logger from "../utils/Logger.js";

class ExcelReporter {
  static COLORS = {
    EXCELLENT: "FF90EE90",
    WARNING: "FFFFFF00",
    ERROR: "FFFF6B6B",
    CRITICAL: "FFFF0000",
    SAFE: "FFE8F5E8",
    HEADER: "FFE0E0E0",
    FAILED: "FFFFE0E0",
  };

  static THRESHOLDS = {
    TITLE: { MIN: 30, MAX: 60 },
    DESCRIPTION: { MIN: 120, MAX: 160 },
    PERFORMANCE: {
      FCP: { GOOD: 1800, POOR: 2500 },
      LCP: { GOOD: 2500, POOR: 4000 },
      CLS: { GOOD: 0.1, POOR: 0.25 },
    },
    SCORE: { GOOD: 80, FAIR: 60 },
    VISUAL_DIFF: { MINOR: 20, MAJOR: 50 },
  };

  static CATEGORIES = {
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

  constructor(config = {}) {
    this.config = {
      outputDir: "./reports/excel",
      filename: null,
      includeCharts: true,
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

      const workbook = this.createWorkbook();

      await Promise.all([
        this.createSummarySheet(workbook, summary),
        this.createDetailedResultsSheet(workbook, auditResults),
        this.createIssuesSheet(workbook, auditResults),
        this.createCanonicalSheet(workbook, auditResults),
        this.createMetaTagsSheet(workbook, auditResults),
        this.createHeadingsSheet(workbook, auditResults),
        this.createBrokenLinksSheet(workbook, auditResults),
        this.createStructuredDataSheet(workbook, auditResults),
      ]);

      const conditionalSheets = [
        {
          condition: auditResults.some((r) => r.performance),
          method: this.createPerformanceSheet,
        },
        {
          condition: auditResults.some((r) => r.accessibility),
          method: this.createAccessibilitySheet,
        },
      ];

      await Promise.all(
        conditionalSheets
          .filter(({ condition }) => condition)
          .map(({ method }) => method.call(this, workbook, auditResults))
      );

      await Promise.all([
        this.createVisualRegressionSheet(workbook, auditResults),
        this.createH1ManipulationSheet(workbook, auditResults),
      ]);

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

  createWorkbook() {
    const workbook = new ExcelJS.Workbook();
    const now = new Date();

    Object.assign(workbook, {
      creator: "SEO Landing Page Auditor",
      lastModifiedBy: "SEO Landing Page Auditor",
      created: now,
      modified: now,
    });

    return workbook;
  }

  safeNumber = (value) => {
    if (value === null || value === undefined || isNaN(value)) return 0;
    return typeof value === "number" ? value : parseInt(value) || 0;
  };

  createHeaderRow(sheet, headers) {
    headers.forEach((header, index) => {
      const cell = sheet.getCell(1, index + 1);
      Object.assign(cell, {
        value: header,
        font: { bold: true },
        fill: {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: ExcelReporter.COLORS.HEADER },
        },
      });
    });
  }

  applyScoreColor(cell, score, thresholds = ExcelReporter.THRESHOLDS.SCORE) {
    const safeScore = this.safeNumber(score);
    const color =
      safeScore >= thresholds.GOOD
        ? ExcelReporter.COLORS.EXCELLENT
        : safeScore >= thresholds.FAIR
          ? ExcelReporter.COLORS.WARNING
          : ExcelReporter.COLORS.ERROR;

    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
  }

  applyRowColor(sheet, row, columnCount, color) {
    for (let col = 1; col <= columnCount; col++) {
      sheet.getCell(row, col).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: color },
      };
    }
  }

  async createSummarySheet(workbook, summary) {
    const sheet = workbook.addWorksheet("Summary");

    sheet.mergeCells("A1:D1");
    Object.assign(sheet.getCell("A1"), {
      value: "SEO AUDIT SUMMARY",
      font: { size: 18, bold: true },
      alignment: { horizontal: "center" },
    });

    const summaryData = [
      ["Audit ID", summary.auditId || "Unknown"],
      ["Landing Page URL", summary.landingUrl || "Unknown"],
      [
        "Audit Date",
        summary.startTime
          ? new Date(summary.startTime).toLocaleString()
          : "Unknown",
      ],
      [
        "Duration",
        summary.duration ? this.formatDuration(summary.duration) : "Unknown",
      ],
      ["Total URLs Audited", this.safeNumber(summary.totalUrls)],
      ["Successful Audits", this.safeNumber(summary.successfulAudits)],
      ["Failed Audits", this.safeNumber(summary.failedAudits)],
      ["Success Rate", `${this.safeNumber(summary.successRate)}%`],
      ["Overall Score", `${this.safeNumber(summary.auditScore)}/100`],
      ["Critical Issues", this.safeNumber(summary.criticalIssues)],
      ["Total Warnings", this.safeNumber(summary.totalWarnings)],
      ["Canonical Issues", this.safeNumber(summary.canonicalIssues)],
      ["Meta Tag Issues", this.safeNumber(summary.metaTagIssues)],
      ["Heading Issues", this.safeNumber(summary.headingIssues)],
      ["Broken Links", this.safeNumber(summary.brokenLinksCount)],
      ["Redirects Found", this.safeNumber(summary.redirectsCount)],
      ["Average Load Time", `${this.safeNumber(summary.avgLoadTime)}ms`],
      ["Visual Changes", this.safeNumber(summary.visualChanges)],
      ["H1 Manipulations", this.safeNumber(summary.h1Manipulations)],
      [
        "Structure Manipulations",
        this.safeNumber(summary.structureManipulations),
      ],
    ];

    summaryData.forEach(([label, value], index) => {
      const rowNum = index + 3;
      Object.assign(sheet.getCell(`A${rowNum}`), {
        value: label,
        font: { bold: true },
      });
      sheet.getCell(`B${rowNum}`).value = value;
    });

    [sheet.getColumn("A"), sheet.getColumn("B")].forEach((col, idx) => {
      col.width = [25, 30][idx];
    });

    const specialCells = [
      { cell: "B11", value: summary.auditScore, isScore: true },
      { cell: "B12", value: summary.criticalIssues, isError: true },
      { cell: "B20", value: summary.visualChanges, isWarning: true },
      { cell: "B21", value: summary.h1Manipulations, isCritical: true },
    ];

    specialCells.forEach(
      ({ cell, value, isScore, isError, isWarning, isCritical }) => {
        const cellObj = sheet.getCell(cell);
        const safeValue = this.safeNumber(value);

        if (isScore) {
          this.applyScoreColor(cellObj, safeValue);
        } else if (isError) {
          cellObj.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: {
              argb:
                safeValue > 0
                  ? ExcelReporter.COLORS.ERROR
                  : ExcelReporter.COLORS.EXCELLENT,
            },
          };
        } else if (isWarning) {
          cellObj.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: {
              argb:
                safeValue > 0
                  ? ExcelReporter.COLORS.WARNING
                  : ExcelReporter.COLORS.EXCELLENT,
            },
          };
        } else if (isCritical) {
          if (safeValue > 0) {
            Object.assign(cellObj, {
              fill: {
                type: "pattern",
                pattern: "solid",
                fgColor: { argb: ExcelReporter.COLORS.CRITICAL },
              },
              font: { color: { argb: "FFFFFFFF" }, bold: true },
            });
          } else {
            cellObj.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: ExcelReporter.COLORS.EXCELLENT },
            };
          }
        }
      }
    );
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

    this.createHeaderRow(sheet, headers);

    auditResults.forEach((result, index) => {
      const row = index + 2;
      const rowData = [
        result.url,
        result.success ? "Success" : "Failed",
        result.statusCode || "N/A",
        result.loadTime || 0,
        result.auditScore || 0,
        result.issues?.filter((i) => i.severity === "error").length || 0,
        result.warnings?.length || 0,
        result.canonical?.hasCanonical ? "Yes" : "No",
        result.metaTags?.description ? "Yes" : "No",
        result.headings?.h1Count || 0,
        result.brokenLinks?.length || 0,
        result.redirects?.length || 0,
        result.structuredData?.length || 0,
      ];

      rowData.forEach((value, colIndex) => {
        sheet.getCell(row, colIndex + 1).value = value;
      });

      if (!result.success) {
        this.applyRowColor(
          sheet,
          row,
          headers.length,
          ExcelReporter.COLORS.FAILED
        );
      }

      this.applyScoreColor(sheet.getCell(row, 5), result.auditScore);
    });

    this.finalizeSheet(sheet, headers.length, auditResults.length + 1);
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

    this.createHeaderRow(sheet, headers);

    let rowIndex = 2;
    auditResults.forEach((result) => {
      [...(result.issues || []), ...(result.warnings || [])].forEach(
        (issue) => {
          const rowData = [
            result.url,
            issue.type,
            issue.severity || "warning",
            ExcelReporter.CATEGORIES[issue.type] || "Other",
            issue.message,
            JSON.stringify(issue.details || {}),
          ];

          rowData.forEach((value, colIndex) => {
            sheet.getCell(rowIndex, colIndex + 1).value = value;
          });

          const color =
            issue.severity === "error"
              ? ExcelReporter.COLORS.FAILED
              : ExcelReporter.COLORS.WARNING;
          this.applyRowColor(sheet, rowIndex, headers.length, color);

          rowIndex++;
        }
      );
    });

    this.finalizeSheet(sheet, headers.length, rowIndex - 1);
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

    this.createHeaderRow(sheet, headers);

    auditResults.forEach((result, index) => {
      const row = index + 2;
      const canonical = result.canonical || {};

      const rowData = [
        result.url,
        canonical.hasCanonical ? "Yes" : "No",
        canonical.canonical || "None",
        canonical.issues?.length || 0,
        canonical.score || 0,
      ];

      rowData.forEach((value, colIndex) => {
        sheet.getCell(row, colIndex + 1).value = value;
      });

      if (!canonical.hasCanonical) {
        this.applyRowColor(
          sheet,
          row,
          headers.length,
          ExcelReporter.COLORS.FAILED
        );
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

    this.createHeaderRow(sheet, headers);

    auditResults.forEach((result, index) => {
      const row = index + 2;
      const meta = result.metaTags || {};

      const rowData = [
        result.url,
        meta.title || "Missing",
        meta.title?.length || 0,
        meta.description || "Missing",
        meta.description?.length || 0,
        meta.viewport || "Missing",
        meta.openGraph?.title ? "Yes" : "No",
        meta.twitter?.card ? "Yes" : "No",
        meta.issues?.length || 0,
        meta.score || 0,
      ];

      rowData.forEach((value, colIndex) => {
        sheet.getCell(row, colIndex + 1).value = value;
      });

      if (!meta.title || !meta.description) {
        this.applyRowColor(
          sheet,
          row,
          headers.length,
          ExcelReporter.COLORS.FAILED
        );
      }

      const titleLength = meta.title?.length || 0;
      const descLength = meta.description?.length || 0;

      [
        {
          cell: sheet.getCell(row, 3),
          length: titleLength,
          thresholds: ExcelReporter.THRESHOLDS.TITLE,
        },
        {
          cell: sheet.getCell(row, 5),
          length: descLength,
          thresholds: ExcelReporter.THRESHOLDS.DESCRIPTION,
        },
      ].forEach(({ cell, length, thresholds }) => {
        if (length < thresholds.MIN || length > thresholds.MAX) {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: ExcelReporter.COLORS.WARNING },
          };
        }
      });
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

    this.createHeaderRow(sheet, headers);

    auditResults.forEach((result, index) => {
      const row = index + 2;
      const headings = result.headings || {};

      const counts = Array.from({ length: 6 }, (_, i) => {
        const level = i + 1;
        return level === 1
          ? headings.h1Count || 0
          : headings.headings?.filter((h) => h.level === level).length || 0;
      });

      const rowData = [
        result.url,
        ...counts,
        headings.totalHeadings || 0,
        headings.issues?.length || 0,
        headings.score || 0,
      ];

      rowData.forEach((value, colIndex) => {
        sheet.getCell(row, colIndex + 1).value = value;
      });

      const h1Cell = sheet.getCell(row, 2);
      const h1Count = counts[0];

      const h1Color =
        h1Count === 0
          ? ExcelReporter.COLORS.ERROR
          : h1Count > 1
            ? ExcelReporter.COLORS.WARNING
            : ExcelReporter.COLORS.EXCELLENT;

      h1Cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: h1Color },
      };
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

    this.createHeaderRow(sheet, headers);

    auditResults.forEach((result, index) => {
      const row = index + 2;
      const brokenLinks = result.brokenLinks || {};

      const rowData = [
        result.url,
        brokenLinks.totalLinks || 0,
        brokenLinks.brokenLinks || 0,
        brokenLinks.workingLinks || 0,
        brokenLinks.externalLinks || 0,
        brokenLinks.internalLinks || 0,
        brokenLinks.links
          ?.filter((link) => link.isBroken)
          .map((link) => `${link.url} (${link.error})`)
          .join("; ") || "No data",
      ];

      rowData.forEach((value, colIndex) => {
        sheet.getCell(row, colIndex + 1).value = value;
      });

      if (brokenLinks.brokenLinks > 0) {
        this.applyRowColor(
          sheet,
          row,
          headers.length,
          ExcelReporter.COLORS.FAILED
        );
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

    this.createHeaderRow(sheet, headers);

    auditResults.forEach((result, index) => {
      const row = index + 2;
      const structured = result.structuredData || {};

      const schemaTypes =
        structured.jsonLd
          ?.filter((schema) => schema.type && schema.type !== "Unknown")
          .map((schema) => schema.type) || [];

      const rowData = [
        result.url,
        structured.hasStructuredData ? "Yes" : "No",
        structured.jsonLd?.length || 0,
        structured.microdata?.length || 0,
        structured.rdfa?.length || 0,
        schemaTypes.join(", "),
        structured.issues?.length || 0,
        structured.score || 0,
      ];

      rowData.forEach((value, colIndex) => {
        sheet.getCell(row, colIndex + 1).value = value;
      });

      if (!structured.hasStructuredData) {
        this.applyRowColor(
          sheet,
          row,
          headers.length,
          ExcelReporter.COLORS.WARNING
        );
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

    this.createHeaderRow(sheet, headers);

    auditResults.forEach((result, index) => {
      const row = index + 2;
      const perf = result.performance || {};
      const coreWebVitals = perf.coreWebVitals || {};
      const loadTimes = perf.loadTimes || {};

      const rowData = [
        result.url,
        Math.round(coreWebVitals.fcp || 0),
        Math.round(coreWebVitals.lcp || 0),
        parseFloat((coreWebVitals.cls || 0).toFixed(3)),
        Math.round(coreWebVitals.fid || 0),
        Math.round(coreWebVitals.ttfb || 0),
        Math.round(loadTimes.domContentLoaded || 0),
        Math.round(loadTimes.loadComplete || 0),
        perf.resources?.totalRequests || 0,
        perf.score || 0,
      ];

      rowData.forEach((value, colIndex) => {
        sheet.getCell(row, colIndex + 1).value = value;
      });

      this.applyPerformanceColors(sheet, row, perf);
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

    this.createHeaderRow(sheet, headers);

    auditResults.forEach((result, index) => {
      const row = index + 2;
      const a11y = result.accessibility || {};

      const rowData = [
        result.url,
        a11y.images?.filter((img) => !img.hasAlt).length || 0,
        a11y.links?.filter((link) => link.isEmpty).length || 0,
        this.countFormIssues(a11y.forms || []),
        a11y.headings?.filter((h) => h.isEmpty).length || 0,
        a11y.score ? "Manual Check Required" : "Not Audited",
        a11y.aria?.length || 0,
        a11y.score || 0,
      ];

      rowData.forEach((value, colIndex) => {
        sheet.getCell(row, colIndex + 1).value = value;
      });

      if (a11y.score < 80) {
        this.applyRowColor(
          sheet,
          row,
          headers.length,
          ExcelReporter.COLORS.WARNING
        );
      }
    });

    this.autoSizeColumns(sheet);
  }

  async createVisualRegressionSheet(workbook, auditResults) {
    const sheet = workbook.addWorksheet("Visual Regression");
    const headers = [
      "URL",
      "Element",
      "Viewport",
      "Has Changes",
      "Diff Percentage",
      "Severity",
      "Baseline Dimensions",
      "Current Dimensions",
      "Diff Path",
      "Change Reason",
    ];

    this.createHeaderRow(sheet, headers);

    let rowIndex = 2;
    const hasData = auditResults.some(
      (result) => result.visualRegression?.visualChanges?.length > 0
    );

    auditResults.forEach((result) => {
      const changes = result.visualRegression?.visualChanges || [];

      if (changes.length > 0) {
        changes.forEach((change) => {
          const severity =
            change.diffPercentage > ExcelReporter.THRESHOLDS.VISUAL_DIFF.MAJOR
              ? "MAJOR"
              : change.diffPercentage >
                  ExcelReporter.THRESHOLDS.VISUAL_DIFF.MINOR
                ? "MODERATE"
                : "MINOR";

          const rowData = [
            result.url,
            change.element,
            change.viewport,
            change.hasChanges ? "Yes" : "No",
            change.diffPercentage
              ? `${change.diffPercentage.toFixed(2)}%`
              : "0%",
            severity,
            change.baselineDimensions
              ? `${change.baselineDimensions.width}x${change.baselineDimensions.height}`
              : "N/A",
            change.currentDimensions
              ? `${change.currentDimensions.width}x${change.currentDimensions.height}`
              : "N/A",
            change.diffPath || "N/A",
            change.reason || "visual_difference",
          ];

          rowData.forEach((value, colIndex) => {
            sheet.getCell(rowIndex, colIndex + 1).value = value;
          });

          const color =
            severity === "MAJOR"
              ? ExcelReporter.COLORS.ERROR
              : severity === "MODERATE"
                ? ExcelReporter.COLORS.WARNING
                : null;

          if (color) {
            this.applyRowColor(sheet, rowIndex, headers.length, color);
          }

          rowIndex++;
        });
      } else {
        const rowData = [
          result.url,
          "N/A",
          "N/A",
          "No",
          "0%",
          "NONE",
          "N/A",
          "N/A",
          "N/A",
          "no_changes",
        ];

        rowData.forEach((value, colIndex) => {
          sheet.getCell(rowIndex, colIndex + 1).value = value;
        });

        this.applyRowColor(
          sheet,
          rowIndex,
          headers.length,
          ExcelReporter.COLORS.SAFE
        );
        rowIndex++;
      }
    });

    if (auditResults.length === 0) {
      sheet.getCell(2, 1).value = "No URLs audited";
      ["No", "0%", "NONE"].forEach((value, index) => {
        sheet.getCell(2, 4 + index).value = value;
      });
      rowIndex = 3;
    }

    this.finalizeSheet(sheet, headers.length, rowIndex - 1);
  }

  async createH1ManipulationSheet(workbook, auditResults) {
    const sheet = workbook.addWorksheet("H1 Manipulation Detection");
    const headers = [
      "URL",
      "From Heading",
      "To Heading",
      "Text Content",
      "Impact Level",
      "Has Style Compensation",
      "Manipulation Type",
      "SEO Risk",
    ];

    this.createHeaderRow(sheet, headers);

    let rowIndex = 2;
    let hasManipulations = false;

    auditResults.forEach((result) => {
      const hierarchyChanges =
        result.htmlStructure?.structureComparison?.headingChanges
          ?.hierarchyChanges || [];

      if (hierarchyChanges.length > 0) {
        hasManipulations = true;
        hierarchyChanges.forEach((change) => {
          const hasCompensation =
            result.htmlStructure?.stylingComparison?.hasCompensation || false;
          const manipulationType =
            change.from === "H1" && change.to === "H3"
              ? "H1→H3 Change"
              : "Hierarchy Change";
          const seoRisk =
            change.impact === "critical"
              ? "CRITICAL"
              : change.impact === "warning"
                ? "HIGH"
                : "MEDIUM";

          const rowData = [
            result.url,
            change.from,
            change.to,
            change.text || "",
            change.impact,
            hasCompensation ? "YES" : "NO",
            manipulationType,
            seoRisk,
          ];

          rowData.forEach((value, colIndex) => {
            sheet.getCell(rowIndex, colIndex + 1).value = value;
          });

          if (seoRisk === "CRITICAL") {
            this.applyRowColor(
              sheet,
              rowIndex,
              headers.length,
              ExcelReporter.COLORS.CRITICAL
            );
            for (let col = 1; col <= headers.length; col++) {
              sheet.getCell(rowIndex, col).font = {
                color: { argb: "FFFFFFFF" },
                bold: true,
              };
            }
          } else if (seoRisk === "HIGH") {
            this.applyRowColor(
              sheet,
              rowIndex,
              headers.length,
              ExcelReporter.COLORS.WARNING
            );
          }

          rowIndex++;
        });
      } else {
        const rowData = [
          result.url,
          "NONE",
          "NONE",
          "No manipulations detected",
          "CLEAN",
          "NO",
          "NONE",
          "SAFE",
        ];

        rowData.forEach((value, colIndex) => {
          sheet.getCell(rowIndex, colIndex + 1).value = value;
        });

        this.applyRowColor(
          sheet,
          rowIndex,
          headers.length,
          ExcelReporter.COLORS.SAFE
        );
        for (let col = 1; col <= headers.length; col++) {
          sheet.getCell(rowIndex, col).font = { color: { argb: "FF006400" } };
        }

        rowIndex++;
      }
    });

    if (auditResults.length === 0) {
      const defaultData = [
        "No URLs audited",
        "",
        "",
        "",
        "NONE",
        "NO",
        "NONE",
        "SAFE",
      ];
      defaultData.forEach((value, index) => {
        sheet.getCell(2, index + 1).value = value;
      });
      rowIndex = 3;
    }

    this.finalizeSheet(sheet, headers.length, rowIndex - 1);
  }

  applyPerformanceColors(sheet, row, perf) {
    const metrics = [
      {
        col: 2,
        value: perf.coreWebVitals?.fcp || 0,
        thresholds: ExcelReporter.THRESHOLDS.PERFORMANCE.FCP,
      },
      {
        col: 3,
        value: perf.coreWebVitals?.lcp || 0,
        thresholds: ExcelReporter.THRESHOLDS.PERFORMANCE.LCP,
      },
      {
        col: 4,
        value: perf.coreWebVitals?.cls || 0,
        thresholds: ExcelReporter.THRESHOLDS.PERFORMANCE.CLS,
      },
    ];

    metrics.forEach(({ col, value, thresholds }) => {
      const cell = sheet.getCell(row, col);
      const color =
        value > thresholds.POOR
          ? ExcelReporter.COLORS.ERROR
          : value > thresholds.GOOD
            ? ExcelReporter.COLORS.WARNING
            : ExcelReporter.COLORS.EXCELLENT;

      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: color },
      };
    });
  }

  countFormIssues = (forms) =>
    forms.reduce(
      (count, form) =>
        count +
        (form.inputs?.filter((input) => !input.hasLabel && !input.ariaLabel)
          .length || 0),
      0
    );

  autoSizeColumns(sheet) {
    sheet.columns.forEach((column) => {
      let maxLength = 0;
      column.eachCell({ includeEmpty: true }, (cell) => {
        const length = cell.value?.toString().length || 10;
        maxLength = Math.max(maxLength, length);
      });
      column.width = Math.min(maxLength + 2, 50);
    });
  }

  finalizeSheet(sheet, columnCount, rowCount) {
    this.autoSizeColumns(sheet);
    this.addAutoFilter(sheet, columnCount, rowCount);
  }

  addAutoFilter = (sheet, columnCount, rowCount) => {
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: rowCount, column: columnCount },
    };
  };

  formatDuration = (ms) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    return hours > 0
      ? `${hours}h ${minutes % 60}m ${seconds % 60}s`
      : minutes > 0
        ? `${minutes}m ${seconds % 60}s`
        : `${seconds}s`;
  };
}

export default ExcelReporter;
