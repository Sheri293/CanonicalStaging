class AuditResult {
  constructor(data = {}) {
    this.url = data.url || "";
    this.success = data.success || false;
    this.error = data.error || null;
    this.loadTime = data.loadTime || 0;
    this.statusCode = data.statusCode || 0;
    this.crawlDepth = data.crawlDepth || 0;
    this.crawlSource = data.crawlSource || "unknown";
    this.timestamp = data.timestamp || new Date().toISOString();

    this.canonical = data.canonical || null;
    this.metaTags = data.metaTags || null;
    this.headings = data.headings || null;
    this.redirects = data.redirects || [];
    this.brokenLinks = data.brokenLinks || [];
    this.structuredData = data.structuredData || [];
    this.performance = data.performance || null;
    this.accessibility = data.accessibility || null;

    this.issues = data.issues || [];
    this.warnings = data.warnings || [];
    this.recommendations = data.recommendations || [];

    this.auditScore = this.calculateAuditScore();
  }

  calculateAuditScore() {
    if (!this.success) return 0;

    let score = 100;
    const criticalIssues = this.issues.filter(
      (i) => i.severity === "error"
    ).length;
    const warnings = this.warnings.length;

    score -= criticalIssues * 15;
    score -= warnings * 5;

    return Math.max(0, Math.min(100, score));
  }

  getCriticalIssues() {
    return this.issues.filter((i) => i.severity === "error");
  }

  getWarnings() {
    return this.issues.filter((i) => i.severity === "warning");
  }
}

module.exports = AuditResult;
