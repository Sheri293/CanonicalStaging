const Logger = require("../utils/Logger");

class BaseAuditor {
  constructor(config = {}) {
    this.config = config;
    this.logger = new Logger(this.constructor.name);
    this.browser = config.browser;
  }

  async initialize() {
    this.logger.info(`${this.constructor.name} initialized`);
  }

  async audit(page, url) {
    throw new Error("audit method must be implemented by subclass");
  }

  async cleanup() {
    this.logger.info(`${this.constructor.name} cleanup completed`);
  }

  async healthCheck() {
    return { status: "healthy" };
  }

  getStats() {
    return {};
  }

  createIssue(type, severity, message, details = {}) {
    return {
      type,
      severity,
      message,
      details,
      timestamp: new Date().toISOString(),
    };
  }

  createWarning(type, message, details = {}) {
    return this.createIssue(type, "warning", message, details);
  }

  createError(type, message, details = {}) {
    return this.createIssue(type, "error", message, details);
  }

  createRecommendation(type, message, details = {}) {
    return {
      type,
      message,
      details,
      timestamp: new Date().toISOString(),
    };
  }
}

module.exports = BaseAuditor;
