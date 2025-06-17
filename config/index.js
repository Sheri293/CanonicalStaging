require("dotenv").config();

module.exports = {
  crawler: require("./crawler.config"),
  audit: require("./audit.config"),
  email: require("./email.config"),
  logging: {
    level: process.env.LOG_LEVEL || "info",
    file: process.env.LOG_FILE || "./logs/audit.log",
    console: process.env.LOG_CONSOLE !== "false",
  },
  reports: {
    excel: {
      outputDir: process.env.EXCEL_OUTPUT_DIR || "./reports/excel",
    },
    html: {
      outputDir: process.env.HTML_OUTPUT_DIR || "./reports/html",
    },
  },
};
