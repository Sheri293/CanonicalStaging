const BaseAuditor = require("./BaseAuditor");
const axios = require("axios");

class BrokenLinkAuditor extends BaseAuditor {
  constructor(config = {}) {
    super(config);
    this.concurrent = config.concurrent || 5;
    this.timeout = config.timeout || 10000;
    this.checkExternal = config.checkExternal !== false;
  }

  async audit(page, url) {
    try {
      const links = await this.extractAllLinks(page, url);
      const linkCheckResults = await this.checkLinks(links);

      const issues = [];
      const warnings = [];
      const recommendations = [];

      this.auditBrokenLinks(
        linkCheckResults,
        issues,
        warnings,
        recommendations
      );
      this.auditLinkTypes(linkCheckResults, issues, warnings, recommendations);

      const brokenLinks = linkCheckResults.filter((link) => link.isBroken);
      const workingLinks = linkCheckResults.filter((link) => !link.isBroken);

      return {
        totalLinks: linkCheckResults.length,
        brokenLinks: brokenLinks.length,
        workingLinks: workingLinks.length,
        externalLinks: linkCheckResults.filter((link) => link.isExternal)
          .length,
        internalLinks: linkCheckResults.filter((link) => !link.isExternal)
          .length,
        links: linkCheckResults,
        issues,
        warnings,
        recommendations,
        score: this.calculateScore(brokenLinks.length, linkCheckResults.length),
      };
    } catch (error) {
      this.logger.error("Broken link audit failed", error);
      throw error;
    }
  }

  async extractAllLinks(page, currentUrl) {
    return await page.evaluate((pageUrl) => {
      const links = [];
      const currentDomain = new URL(pageUrl).hostname;

      const anchors = document.querySelectorAll("a[href]");
      anchors.forEach((anchor, index) => {
        const href = anchor.getAttribute("href");
        const text = anchor.textContent.trim();
        const title = anchor.getAttribute("title") || "";

        if (href) {
          try {
            const absoluteUrl = href.startsWith("http")
              ? href
              : new URL(href, pageUrl).href;
            const linkDomain = new URL(absoluteUrl).hostname;

            links.push({
              url: absoluteUrl,
              text,
              title,
              isExternal: linkDomain !== currentDomain,
              element: "a",
              position: index,
              href: href,
            });
          } catch (error) {
            links.push({
              url: href,
              text,
              title,
              isExternal: false,
              element: "a",
              position: index,
              href: href,
              malformed: true,
            });
          }
        }
      });

      const images = document.querySelectorAll("img[src]");
      images.forEach((img, index) => {
        const src = img.getAttribute("src");
        const alt = img.getAttribute("alt") || "";

        if (src) {
          try {
            const absoluteUrl = src.startsWith("http")
              ? src
              : new URL(src, pageUrl).href;
            const linkDomain = new URL(absoluteUrl).hostname;

            links.push({
              url: absoluteUrl,
              text: alt,
              title: alt,
              isExternal: linkDomain !== currentDomain,
              element: "img",
              position: index,
              href: src,
            });
          } catch (error) {
            links.push({
              url: src,
              text: alt,
              title: alt,
              isExternal: false,
              element: "img",
              position: index,
              href: src,
              malformed: true,
            });
          }
        }
      });

      return links;
    }, currentUrl);
  }

