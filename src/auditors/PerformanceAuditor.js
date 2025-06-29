import BaseAuditor from "./BaseAuditor.js";

class PerformanceAuditor extends BaseAuditor {
  constructor(config = {}) {
    super(config);
    this.thresholds = {
      fcp: config.fcpThreshold || 2500,
      lcp: config.lcpThreshold || 4000,
      cls: config.clsThreshold || 0.25,
      fid: config.fidThreshold || 300,
      ttfb: config.ttfbThreshold || 800,
      ...config.thresholds,
    };
  }

  async audit(page) {
    try {
      const performanceMetrics = await this.collectPerformanceMetrics(page);
      const resourceMetrics = await this.collectResourceMetrics(page);

      const issues = [];
      const warnings = [];
      const recommendations = [];

      this.auditCoreWebVitals(
        performanceMetrics,
        issues,
        warnings,
        recommendations
      );
      this.auditLoadTimes(
        performanceMetrics,
        issues,
        warnings,
        recommendations
      );
      this.auditResourceUsage(
        resourceMetrics,
        issues,
        warnings,
        recommendations
      );

      return {
        coreWebVitals: {
          fcp: performanceMetrics.fcp,
          lcp: performanceMetrics.lcp,
          cls: performanceMetrics.cls,
          fid: performanceMetrics.fid,
          ttfb: performanceMetrics.ttfb,
        },
        loadTimes: {
          domContentLoaded: performanceMetrics.domContentLoaded,
          loadComplete: performanceMetrics.loadComplete,
          firstPaint: performanceMetrics.firstPaint,
        },
        resources: resourceMetrics,
        issues,
        warnings,
        recommendations,
        score: this.calculatePerformanceScore(
          performanceMetrics,
          resourceMetrics
        ),
      };
    } catch (error) {
      this.logger.error("Performance audit failed", error);
      throw error;
    }
  }

  async collectPerformanceMetrics(page) {
    const metrics = await page.evaluate(() => {
      return new Promise((resolve) => {
        setTimeout(() => {
          const timing = performance.timing;
          const navigation = performance.getEntriesByType("navigation")[0];
          const paint = performance.getEntriesByType("paint");

          resolve({
            domContentLoaded:
              timing.domContentLoadedEventEnd - timing.navigationStart,
            loadComplete: timing.loadEventEnd - timing.navigationStart,
            firstPaint:
              paint.find((p) => p.name === "first-paint")?.startTime || null,
            firstContentfulPaint:
              paint.find((p) => p.name === "first-contentful-paint")
                ?.startTime || null,
            ttfb: timing.responseStart - timing.navigationStart,
            domInteractive: timing.domInteractive - timing.navigationStart,
            resources: performance.getEntriesByType("resource").length,
          });
        }, 3000);
      });
    });

    const webVitals = await this.collectWebVitals(page);
    return { ...metrics, ...webVitals };
  }

  async collectWebVitals(page) {
    return await page.evaluate(() => {
      return new Promise((resolve) => {
        const vitals = { fcp: null, lcp: null, cls: null, fid: null };
        let clsValue = 0;

        try {
          new PerformanceObserver((entryList) => {
            for (const entry of entryList.getEntries()) {
              if (entry.name === "first-contentful-paint") {
                vitals.fcp = entry.startTime;
              }
            }
          }).observe({ entryTypes: ["paint"] });

          new PerformanceObserver((entryList) => {
            const entries = entryList.getEntries();
            const lastEntry = entries[entries.length - 1];
            vitals.lcp = lastEntry.startTime;
          }).observe({ entryTypes: ["largest-contentful-paint"] });

          new PerformanceObserver((entryList) => {
            for (const entry of entryList.getEntries()) {
              if (!entry.hadRecentInput) {
                clsValue += entry.value;
              }
            }
            vitals.cls = clsValue;
          }).observe({ entryTypes: ["layout-shift"] });

          new PerformanceObserver((entryList) => {
            for (const entry of entryList.getEntries()) {
              vitals.fid = entry.processingStart - entry.startTime;
              break;
            }
          }).observe({ entryTypes: ["first-input"] });
        } catch (error) {
          console.warn("Performance observer not supported");
        }

        setTimeout(() => resolve(vitals), 5000);
      });
    });
  }

  async collectResourceMetrics(page) {
    return await page.evaluate(() => {
      const resources = performance.getEntriesByType("resource");
      const summary = {
        totalRequests: resources.length,
        totalSize: 0,
        imageRequests: 0,
        scriptRequests: 0,
        stylesheetRequests: 0,
        fontRequests: 0,
        slowResources: [],
        largeResources: [],
      };

      resources.forEach((resource) => {
        const size = resource.transferSize || 0;
        summary.totalSize += size;

        if (resource.duration > 3000) {
          summary.slowResources.push({
            name: resource.name,
            duration: resource.duration,
            size: size,
          });
        }

        if (size > 1000000) {
          summary.largeResources.push({
            name: resource.name,
            size: size,
            duration: resource.duration,
          });
        }

        if (resource.initiatorType === "img") summary.imageRequests++;
        else if (resource.initiatorType === "script") summary.scriptRequests++;
        else if (resource.initiatorType === "link")
          summary.stylesheetRequests++;
        else if (
          resource.name.includes(".woff") ||
          resource.name.includes(".ttf")
        )
          summary.fontRequests++;
      });

      return summary;
    });
  }

