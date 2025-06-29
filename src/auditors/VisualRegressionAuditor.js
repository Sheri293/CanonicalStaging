import BaseAuditor from "./BaseAuditor.js";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import fs from "fs-extra";
import path from "path";
import crypto from "crypto";

class VisualRegressionAuditor extends BaseAuditor {
  constructor(config = {}) {
    super(config);
    this.config = {
      baselineDir: config.baselineDir || "./baselines/screenshots",
      currentDir: config.currentDir || "./current/screenshots",
      diffDir: config.diffDir || "./diffs/screenshots",
      threshold: config.threshold || 0.1,
      captureViewports: config.captureViewports || [
        { width: 1920, height: 1080, name: "desktop" },
        { width: 768, height: 1024, name: "tablet" },
        { width: 375, height: 667, name: "mobile" },
      ],
      captureElements: config.captureElements || [
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "header",
        "nav",
        "main",
        "footer",
        ".hero",
        ".content",
        ".sidebar",
      ],
      ...config,
    };
  }

  async audit(page, url) {
    try {
      const urlHash = this.createUrlHash(url);
      const screenshots = [];
      const comparisons = [];
      const issues = [];
      const warnings = [];
      const recommendations = [];

      for (const viewport of this.config.captureViewports) {
        await page.setViewportSize(viewport);
        await page.waitForTimeout(1000);

        const fullPageResult = await this.captureFullPage(
          page,
          url,
          viewport,
          urlHash
        );
        screenshots.push(fullPageResult.screenshot);

        if (fullPageResult.comparison) {
          comparisons.push(fullPageResult.comparison);
          this.processComparison(
            fullPageResult.comparison,
            issues,
            warnings,
            recommendations
          );
        }

        for (const selector of this.config.captureElements) {
          try {
            const elementResult = await this.captureElement(
              page,
              selector,
              url,
              viewport,
              urlHash
            );
            if (elementResult) {
              screenshots.push(elementResult.screenshot);
              if (elementResult.comparison) {
                comparisons.push(elementResult.comparison);
                this.processComparison(
                  elementResult.comparison,
                  issues,
                  warnings,
                  recommendations
                );
              }
            }
          } catch (error) {
            continue;
          }
        }
      }

      return {
        url,
        screenshots,
        comparisons,
        visualChanges: comparisons.filter((c) => c.hasChanges),
        issues,
        warnings,
        recommendations,
        score: this.calculateVisualScore(comparisons),
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error("Visual regression audit failed", {
        error: error.message,
        stack: error.stack,
        url,
      });
      throw error;
    }
  }

  async captureFullPage(page, url, viewport, urlHash) {
    const filename = `${urlHash}_fullpage_${viewport.name}.png`;
    const currentPath = path.join(this.config.currentDir, filename);
    const baselinePath = path.join(this.config.baselineDir, filename);
    const diffPath = path.join(this.config.diffDir, filename);

    await fs.ensureDir(this.config.currentDir);
    await fs.ensureDir(this.config.diffDir);

    const screenshot = await page.screenshot({
      path: currentPath,
      fullPage: true,
      type: "png",
    });

    const screenshotInfo = {
      filename,
      path: currentPath,
      viewport: viewport.name,
      element: "fullpage",
      size: screenshot.length,
    };

    if (await fs.pathExists(baselinePath)) {
      const comparison = await this.compareScreenshots(
        baselinePath,
        currentPath,
        diffPath
      );
      return {
        screenshot: screenshotInfo,
        comparison: {
          ...comparison,
          element: "fullpage",
          viewport: viewport.name,
          url,
        },
      };
    } else {
      await fs.ensureDir(this.config.baselineDir);
      await fs.copy(currentPath, baselinePath);

      return {
        screenshot: screenshotInfo,
        comparison: null,
      };
    }
  }

  async captureElement(page, selector, url, viewport, urlHash) {
    const element = await page.$(selector);
    if (!element) return null;

    const elementName = selector.replace(/[^a-zA-Z0-9]/g, "_");
    const filename = `${urlHash}_${elementName}_${viewport.name}.png`;
    const currentPath = path.join(this.config.currentDir, filename);
    const baselinePath = path.join(this.config.baselineDir, filename);
    const diffPath = path.join(this.config.diffDir, filename);

    const screenshot = await element.screenshot({
      path: currentPath,
      type: "png",
    });

    const screenshotInfo = {
      filename,
      path: currentPath,
      viewport: viewport.name,
      element: selector,
      size: screenshot.length,
    };

    if (await fs.pathExists(baselinePath)) {
      const comparison = await this.compareScreenshots(
        baselinePath,
        currentPath,
        diffPath
      );
      return {
        screenshot: screenshotInfo,
        comparison: {
          ...comparison,
          element: selector,
          viewport: viewport.name,
          url,
        },
      };
    } else {
      await fs.copy(currentPath, baselinePath);
      return {
        screenshot: screenshotInfo,
        comparison: null,
      };
    }
  }

  async compareScreenshots(baselinePath, currentPath, diffPath) {
    try {
      const baseline = PNG.sync.read(fs.readFileSync(baselinePath));
      const current = PNG.sync.read(fs.readFileSync(currentPath));

      const { width, height } = baseline;
      const diff = new PNG({ width, height });

      if (current.width !== width || current.height !== height) {
        return {
          hasChanges: true,
          reason: "dimension_change",
          baselineDimensions: { width, height },
          currentDimensions: { width: current.width, height: current.height },
          diffPixels: width * height,
          diffPercentage: 100,
          diffPath: null,
        };
      }

      const diffPixels = pixelmatch(
        baseline.data,
        current.data,
        diff.data,
        width,
        height,
        {
          threshold: 0.1,
          includeAA: false,
        }
      );

      const diffPercentage = (diffPixels / (width * height)) * 100;
      const hasChanges = diffPercentage > this.config.threshold;

      if (hasChanges) {
        await fs.ensureDir(path.dirname(diffPath));
        fs.writeFileSync(diffPath, PNG.sync.write(diff));
      }

      return {
        hasChanges,
        reason: hasChanges ? "visual_difference" : "no_change",
        diffPixels,
        diffPercentage,
        diffPath: hasChanges ? diffPath : null,
        baselineDimensions: { width, height },
        currentDimensions: { width: current.width, height: current.height },
      };
    } catch (error) {
      return {
        hasChanges: true,
        reason: "comparison_error",
        error: error.message,
        diffPath: null,
      };
    }
  }

  processComparison(comparison, issues, warnings, recommendations) {
    if (!comparison.hasChanges) return;

    if (comparison.reason === "dimension_change") {
      issues.push(
        this.createError(
          "layout_dimension_change",
          `Layout dimensions changed for ${comparison.element} on ${comparison.viewport}`,
          {
            element: comparison.element,
            viewport: comparison.viewport,
            baseline: comparison.baselineDimensions,
            current: comparison.currentDimensions,
          }
        )
      );
    } else if (comparison.diffPercentage > 50) {
      issues.push(
        this.createError(
          "major_visual_change",
          `Major visual changes detected in ${
            comparison.element
          } (${comparison.diffPercentage.toFixed(2)}% different)`,
          {
            element: comparison.element,
            viewport: comparison.viewport,
            diffPercentage: comparison.diffPercentage,
            diffPath: comparison.diffPath,
          }
        )
      );
    } else if (comparison.diffPercentage > 20) {
      warnings.push(
        this.createWarning(
          "moderate_visual_change",
          `Moderate visual changes in ${
            comparison.element
          } (${comparison.diffPercentage.toFixed(2)}% different)`,
          {
            element: comparison.element,
            viewport: comparison.viewport,
            diffPercentage: comparison.diffPercentage,
            diffPath: comparison.diffPath,
          }
        )
      );
    } else {
      recommendations.push(
        this.createRecommendation(
          "minor_visual_change",
          `Minor visual changes detected in ${comparison.element}`,
          {
            element: comparison.element,
            viewport: comparison.viewport,
            diffPercentage: comparison.diffPercentage,
          }
        )
      );
    }
  }

  calculateVisualScore(comparisons) {
    if (comparisons.length === 0) return 100;

    const changedComparisons = comparisons.filter((c) => c.hasChanges);
    if (changedComparisons.length === 0) return 100;

    const avgDiffPercentage =
      changedComparisons.reduce((sum, c) => sum + c.diffPercentage, 0) /
      changedComparisons.length;
    const changeRatio = changedComparisons.length / comparisons.length;

    let score = 100;
    score -= avgDiffPercentage * 2;
    score -= changeRatio * 30;

    return Math.max(0, Math.round(score));
  }

  createUrlHash(url) {
    return crypto.createHash("md5").update(url).digest("hex").substring(0, 8);
  }

  async createBaseline(page, url) {
    const urlHash = this.createUrlHash(url);
    const baselineFiles = await fs
      .readdir(this.config.baselineDir)
      .catch(() => []);

    for (const file of baselineFiles) {
      if (file.startsWith(urlHash)) {
        await fs.remove(path.join(this.config.baselineDir, file));
      }
    }

    return await this.audit(page, url);
  }
}

export default VisualRegressionAuditor;
