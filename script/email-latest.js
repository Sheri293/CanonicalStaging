import dotenv from "dotenv";
dotenv.config();

import EmailNotifier from "../src/notifications/EmailNotifier.js";
import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";

const parseIntWithDefault = (value, defaultValue = 0) =>
  parseInt(value) || defaultValue;

async function emailLatest() {
  try {
    const reportsDir = "./reports/excel";
    const files = fs
      .readdirSync(reportsDir)
      .filter((f) => f.endsWith(".xlsx") && !f.startsWith("~$"));

    if (files.length === 0) {
      console.log("No Excel reports found");
      return;
    }

    const latest = files
      .map((file) => ({
        name: file,
        time: fs.statSync(path.join(reportsDir, file)).mtime,
      }))
      .sort((a, b) => b.time - a.time)[0];

    console.log("Latest report found:", latest.name);
    console.log("Reading data from Excel file...");

    const summary = await readExcelSummary(
      path.join(reportsDir, latest.name),
      latest
    );

    const emailNotifier = new EmailNotifier({
      enabled: true,
      smtp: {
        host: process.env.SMTP_HOST || "smtp.gmail.com",
        port: parseIntWithDefault(process.env.SMTP_PORT, 587),
        secure: process.env.SMTP_SECURE === "true",
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
      },
      from: process.env.EMAIL_FROM,
      to: process.env.EMAIL_TO,
      cc: process.env.EMAIL_CC,
      attachReports: true,
    });

    await emailNotifier.initialize();

    const result = await emailNotifier.send(summary, {
      filePath: path.join(reportsDir, latest.name),
      filename: latest.name,
    });

    if (result.success) {
      console.log("Latest report emailed successfully");
    } else {
      console.log("Email failed:", result.error);
    }

    await emailNotifier.cleanup();
  } catch (error) {
    console.error("Error:", error.message);
  }
}

async function readExcelSummary(filePath, fileInfo) {
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const summarySheet =
      workbook.getWorksheet("Summary") || workbook.getWorksheet(1);

    if (!summarySheet) {
      console.log("No summary sheet found, using default values");
      return getDefaultSummary(fileInfo);
    }

    const summary = {
      auditId: fileInfo.name.replace(".xlsx", ""),
      landingUrl:
        getCellValue(summarySheet, "B", "Landing Page") ||
        "https://staging-www.electrical.com/",
      endTime: fileInfo.time.toISOString(),
      duration: parseDuration(getCellValue(summarySheet, "B", "Duration")) || 0,
      totalUrls: parseIntWithDefault(
        getCellValue(summarySheet, "B", "Total URLs")
      ),
      successfulAudits: parseIntWithDefault(
        getCellValue(summarySheet, "B", "Successful")
      ),
      failedAudits: parseIntWithDefault(
        getCellValue(summarySheet, "B", "Failed")
      ),
      successRate: parseIntWithDefault(
        getCellValue(summarySheet, "B", "Success Rate")
      ),
      auditScore: parseIntWithDefault(
        getCellValue(summarySheet, "B", "Audit Score")
      ),
      criticalIssues: parseIntWithDefault(
        getCellValue(summarySheet, "B", "Critical Issues")
      ),
      totalWarnings: parseIntWithDefault(
        getCellValue(summarySheet, "B", "Total Warnings")
      ),
      avgLoadTime:
        parseLoadTime(getCellValue(summarySheet, "B", "Average Load Time")) ||
        0,
      canonicalIssues: parseIntWithDefault(
        getCellValue(summarySheet, "B", "Canonical Issues")
      ),
      metaTagIssues: parseIntWithDefault(
        getCellValue(summarySheet, "B", "Meta Tag Issues")
      ),
      headingIssues: parseIntWithDefault(
        getCellValue(summarySheet, "B", "Heading Issues")
      ),
      brokenLinksCount: parseIntWithDefault(
        getCellValue(summarySheet, "B", "Broken Links")
      ),
      redirectsCount: parseIntWithDefault(
        getCellValue(summarySheet, "B", "Redirects")
      ),
      environment: "staging",
      reportType: "Latest Report Email",
    };

    console.log("Excel data read successfully:");
    console.log("Total URLs:", summary.totalUrls);
    console.log("Success Rate:", summary.successRate + "%");
    console.log("Critical Issues:", summary.criticalIssues);

    return summary;
  } catch (error) {
    console.log(
      "Could not read Excel file, using filename data:",
      error.message
    );
    return getDefaultSummary(fileInfo);
  }
}

function getCellValue(sheet, column, searchText) {
  try {
    let foundRow = null;

    sheet.eachRow((row, rowNumber) => {
      const cellA = row.getCell("A").value;
      if (
        cellA &&
        cellA.toString().toLowerCase().includes(searchText.toLowerCase())
      ) {
        foundRow = rowNumber;
      }
    });

    if (foundRow) {
      return sheet.getCell(`${column}${foundRow}`).value;
    }
    return null;
  } catch (error) {
    return null;
  }
}

function parseDuration(durationStr) {
  if (!durationStr) return 0;

  const str = durationStr.toString();
  const minutes = str.match(/(\d+)m/);
  const seconds = str.match(/(\d+)s/);

  return (
    ((minutes ? parseInt(minutes[1]) : 0) * 60 +
      (seconds ? parseInt(seconds[1]) : 0)) *
    1000
  );
}

function parseLoadTime(loadTimeStr) {
  if (!loadTimeStr) return 0;

  const str = loadTimeStr.toString();
  if (str.includes("ms")) {
    return parseInt(str.replace("ms", ""));
  }
  if (str.includes("s")) {
    return parseInt(str.replace("s", "")) * 1000;
  }
  return parseInt(str) || 0;
}

function getDefaultSummary(fileInfo) {
  return {
    auditId: fileInfo.name.replace(".xlsx", ""),
    landingUrl: "https://staging-www.electrical.com/",
    endTime: fileInfo.time.toISOString(),
    duration: 0,
    totalUrls: 0,
    successfulAudits: 0,
    failedAudits: 0,
    successRate: 0,
    auditScore: 0,
    criticalIssues: 0,
    totalWarnings: 0,
    avgLoadTime: 0,
    canonicalIssues: 0,
    metaTagIssues: 0,
    headingIssues: 0,
    brokenLinksCount: 0,
    redirectsCount: 0,
    environment: "staging",
    reportType: "Latest Report Email - No Data Available",
  };
}

emailLatest();