  async checkLinks(links) {
    const results = [];
    const pending = [...links];
    let running = 0;

    while (pending.length > 0 || running > 0) {
      while (running < this.concurrent && pending.length > 0) {
        const link = pending.shift();
        running++;

        this.checkSingleLink(link)
          .then((result) => {
            results.push(result);
            running--;
          })
          .catch((error) => {
            results.push({
              ...link,
              isBroken: true,
              statusCode: null,
              error: error.message,
              responseTime: null,
            });
            running--;
          });
      }

      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    return results;
  }

  async checkSingleLink(link) {
    const startTime = Date.now();

    if (link.malformed) {
      return {
        ...link,
        isBroken: true,
        statusCode: null,
        error: "Malformed URL",
        responseTime: null,
      };
    }

    if (!this.checkExternal && link.isExternal) {
      return {
        ...link,
        isBroken: false,
        statusCode: null,
        error: null,
        responseTime: null,
        skipped: true,
      };
    }

    try {
      const response = await axios.head(link.url, {
        timeout: this.timeout,
        maxRedirects: 5,
        validateStatus: (status) => status < 500,
        headers: {
          "User-Agent": this.config.userAgent || "SEO-Landing-Page-Auditor/2.0",
        },
      });

      const responseTime = Date.now() - startTime;
      const isBroken = response.status >= 400;

      return {
        ...link,
        isBroken,
        statusCode: response.status,
        error: isBroken ? `HTTP ${response.status}` : null,
        responseTime,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;

      if (error.response) {
        return {
          ...link,
          isBroken: true,
          statusCode: error.response.status,
          error: `HTTP ${error.response.status}`,
          responseTime,
        };
      } else if (error.code === "ECONNABORTED") {
        return {
          ...link,
          isBroken: true,
          statusCode: null,
          error: "Timeout",
          responseTime,
        };
      } else {
        return {
          ...link,
          isBroken: true,
          statusCode: null,
          error: error.message,
          responseTime,
        };
      }
    }
  }

  auditBrokenLinks(linkCheckResults, issues, warnings, recommendations) {
    const brokenLinks = linkCheckResults.filter((link) => link.isBroken);

    brokenLinks.forEach((link) => {
      if (link.element === "a") {
        issues.push(
          this.createError(
            "broken_link",
            `Broken link found: ${link.text || link.url}`,
            {
              url: link.url,
              text: link.text,
              error: link.error,
              statusCode: link.statusCode,
              element: link.element,
            }
          )
        );
      } else if (link.element === "img") {
        issues.push(
          this.createError(
            "broken_image",
            `Broken image found: ${link.text || link.url}`,
            {
              url: link.url,
              alt: link.text,
              error: link.error,
              statusCode: link.statusCode,
              element: link.element,
            }
          )
        );
      } else {
        warnings.push(
          this.createWarning(
            "broken_resource",
            `Broken resource found: ${link.url}`,
            {
              url: link.url,
              error: link.error,
              statusCode: link.statusCode,
              element: link.element,
            }
          )
        );
      }
    });

    if (brokenLinks.length === 0) {
      recommendations.push(
        this.createRecommendation(
          "no_broken_links",
          "Excellent! No broken links found on this page"
        )
      );
    }
  }

  auditLinkTypes(linkCheckResults, issues, warnings, recommendations) {
    const externalLinks = linkCheckResults.filter((link) => link.isExternal);
    const slowLinks = linkCheckResults.filter(
      (link) => link.responseTime > 5000
    );

    if (externalLinks.length > 50) {
      warnings.push(
        this.createWarning(
          "many_external_links",
          `Page has many external links (${externalLinks.length}). Consider reviewing if all are necessary`,
          { externalLinkCount: externalLinks.length }
        )
      );
    }

    slowLinks.forEach((link) => {
      warnings.push(
        this.createWarning(
          "slow_loading_link",
          `Link loads slowly (${link.responseTime}ms): ${link.url}`,
          { url: link.url, responseTime: link.responseTime }
        )
      );
    });

    const linksWithoutText = linkCheckResults.filter(
      (link) => link.element === "a" && (!link.text || link.text.trim() === "")
    );

    linksWithoutText.forEach((link) => {
      warnings.push(
        this.createWarning(
          "link_without_text",
          "Link found without descriptive text",
          { url: link.url }
        )
      );
    });

    const imagesWithoutAlt = linkCheckResults.filter(
      (link) =>
        link.element === "img" && (!link.text || link.text.trim() === "")
    );

    imagesWithoutAlt.forEach((link) => {
      warnings.push(
        this.createWarning(
          "image_without_alt",
          "Image found without alt text",
          { url: link.url }
        )
      );
    });
  }

  calculateScore(brokenLinkCount, totalLinkCount) {
    if (totalLinkCount === 0) return 100;

    const brokenPercentage = (brokenLinkCount / totalLinkCount) * 100;
    let score = 100 - brokenPercentage * 2;

    return Math.max(0, Math.round(score));
  }
}

module.exports = BrokenLinkAuditor;
