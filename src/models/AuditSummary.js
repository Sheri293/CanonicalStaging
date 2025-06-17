class AuditSummary {
  constructor(data = {}) {
    this.auditId = data.auditId || "";
    this.landingUrl = data.landingUrl || "";
    this.startTime = data.startTime || Date.now();
    this.endTime = data.endTime || Date.now();
    this.totalUrls = data.totalUrls || 0;
    this.isFailure = data.isFailure || false;
    this.results = data.results || [];

    this.successfulAudits = this.results.filter((r) => r.success).length;
    this.failedAudits = this.results.filter((r) => !r.success).length;
    this.successRate =
      this.totalUrls > 0
        ? Math.round((this.successfulAudits / this.totalUrls) * 100)
        : 0;

    this.criticalIssues = this.countCriticalIssues();
    this.totalWarnings = this.countWarnings();
    this.auditScore = this.calculateOverallScore();

    this.canonicalIssues = this.countCanonicalIssues();
    this.metaTagIssues = this.countMetaTagIssues();
    this.headingIssues = this.countHeadingIssues();
    this.brokenLinksCount = this.countBrokenLinks();
    this.redirectsCount = this.countRedirects();

    this.avgLoadTime = this.calculateAvgLoadTime();
    this.duration = this.endTime - this.startTime;
  }

  countCriticalIssues() {
    return this.results.reduce((count, result) => {
      return (
        count +
        (result.issues?.filter((i) => i.severity === "error").length || 0)
      );
    }, 0);
  }

  countWarnings() {
    return this.results.reduce((count, result) => {
      return count + (result.warnings?.length || 0);
    }, 0);
  }

  calculateOverallScore() {
    if (this.totalUrls === 0) return 0;

    const avgScore =
      this.results.reduce((sum, result) => {
        return sum + (result.auditScore || 0);
      }, 0) / this.totalUrls;

    return Math.round(avgScore);
  }

  countCanonicalIssues() {
    return this.results.reduce((count, result) => {
      return count + (result.canonical?.issues?.length || 0);
    }, 0);
  }

  countMetaTagIssues() {
    return this.results.reduce((count, result) => {
      return count + (result.metaTags?.issues?.length || 0);
    }, 0);
  }

  countHeadingIssues() {
    return this.results.reduce((count, result) => {
      return count + (result.headings?.issues?.length || 0);
    }, 0);
  }

  countBrokenLinks() {
    return this.results.reduce((count, result) => {
      return count + (result.brokenLinks?.length || 0);
    }, 0);
  }

  countRedirects() {
    return this.results.reduce((count, result) => {
      return count + (result.redirects?.length || 0);
    }, 0);
  }

  calculateAvgLoadTime() {
    const successfulResults = this.results.filter(
      (r) => r.success && r.loadTime
    );
    if (successfulResults.length === 0) return 0;

    const totalTime = successfulResults.reduce(
      (sum, result) => sum + result.loadTime,
      0
    );
    return Math.round(totalTime / successfulResults.length);
  }
}

module.exports = AuditSummary;
