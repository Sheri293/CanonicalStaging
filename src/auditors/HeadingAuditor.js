import BaseAuditor from "./BaseAuditor.js";

class HeadingAuditor extends BaseAuditor {
  constructor(config = {}) {
    super(config);
  }

  async audit(page, url) {
    try {
      const headingData = await page.evaluate(() => {
        const headings = [];
        const headingSelectors = ["h1", "h2", "h3", "h4", "h5", "h6"];

        headingSelectors.forEach((selector) => {
          const elements = document.querySelectorAll(selector);
          elements.forEach((element, index) => {
            headings.push({
              level: parseInt(selector.replace("h", "")),
              text: element.textContent ? element.textContent.trim() : "",
              isEmpty:
                !element.textContent || element.textContent.trim() === "",
              hasId: !!element.id,
              id: element.id || null,
              position: index,
              elementIndex: Array.from(
                document.querySelectorAll(selector)
              ).indexOf(element),
            });
          });
        });

        const sortedHeadings = headings.sort((a, b) => {
          try {
            const aSelector = `${headingSelectors[a.level - 1]}:nth-of-type(${
              a.position + 1
            })`;
            const bSelector = `${headingSelectors[b.level - 1]}:nth-of-type(${
              b.position + 1
            })`;

            const aElement = document.querySelector(aSelector);
            const bElement = document.querySelector(bSelector);

            if (!aElement || !bElement) {
              return a.elementIndex - b.elementIndex;
            }

            const position = aElement.compareDocumentPosition(bElement);
            return position & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
          } catch (error) {
            return a.elementIndex - b.elementIndex;
          }
        });

        return {
          headings: sortedHeadings,
          h1Count: document.querySelectorAll("h1").length,
          totalHeadings: headings.length,
        };
      });

      const issues = [];
      const warnings = [];
      const recommendations = [];

      this.auditH1Tags(headingData, issues, warnings, recommendations);
      this.auditHeadingHierarchy(
        headingData,
        issues,
        warnings,
        recommendations
      );
      this.auditEmptyHeadings(headingData, issues, warnings, recommendations);
      this.auditHeadingStructure(
        headingData,
        issues,
        warnings,
        recommendations
      );

      return {
        headings: headingData.headings,
        h1Count: headingData.h1Count,
        totalHeadings: headingData.totalHeadings,
        hierarchy: this.analyzeHierarchy(headingData.headings),
        issues,
        warnings,
        recommendations,
        score: this.calculateScore(issues, warnings),
      };
    } catch (error) {
      this.logger.error("Heading audit failed", {
        error: error.message,
        stack: error.stack,
        url,
      });
      throw error;
    }
  }

  auditH1Tags(headingData, issues, warnings) {
    if (headingData.h1Count === 0) {
      issues.push(
        this.createError("missing_h1", "Page is missing H1 tag", {
          h1Count: headingData.h1Count,
        })
      );
    } else if (headingData.h1Count > 1) {
      warnings.push(
        this.createWarning(
          "multiple_h1",
          `Page has multiple H1 tags (${headingData.h1Count}). Consider using only one H1 per page`,
          {
            h1Count: headingData.h1Count,
          }
        )
      );
    }

    const h1Headings = headingData.headings.filter((h) => h.level === 1);
    h1Headings.forEach((h1) => {
      if (h1.isEmpty) {
        issues.push(
          this.createError("empty_h1", "H1 tag is empty", { text: h1.text })
        );
      }
    });
  }

  auditHeadingHierarchy(headingData, warnings) {
    const headings = headingData.headings;
    let previousLevel = 0;

    for (let i = 0; i < headings.length; i++) {
      const currentLevel = headings[i].level;

      if (i === 0 && currentLevel !== 1) {
        warnings.push(
          this.createWarning(
            "first_heading_not_h1",
            `First heading should be H1, found H${currentLevel}`,
            {
              level: currentLevel,
              text: headings[i].text,
            }
          )
        );
      }

      if (currentLevel > previousLevel + 1) {
        warnings.push(
          this.createWarning(
            "heading_hierarchy_skip",
            `Heading hierarchy skips levels: H${previousLevel} to H${currentLevel}`,
            {
              from: previousLevel,
              to: currentLevel,
              text: headings[i].text,
              position: i,
            }
          )
        );
      }

      previousLevel = currentLevel;
    }
  }

  auditEmptyHeadings(headingData, issues) {
    const emptyHeadings = headingData.headings.filter((h) => h.isEmpty);

    emptyHeadings.forEach((heading) => {
      issues.push(
        this.createError("empty_heading", `Empty H${heading.level} tag found`, {
          level: heading.level,
          position: heading.position,
        })
      );
    });
  }

  auditHeadingStructure(headingData, warnings, recommendations) {
    if (headingData.totalHeadings === 0) {
      warnings.push(
        this.createWarning("no_headings", "Page has no heading tags", {
          totalHeadings: headingData.totalHeadings,
        })
      );
    }

    const longHeadings = headingData.headings.filter((h) => h.text.length > 70);
    longHeadings.forEach((heading) => {
      recommendations.push(
        this.createRecommendation(
          "long_heading",
          `H${heading.level} is quite long (${heading.text.length} characters). Consider shortening`,
          {
            level: heading.level,
            text: heading.text,
            length: heading.text.length,
          }
        )
      );
    });

    const headingsWithoutId = headingData.headings.filter((h) => !h.hasId);
    if (headingsWithoutId.length > 0) {
      recommendations.push(
        this.createRecommendation(
          "headings_without_id",
          `${headingsWithoutId.length} headings don't have ID attributes. Consider adding IDs for better accessibility and navigation`
        )
      );
    }
  }

  analyzeHierarchy(headings) {
    const hierarchy = {};
    let currentParents = {};

    headings.forEach((heading) => {
      const level = heading.level;

      if (!hierarchy[level]) {
        hierarchy[level] = [];
      }

      hierarchy[level].push({
        text: heading.text,
        isEmpty: heading.isEmpty,
        hasId: heading.hasId,
        parent: currentParents[level - 1] || null,
      });

      currentParents[level] = heading.text;

      for (let i = level + 1; i <= 6; i++) {
        delete currentParents[i];
      }
    });

    return hierarchy;
  }

  calculateScore(issues, warnings) {
    let score = 100;
    score -= issues.length * 20;
    score -= warnings.length * 10;
    return Math.max(0, score);
  }
}

export default HeadingAuditor;
