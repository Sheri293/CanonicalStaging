import BaseAuditor from "./BaseAuditor.js";
import axios from "axios";

class RedirectAuditor extends BaseAuditor {
  constructor(config = {}) {
    super(config);
    this.maxRedirects = config.maxRedirects || 10;
    this.timeout = config.timeout || 30000;
  }

  async audit(url) {
    try {
      const redirectChain = await this.analyzeRedirectChain(url);
      const issues = [];
      const warnings = [];
      const recommendations = [];

      this.auditRedirectChain(redirectChain, issues, warnings, recommendations);
      this.auditRedirectTypes(redirectChain, issues, warnings, recommendations);
      this.auditRedirectLoops(redirectChain, issues, warnings, recommendations);

      return {
        redirectChain,
        totalRedirects: redirectChain.length - 1,
        finalUrl: redirectChain[redirectChain.length - 1]?.url || url,
        hasRedirects: redirectChain.length > 1,
        issues,
        warnings,
        recommendations,
        score: this.calculateScore(issues, warnings, redirectChain.length),
      };
    } catch (error) {
      this.logger.error("Redirect audit failed", error);
      throw error;
    }
  }

  async analyzeRedirectChain(startUrl) {
    const chain = [];
    let currentUrl = startUrl;
    let redirectCount = 0;
    const visitedUrls = new Set();

    try {
      while (redirectCount < this.maxRedirects) {
        if (visitedUrls.has(currentUrl)) {
          chain.push({
            url: currentUrl,
            statusCode: null,
            redirectType: "loop_detected",
            location: null,
            isLoop: true,
          });
          break;
        }

        visitedUrls.add(currentUrl);

        const response = await axios.get(currentUrl, {
          timeout: this.timeout,
          maxRedirects: 0,
          validateStatus: (status) => status < 400,
          headers: {
            "User-Agent":
              this.config.userAgent || "SEO-Landing-Page-Auditor/2.0",
          },
        });

        const redirectInfo = {
          url: currentUrl,
          statusCode: response.status,
          redirectType: this.getRedirectType(response.status),
          location: response.headers.location || null,
          responseTime: response.headers["x-response-time"] || null,
          isLoop: false,
        };

        chain.push(redirectInfo);

        if (
          response.status >= 300 &&
          response.status < 400 &&
          response.headers.location
        ) {
          currentUrl = new URL(response.headers.location, currentUrl).href;
          redirectCount++;
        } else {
          break;
        }
      }

      if (redirectCount >= this.maxRedirects) {
        chain.push({
          url: currentUrl,
          statusCode: null,
          redirectType: "max_redirects_exceeded",
          location: null,
          isLoop: false,
        });
      }
    } catch (error) {
      if (error.response) {
        chain.push({
          url: currentUrl,
          statusCode: error.response.status,
          redirectType: this.getRedirectType(error.response.status),
          location: error.response.headers.location || null,
          error: error.message,
          isLoop: false,
        });
      } else {
        chain.push({
          url: currentUrl,
          statusCode: null,
          redirectType: "network_error",
          location: null,
          error: error.message,
          isLoop: false,
        });
      }
    }

    return chain;
  }

  getRedirectType(statusCode) {
    const redirectTypes = {
      301: "permanent",
      302: "temporary",
      303: "see_other",
      307: "temporary_preserve_method",
      308: "permanent_preserve_method",
    };

    return redirectTypes[statusCode] || "unknown";
  }

  auditRedirectChain(redirectChain, issues, warnings) {
    const redirectCount = redirectChain.length - 1;

    if (redirectCount > 3) {
      warnings.push(
        this.createWarning(
          "long_redirect_chain",
          `Redirect chain is too long (${redirectCount} redirects). This can negatively impact SEO and user experience`,
          {
            redirectCount,
            chain: redirectChain.map((r) => r.url),
          }
        )
      );
    }

    if (redirectCount > 5) {
      issues.push(
        this.createError(
          "excessive_redirects",
          `Excessive redirect chain (${redirectCount} redirects). This will significantly impact performance`,
          {
            redirectCount,
            chain: redirectChain.map((r) => r.url),
          }
        )
      );
    }

    redirectChain.forEach((redirect, index) => {
      if (redirect.error) {
        issues.push(
          this.createError(
            "redirect_error",
            `Redirect step ${index + 1} failed: ${redirect.error}`,
            {
              url: redirect.url,
              error: redirect.error,
            }
          )
        );
      }
    });
  }

  auditRedirectTypes(redirectChain, warnings, recommendations) {
    redirectChain.forEach((redirect, index) => {
      if (redirect.statusCode === 302 && index < redirectChain.length - 1) {
        recommendations.push(
          this.createRecommendation(
            "temporary_redirect",
            `Step ${
              index + 1
            } uses 302 (temporary) redirect. Consider using 301 (permanent) for SEO benefits if the redirect is permanent`,
            {
              url: redirect.url,
              statusCode: redirect.statusCode,
            }
          )
        );
      }

      if (
        redirect.redirectType === "unknown" &&
        redirect.statusCode >= 300 &&
        redirect.statusCode < 400
      ) {
        warnings.push(
          this.createWarning(
            "unknown_redirect_type",
            `Unknown redirect type for status code ${redirect.statusCode}`,
            {
              url: redirect.url,
              statusCode: redirect.statusCode,
            }
          )
        );
      }
    });
  }

  auditRedirectLoops(redirectChain, issues) {
    const loopDetected = redirectChain.some((redirect) => redirect.isLoop);

    if (loopDetected) {
      issues.push(
        this.createError(
          "redirect_loop",
          "Redirect loop detected in the chain",
          {
            chain: redirectChain.map((r) => r.url),
          }
        )
      );
    }

    if (
      redirectChain.some(
        (redirect) => redirect.redirectType === "max_redirects_exceeded"
      )
    ) {
      issues.push(
        this.createError(
          "max_redirects_exceeded",
          `Maximum redirect limit (${this.maxRedirects}) exceeded`,
          {
            maxRedirects: this.maxRedirects,
          }
        )
      );
    }
  }

  calculateScore(issues, warnings, redirectCount) {
    let score = 100;
    score -= issues.length * 25;
    score -= warnings.length * 15;
    score -= Math.max(0, redirectCount - 1) * 5;
    return Math.max(0, score);
  }
}

export default RedirectAuditor;
