import dotenv from "dotenv";
dotenv.config();

import crawler from "./crawler.config.js";
import audit from "./audit.config.js";
import email from "./email.config.js";

export default {
  crawler,
  audit,
  email,

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
