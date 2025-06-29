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

    this.visualChanges = this.countVisualChanges() || 0;
    this.h1Manipulations = this.countH1Manipulations() || 0;
    this.visualRegressionIssues = this.countVisualRegressionIssues() || 0;
    this.structureManipulations = this.countStructureManipulations() || 0;

    this.criticalIssues = this.countCriticalIssues() || 0;
    this.totalWarnings = this.countWarnings() || 0;
    this.auditScore = this.calculateOverallScore() || 0;
    this.canonicalIssues = this.countCanonicalIssues() || 0;
    this.metaTagIssues = this.countMetaTagIssues() || 0;
    this.headingIssues = this.countHeadingIssues() || 0;
    this.brokenLinksCount = this.countBrokenLinks() || 0;
    this.redirectsCount = this.countRedirects() || 0;
    this.avgLoadTime = this.calculateAvgLoadTime() || 0;

    this.duration = this.endTime - this.startTime;
  }

  countVisualChanges() {
    if (!this.results || !Array.isArray(this.results)) return 0;

    return this.results.reduce((count, result) => {
      if (result.visualRegression?.visualChanges) {
        return count + result.visualRegression.visualChanges.length;
      }
      return count;
    }, 0);
  }

  countH1Manipulations() {
    if (!this.results || !Array.isArray(this.results)) return 0;

    return this.results.reduce((count, result) => {
      if (
        result.htmlStructure?.structureComparison?.headingChanges
          ?.hierarchyChanges
      ) {
        const h1ToOtherChanges =
          result.htmlStructure.structureComparison.headingChanges.hierarchyChanges.filter(
            (change) =>
              change.from === "H1" &&
              (change.to === "H2" ||
                change.to === "H3" ||
                change.to === "H4" ||
                change.to === "H5" ||
                change.to === "H6")
          );
        return count + h1ToOtherChanges.length;
      }
      return count;
    }, 0);
  }

  countVisualRegressionIssues() {
    if (!this.results || !Array.isArray(this.results)) return 0;

    return this.results.reduce((count, result) => {
      if (result.visualRegression?.issues) {
        return (
          count +
          result.visualRegression.issues.filter(
            (issue) => issue.severity === "error"
          ).length
        );
      }
      return count;
    }, 0);
  }

  countStructureManipulations() {
    if (!this.results || !Array.isArray(this.results)) return 0;

    return this.results.reduce((count, result) => {
      if (result.htmlStructure?.issues) {
        const manipulations = result.htmlStructure.issues.filter(
          (issue) => issue.type === "seo_manipulation_detected"
        );
        return count + manipulations.length;
      }
      return count;
    }, 0);
  }

  countCriticalIssues() {
    if (!this.results || !Array.isArray(this.results)) return 0;

    let count = this.results.reduce((count, result) => {
      return (
        count +
        (result.issues?.filter((i) => i.severity === "error").length || 0)
      );
    }, 0);

    count += this.visualRegressionIssues || 0;
    count += this.structureManipulations || 0;

    return isNaN(count) ? 0 : Math.max(0, count);
  }

  countWarnings() {
    if (!this.results || !Array.isArray(this.results)) return 0;

    return this.results.reduce((count, result) => {
      return count + (result.warnings?.length || 0);
    }, 0);
  }

  calculateOverallScore() {
    if (!this.results || this.totalUrls === 0) return 0;

    let avgScore =
      this.results.reduce((sum, result) => {
        return sum + (result.auditScore || 0);
      }, 0) / this.totalUrls;

    if (this.h1Manipulations > 0) {
      avgScore -= this.h1Manipulations * 15;
    }

    if (this.visualChanges > 0) {
      avgScore -= this.visualChanges * 2;
    }

    return Math.max(0, Math.round(avgScore));
  }

  countCanonicalIssues() {
    if (!this.results || !Array.isArray(this.results)) return 0;

    return this.results.reduce((count, result) => {
      return count + (result.canonical?.issues?.length || 0);
    }, 0);
  }

  countMetaTagIssues() {
    if (!this.results || !Array.isArray(this.results)) return 0;

    return this.results.reduce((count, result) => {
      return count + (result.metaTags?.issues?.length || 0);
    }, 0);
  }

  countHeadingIssues() {
    if (!this.results || !Array.isArray(this.results)) return 0;

    return this.results.reduce((count, result) => {
      return count + (result.headings?.issues?.length || 0);
    }, 0);
  }

  countBrokenLinks() {
    if (!this.results || !Array.isArray(this.results)) return 0;

    return this.results.reduce((count, result) => {
      return count + (result.brokenLinks?.length || 0);
    }, 0);
  }

  countRedirects() {
    if (!this.results || !Array.isArray(this.results)) return 0;

    return this.results.reduce((count, result) => {
      return count + (result.redirects?.length || 0);
    }, 0);
  }

  calculateAvgLoadTime() {
    if (!this.results || !Array.isArray(this.results)) return 0;

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

  getVisualRegressionSummary() {
    return {
      totalChanges: this.visualChanges || 0,
      h1Manipulations: this.h1Manipulations || 0,
      structureManipulations: this.structureManipulations || 0,
      criticalVisualIssues: this.visualRegressionIssues || 0,
      pagesWithVisualChanges:
        this.results?.filter(
          (r) =>
            r.visualRegression?.visualChanges &&
            r.visualRegression.visualChanges.length > 0
        ).length || 0,
      pagesWithH1Changes:
        this.results?.filter((r) =>
          r.htmlStructure?.structureComparison?.headingChanges?.hierarchyChanges?.some(
            (change) => change.from === "H1"
          )
        ).length || 0,
    };
  }
}

export default AuditSummary;
