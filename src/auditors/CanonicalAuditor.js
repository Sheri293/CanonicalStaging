const BaseAuditor = require("./BaseAuditor");

class CanonicalAuditor extends BaseAuditor {
  constructor(config = {}) {
    super(config);
  }

  async audit(page, url) {
    try {
      const canonicalData = await page.evaluate(() => {
        const canonicalLink = document.querySelector("link[rel='canonical']");
        const metaRobots = document.querySelector("meta[name='robots']");

        return {
          canonical: canonicalLink ? canonicalLink.href : null,
          hasCanonical: !!canonicalLink,
          metaRobots: metaRobots ? metaRobots.content : null,
          title: document.title || "",
          url: window.location.href,
        };
      });

      const issues = [];
      const warnings = [];
      const recommendations = [];

      if (!canonicalData.hasCanonical) {
        issues.push(
          this.createError(
            "missing_canonical",
            "Page is missing canonical URL",
            { url }
          )
        );
      } else {
        try {
          const canonicalUrl = new URL(canonicalData.canonical);
          const currentUrl = new URL(url);

          if (canonicalUrl.hostname !== currentUrl.hostname) {
            warnings.push(
              this.createWarning(
                "external_canonical",
                "Canonical URL points to external domain",
                { canonical: canonicalData.canonical, current: url }
              )
            );
          }

          if (canonicalUrl.protocol !== currentUrl.protocol) {
            warnings.push(
              this.createWarning(
                "protocol_mismatch",
                "Canonical URL protocol differs from current page",
                { canonical: canonicalData.canonical, current: url }
              )
            );
          }
        } catch (error) {
          issues.push(
            this.createError(
              "invalid_canonical",
              "Canonical URL is malformed",
              { canonical: canonicalData.canonical }
            )
          );
        }
      }

      if (
        canonicalData.metaRobots &&
        canonicalData.metaRobots.includes("noindex")
      ) {
        warnings.push(
          this.createWarning(
            "noindex_with_canonical",
            "Page has noindex directive but also has canonical URL",
            { metaRobots: canonicalData.metaRobots }
          )
        );
      }

      return {
        canonical: canonicalData.canonical,
        hasCanonical: canonicalData.hasCanonical,
        metaRobots: canonicalData.metaRobots,
        issues,
        warnings,
        recommendations,
        score: this.calculateScore(issues, warnings),
      };
    } catch (error) {
      this.logger.error("Canonical audit failed", error);
      throw error;
    }
  }

  calculateScore(issues, warnings) {
    let score = 100;
    score -= issues.length * 25;
    score -= warnings.length * 10;
    return Math.max(0, score);
  }
}

module.exports = CanonicalAuditor;
