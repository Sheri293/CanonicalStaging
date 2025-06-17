const winston = require("winston");
const colors = require("colors");

class Logger {
  constructor(component = "App") {
    this.component = component;
    this.winston = winston.createLogger({
      level: process.env.LOG_LEVEL || "info",
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      transports: [
        new winston.transports.File({
          filename: "logs/error.log",
          level: "error",
        }),
        new winston.transports.File({ filename: "logs/audit.log" }),
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          ),
        }),
      ],
    });
  }

  info(message, meta = {}) {
    this.winston.info(message, { component: this.component, ...meta });
    console.log(colors.blue(`[${this.component}] ${message}`));
  }

  success(message, meta = {}) {
    this.winston.info(message, { component: this.component, ...meta });
    console.log(colors.green(`[${this.component}] ✅ ${message}`));
  }

  warning(message, meta = {}) {
    this.winston.warn(message, { component: this.component, ...meta });
    console.log(colors.yellow(`[${this.component}] ⚠️  ${message}`));
  }

  error(message, error = null, meta = {}) {
    this.winston.error(message, {
      component: this.component,
      error: error?.stack,
      ...meta,
    });
    console.log(colors.red(`[${this.component}] ❌ ${message}`));
    if (error && process.env.NODE_ENV === "development") {
      console.log(colors.gray(error.stack));
    }
  }

  debug(message, meta = {}) {
    this.winston.debug(message, { component: this.component, ...meta });
    if (process.env.LOG_LEVEL === "debug") {
      console.log(colors.gray(`[${this.component}] 🔍 ${message}`));
    }
  }
}

module.exports = Logger;