  auditCoreWebVitals(metrics, issues, warnings) {
    if (metrics.fcp && metrics.fcp > this.thresholds.fcp) {
      issues.push(
        this.createError(
          "poor_fcp",
          `First Contentful Paint is too slow (${Math.round(
            metrics.fcp
          )}ms). Should be under ${this.thresholds.fcp}ms`,
          {
            fcp: metrics.fcp,
            threshold: this.thresholds.fcp,
          }
        )
      );
    }

    if (metrics.lcp && metrics.lcp > this.thresholds.lcp) {
      issues.push(
        this.createError(
          "poor_lcp",
          `Largest Contentful Paint is too slow (${Math.round(
            metrics.lcp
          )}ms). Should be under ${this.thresholds.lcp}ms`,
          {
            lcp: metrics.lcp,
            threshold: this.thresholds.lcp,
          }
        )
      );
    }

    if (metrics.cls && metrics.cls > this.thresholds.cls) {
      issues.push(
        this.createError(
          "poor_cls",
          `Cumulative Layout Shift is too high (${metrics.cls.toFixed(
            3
          )}). Should be under ${this.thresholds.cls}`,
          {
            cls: metrics.cls,
            threshold: this.thresholds.cls,
          }
        )
      );
    }

    if (metrics.fid && metrics.fid > this.thresholds.fid) {
      warnings.push(
        this.createWarning(
          "poor_fid",
          `First Input Delay is high (${Math.round(
            metrics.fid
          )}ms). Should be under ${this.thresholds.fid}ms`,
          {
            fid: metrics.fid,
            threshold: this.thresholds.fid,
          }
        )
      );
    }

    if (metrics.ttfb && metrics.ttfb > this.thresholds.ttfb) {
      warnings.push(
        this.createWarning(
          "slow_ttfb",
          `Time to First Byte is slow (${Math.round(
            metrics.ttfb
          )}ms). Should be under ${this.thresholds.ttfb}ms`,
          {
            ttfb: metrics.ttfb,
            threshold: this.thresholds.ttfb,
          }
        )
      );
    }
  }

  auditLoadTimes(metrics, warnings) {
    if (metrics.domContentLoaded > 3000) {
      warnings.push(
        this.createWarning(
          "slow_dom_content_loaded",
          `DOM Content Loaded is slow (${Math.round(
            metrics.domContentLoaded
          )}ms)`,
          {
            domContentLoaded: metrics.domContentLoaded,
          }
        )
      );
    }

    if (metrics.loadComplete > 5000) {
      warnings.push(
        this.createWarning(
          "slow_load_complete",
          `Page load complete is slow (${Math.round(metrics.loadComplete)}ms)`,
          {
            loadComplete: metrics.loadComplete,
          }
        )
      );
    }

    if (metrics.domInteractive > 2500) {
      warnings.push(
        this.createWarning(
          "slow_dom_interactive",
          `DOM Interactive is slow (${Math.round(metrics.domInteractive)}ms)`,
          {
            domInteractive: metrics.domInteractive,
          }
        )
      );
    }
  }

  auditResourceUsage(resourceMetrics, warnings, recommendations) {
    if (resourceMetrics.totalRequests > 100) {
      warnings.push(
        this.createWarning(
          "too_many_requests",
          `High number of HTTP requests (${resourceMetrics.totalRequests}). Consider combining resources`,
          {
            totalRequests: resourceMetrics.totalRequests,
          }
        )
      );
    }

    if (resourceMetrics.totalSize > 5000000) {
      warnings.push(
        this.createWarning(
          "large_page_size",
          `Large total page size (${Math.round(
            resourceMetrics.totalSize / 1024 / 1024
          )}MB). Consider optimizing resources`,
          {
            totalSize: resourceMetrics.totalSize,
          }
        )
      );
    }

    if (resourceMetrics.imageRequests > 20) {
      recommendations.push(
        this.createRecommendation(
          "optimize_images",
          `High number of image requests (${resourceMetrics.imageRequests}). Consider using image sprites or lazy loading`
        )
      );
    }

    if (resourceMetrics.scriptRequests > 10) {
      recommendations.push(
        this.createRecommendation(
          "minimize_scripts",
          `High number of script requests (${resourceMetrics.scriptRequests}). Consider bundling JavaScript files`
        )
      );
    }

    resourceMetrics.slowResources.forEach((resource) => {
      warnings.push(
        this.createWarning(
          "slow_resource",
          `Slow loading resource: ${resource.name} (${Math.round(
            resource.duration
          )}ms)`,
          resource
        )
      );
    });

    resourceMetrics.largeResources.forEach((resource) => {
      warnings.push(
        this.createWarning(
          "large_resource",
          `Large resource: ${resource.name} (${Math.round(
            resource.size / 1024
          )}KB)`,
          resource
        )
      );
    });
  }

  calculatePerformanceScore(performanceMetrics, resourceMetrics) {
    let score = 100;

    if (performanceMetrics.fcp > this.thresholds.fcp) score -= 20;
    if (performanceMetrics.lcp > this.thresholds.lcp) score -= 20;
    if (performanceMetrics.cls > this.thresholds.cls) score -= 15;
    if (performanceMetrics.fid > this.thresholds.fid) score -= 10;
    if (performanceMetrics.ttfb > this.thresholds.ttfb) score -= 10;

    if (resourceMetrics.totalRequests > 100) score -= 10;
    if (resourceMetrics.totalSize > 5000000) score -= 10;

    score -= resourceMetrics.slowResources.length * 5;
    score -= resourceMetrics.largeResources.length * 3;

    return Math.max(0, score);
  }
}

export default PerformanceAuditor;
