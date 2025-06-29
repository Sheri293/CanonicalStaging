import BaseAuditor from "./BaseAuditor.js";
import fs from "fs-extra";
import path from "path";
import crypto from "crypto";

class HTMLStructureAuditor extends BaseAuditor {
  constructor(config = {}) {
    super(config);
    this.config = {
      baselineDir: config.baselineDir || "./baselines/structure",
      ignoreAttributes: config.ignoreAttributes || ["class", "id", "style"],
      importantElements: config.importantElements || [
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "title",
        'meta[name="description"]',
        'meta[name="keywords"]',
        "header",
        "nav",
        "main",
        "section",
        "article",
        "aside",
        "footer",
      ],
      styleAnalysis: config.styleAnalysis !== false,
      ...config,
    };
  }

  async audit(page, url) {
    try {
      const urlHash = this.createUrlHash(url);
      const currentStructure = await this.extractStructure(page);
      const currentStyling = this.config.styleAnalysis
        ? await this.extractStyling(page)
        : null;

      const issues = [];
      const warnings = [];

      const baselineFile = path.join(
        this.config.baselineDir,
        `${urlHash}_structure.json`
      );

      if (await fs.pathExists(baselineFile)) {
        const baseline = await fs.readJSON(baselineFile);

        const structureComparison = this.compareStructures(
          baseline.structure,
          currentStructure
        );
        const stylingComparison =
          this.config.styleAnalysis && baseline.styling
            ? this.compareStyling(baseline.styling, currentStyling)
            : null;

        this.processStructureChanges(structureComparison, issues, warnings);

        if (stylingComparison) {
          this.processStylingChanges(
            stylingComparison,
            structureComparison,
            issues,
            warnings
          );
        }

        return {
          url,
          currentStructure,
          baselineStructure: baseline.structure,
          structureComparison,
          stylingComparison,
          hasStructuralChanges: structureComparison.hasChanges,
          hasStylingCompensation: stylingComparison
            ? stylingComparison.hasCompensation
            : false,
          issues,
          warnings,

          score: this.calculateStructureScore(
            structureComparison,
            stylingComparison
          ),
          timestamp: new Date().toISOString(),
        };
      } else {
        await fs.ensureDir(this.config.baselineDir);
        await fs.writeJSON(
          baselineFile,
          {
            url,
            structure: currentStructure,
            styling: currentStyling,
            timestamp: new Date().toISOString(),
          },
          { spaces: 2 }
        );

        return {
          url,
          currentStructure,
          baselineCreated: true,
          issues: [],
          warnings: [],

          score: 100,
          timestamp: new Date().toISOString(),
        };
      }
    } catch (error) {
      this.logger.error("HTML structure audit failed", {
        error: error.message,
        stack: error.stack,
        url,
      });
      throw error;
    }
  }

  async extractStructure(page) {
    return await page.evaluate((importantElements) => {
      function getElementStructure(element, depth = 0) {
        if (depth > 10) return null;

        const structure = {
          tagName: element.tagName.toLowerCase(),
          textContent: element.textContent
            ? element.textContent.trim().substring(0, 100)
            : "",
          attributes: {},
          children: [],
          depth,
          selector: getElementSelector(element),
        };

        for (const attr of element.attributes) {
          if (
            [
              "href",
              "src",
              "alt",
              "title",
              "name",
              "content",
              "rel",
              "type",
            ].includes(attr.name)
          ) {
            structure.attributes[attr.name] = attr.value;
          }
        }

        for (const child of element.children) {
          const childStructure = getElementStructure(child, depth + 1);
          if (childStructure) {
            structure.children.push(childStructure);
          }
        }

        return structure;
      }

      function getElementSelector(element) {
        if (element.id) return `#${element.id}`;

        let selector = element.tagName.toLowerCase();
        let parent = element.parentElement;
        let current = element;

        while (parent && parent !== document.body) {
          const siblings = Array.from(parent.children).filter(
            (e) => e.tagName === current.tagName
          );
          if (siblings.length > 1) {
            const index = siblings.indexOf(current) + 1;
            selector = `${parent.tagName.toLowerCase()}:nth-child(${index}) > ${selector}`;
          } else {
            selector = `${parent.tagName.toLowerCase()} > ${selector}`;
          }
          current = parent;
          parent = parent.parentElement;
        }

        return selector;
      }

      const structure = {
        title: document.title,
        headings: [],
        importantElements: {},
        metaTags: [],
        fullStructure: getElementStructure(document.documentElement),
      };

      const headings = document.querySelectorAll("h1, h2, h3, h4, h5, h6");
      headings.forEach((heading, index) => {
        structure.headings.push({
          level: parseInt(heading.tagName.substring(1)),
          text: heading.textContent.trim(),
          selector: getElementSelector(heading),
          index,
          attributes: {
            id: heading.id || null,
            class: heading.className || null,
          },
        });
      });

      importantElements.forEach((selector) => {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          structure.importantElements[selector] = Array.from(elements).map(
            (el) => ({
              tagName: el.tagName.toLowerCase(),
              textContent: el.textContent
                ? el.textContent.trim().substring(0, 100)
                : "",
              selector: getElementSelector(el),
              attributes: {
                id: el.id || null,
                class: el.className || null,
              },
            })
          );
        }
      });

      const metaTags = document.querySelectorAll("meta");
      metaTags.forEach((meta) => {
        structure.metaTags.push({
          name: meta.name || meta.property || meta.httpEquiv || null,
          content: meta.content || null,
          attributes: {
            name: meta.name || null,
            property: meta.property || null,
            content: meta.content || null,
          },
        });
      });

      return structure;
    }, this.config.importantElements);
  }

  async extractStyling(page) {
    return await page.evaluate(() => {
      const styles = {};

      const headings = document.querySelectorAll("h1, h2, h3, h4, h5, h6");
      headings.forEach((heading, index) => {
        const computedStyle = window.getComputedStyle(heading);
        const selector =
          heading.tagName.toLowerCase() +
          (index > 0 ? `:nth-of-type(${index + 1})` : "");

        styles[selector] = {
          fontSize: computedStyle.fontSize,
          fontWeight: computedStyle.fontWeight,
          fontFamily: computedStyle.fontFamily,
          color: computedStyle.color,
          margin: computedStyle.margin,
          padding: computedStyle.padding,
          lineHeight: computedStyle.lineHeight,
          textTransform: computedStyle.textTransform,
          display: computedStyle.display,
        };
      });

      const importantSelectors = [
        "header",
        "nav",
        "main",
        "footer",
        ".hero",
        ".content",
      ];
      importantSelectors.forEach((selector) => {
        const element = document.querySelector(selector);
        if (element) {
          const computedStyle = window.getComputedStyle(element);
          styles[selector] = {
            display: computedStyle.display,
            position: computedStyle.position,
            width: computedStyle.width,
            height: computedStyle.height,
            margin: computedStyle.margin,
            padding: computedStyle.padding,
            backgroundColor: computedStyle.backgroundColor,
            border: computedStyle.border,
          };
        }
      });

      return styles;
    });
  }

  compareStructures(baseline, current) {
    const changes = {
      hasChanges: false,
      titleChanged: baseline.title !== current.title,
      headingChanges: this.compareHeadings(baseline.headings, current.headings),
      metaTagChanges: this.compareMetaTags(baseline.metaTags, current.metaTags),
      elementChanges: this.compareImportantElements(
        baseline.importantElements,
        current.importantElements
      ),
      structureChanges: [],
    };

    changes.hasChanges =
      changes.titleChanged ||
      changes.headingChanges.hasChanges ||
      changes.metaTagChanges.hasChanges ||
      changes.elementChanges.hasChanges;

    return changes;
  }

  compareHeadings(baselineHeadings, currentHeadings) {
    const changes = {
      hasChanges: false,
      added: [],
      removed: [],
      modified: [],
      hierarchyChanges: [],
    };

    baselineHeadings.forEach((baselineHeading, index) => {
      const currentHeading = currentHeadings[index];

      if (!currentHeading) {
        changes.removed.push(baselineHeading);
        changes.hasChanges = true;
      } else if (baselineHeading.level !== currentHeading.level) {
        changes.hierarchyChanges.push({
          index,
          from: `H${baselineHeading.level}`,
          to: `H${currentHeading.level}`,
          text: currentHeading.text,
          selector: currentHeading.selector,
          impact: this.assessHierarchyImpact(
            baselineHeading.level,
            currentHeading.level
          ),
        });
        changes.hasChanges = true;
      } else if (baselineHeading.text !== currentHeading.text) {
        changes.modified.push({
          index,
          level: currentHeading.level,
          from: baselineHeading.text,
          to: currentHeading.text,
          selector: currentHeading.selector,
        });
        changes.hasChanges = true;
      }
    });

    if (currentHeadings.length > baselineHeadings.length) {
      const newHeadings = currentHeadings.slice(baselineHeadings.length);
      changes.added.push(...newHeadings);
      changes.hasChanges = true;
    }

    return changes;
  }

  compareMetaTags(baselineMeta, currentMeta) {
    const changes = {
      hasChanges: false,
      added: [],
      removed: [],
      modified: [],
    };

    const baselineMap = new Map(
      baselineMeta.map((m) => [m.name || m.property || "unnamed", m])
    );
    const currentMap = new Map(
      currentMeta.map((m) => [m.name || m.property || "unnamed", m])
    );

    baselineMap.forEach((baselineTag, key) => {
      const currentTag = currentMap.get(key);
      if (!currentTag) {
        changes.removed.push(baselineTag);
        changes.hasChanges = true;
      } else if (baselineTag.content !== currentTag.content) {
        changes.modified.push({
          name: key,
          from: baselineTag.content,
          to: currentTag.content,
        });
        changes.hasChanges = true;
      }
    });

    currentMap.forEach((currentTag, key) => {
      if (!baselineMap.has(key)) {
        changes.added.push(currentTag);
        changes.hasChanges = true;
      }
    });

    return changes;
  }

  compareImportantElements(baselineElements, currentElements) {
    const changes = {
      hasChanges: false,
      selectorChanges: {},
    };

    for (const selector in baselineElements) {
      const baseline = baselineElements[selector];
      const current = currentElements[selector];

      if (!current) {
        changes.selectorChanges[selector] = {
          type: "removed",
          baseline: baseline.length,
          current: 0,
        };
        changes.hasChanges = true;
      } else if (baseline.length !== current.length) {
        changes.selectorChanges[selector] = {
          type: "count_changed",
          baseline: baseline.length,
          current: current.length,
        };
        changes.hasChanges = true;
      }
    }

    for (const selector in currentElements) {
      if (!baselineElements[selector]) {
        changes.selectorChanges[selector] = {
          type: "added",
          baseline: 0,
          current: currentElements[selector].length,
        };
        changes.hasChanges = true;
      }
    }

    return changes;
  }

  compareStyling(baselineStyling, currentStyling) {
    const changes = {
      hasCompensation: false,
      styleChanges: {},
      suspiciousChanges: [],
    };

    for (const selector in baselineStyling) {
      const baseline = baselineStyling[selector];
      const current = currentStyling[selector];

      if (current) {
        const selectorChanges = {};
        let hasChanges = false;

        for (const property in baseline) {
          if (baseline[property] !== current[property]) {
            selectorChanges[property] = {
              from: baseline[property],
              to: current[property],
            };
            hasChanges = true;
          }
        }

        if (hasChanges) {
          changes.styleChanges[selector] = selectorChanges;

          if (this.isSuspiciousStyling(selector, selectorChanges)) {
            changes.suspiciousChanges.push({
              selector,
              reason: "heading_impersonation",
              changes: selectorChanges,
            });
            changes.hasCompensation = true;
          }
        }
      }
    }

    return changes;
  }

  isSuspiciousStyling(selector, styleChanges) {
    if (selector.match(/^h[2-6]/)) {
      const fontSize = styleChanges.fontSize;
      const fontWeight = styleChanges.fontWeight;

      if (
        fontSize &&
        this.isSignificantFontSizeIncrease(fontSize.from, fontSize.to)
      ) {
        return true;
      }

      if (fontWeight && this.isWeightIncrease(fontWeight.from, fontWeight.to)) {
        return true;
      }
    }

    return false;
  }

  isSignificantFontSizeIncrease(from, to) {
    const fromPx = parseFloat(from);
    const toPx = parseFloat(to);
    return toPx > fromPx * 1.2;
  }

  isWeightIncrease(from, to) {
    const weights = { normal: 400, bold: 700 };
    const fromWeight = weights[from] || parseFloat(from) || 400;
    const toWeight = weights[to] || parseFloat(to) || 400;
    return toWeight > fromWeight;
  }

  assessHierarchyImpact(fromLevel, toLevel) {
    if (fromLevel === 1 && toLevel > 1) {
      return "critical";
    } else if (fromLevel < toLevel) {
      return "warning";
    } else if (fromLevel > toLevel) {
      return "improvement";
    }
    return "neutral";
  }

  processStructureChanges(comparison, issues, warnings) {
    if (comparison.titleChanged) {
      warnings.push(
        this.createWarning("title_changed", "Page title has been modified", {
          comparison: "title change detected",
        })
      );
    }

    if (comparison.headingChanges.hierarchyChanges.length > 0) {
      comparison.headingChanges.hierarchyChanges.forEach((change) => {
        if (change.impact === "critical") {
          issues.push(
            this.createError(
              "critical_heading_change",
              `Critical SEO issue: ${change.from} changed to ${change.to} - "${change.text}"`,
              change
            )
          );
        } else if (change.impact === "warning") {
          warnings.push(
            this.createWarning(
              "heading_hierarchy_degraded",
              `Heading hierarchy degraded: ${change.from} → ${change.to}`,
              change
            )
          );
        }
      });
    }

    if (comparison.metaTagChanges.hasChanges) {
      comparison.metaTagChanges.removed.forEach((removed) => {
        if (removed.name === "description") {
          issues.push(
            this.createError(
              "meta_description_removed",
              "Meta description has been removed",
              removed
            )
          );
        }
      });

      comparison.metaTagChanges.modified.forEach((modified) => {
        if (modified.name === "description") {
          warnings.push(
            this.createWarning(
              "meta_description_changed",
              "Meta description content has been modified",
              modified
            )
          );
        }
      });
    }
  }

  processStylingChanges(
    stylingComparison,
    structureComparison,
    issues,
    warnings
  ) {
    if (stylingComparison.hasCompensation) {
      stylingComparison.suspiciousChanges.forEach((change) => {
        const structuralChange =
          structureComparison.headingChanges.hierarchyChanges.find((hc) =>
            hc.selector.includes(change.selector)
          );

        if (structuralChange) {
          issues.push(
            this.createError(
              "seo_manipulation_detected",
              `SEO manipulation detected: ${structuralChange.from} changed to ${structuralChange.to} but styled to appear as ${structuralChange.from}`,
              {
                structuralChange,
                stylingChange: change,
                impact: "This deceives users but hurts SEO rankings",
              }
            )
          );
        } else {
          warnings.push(
            this.createWarning(
              "suspicious_styling",
              `Suspicious styling changes detected on ${change.selector}`,
              change
            )
          );
        }
      });
    }
  }

  calculateStructureScore(structureComparison, stylingComparison) {
    let score = 100;

    if (structureComparison.hasChanges) {
      const criticalHeadingChanges =
        structureComparison.headingChanges.hierarchyChanges.filter(
          (c) => c.impact === "critical"
        ).length;
      score -= criticalHeadingChanges * 30;

      const warningHeadingChanges =
        structureComparison.headingChanges.hierarchyChanges.filter(
          (c) => c.impact === "warning"
        ).length;
      score -= warningHeadingChanges * 15;

      score -= structureComparison.headingChanges.removed.length * 10;
      score -= structureComparison.metaTagChanges.removed.length * 20;
      score -= structureComparison.metaTagChanges.modified.length * 5;
    }

    if (stylingComparison && stylingComparison.hasCompensation) {
      score -= stylingComparison.suspiciousChanges.length * 25;
    }

    return Math.max(0, Math.round(score));
  }

  createUrlHash(url) {
    return crypto.createHash("md5").update(url).digest("hex").substring(0, 8);
  }

  async createBaseline(page, url) {
    const urlHash = this.createUrlHash(url);
    const baselineFile = path.join(
      this.config.baselineDir,
      `${urlHash}_structure.json`
    );

    if (await fs.pathExists(baselineFile)) {
      await fs.remove(baselineFile);
    }

    return await this.audit(page, url);
  }
}

export default HTMLStructureAuditor;
