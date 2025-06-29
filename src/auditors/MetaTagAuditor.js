import BaseAuditor from "./BaseAuditor.js";

class MetaTagAuditor extends BaseAuditor {
  constructor(config = {}) {
    super(config);
    this.titleMinLength = config.titleMinLength || 30;
    this.titleMaxLength = config.titleMaxLength || 60;
    this.descriptionMinLength = config.descriptionMinLength || 120;
    this.descriptionMaxLength = config.descriptionMaxLength || 160;
  }

  async audit(page) {
    try {
      const metaData = await page.evaluate(() => {
        const title = document.title || "";
        const metaDescription = document.querySelector(
          "meta[name='description']"
        );
        const metaKeywords = document.querySelector("meta[name='keywords']");
        const metaRobots = document.querySelector("meta[name='robots']");
        const metaViewport = document.querySelector("meta[name='viewport']");
        const ogTitle = document.querySelector("meta[property='og:title']");
        const ogDescription = document.querySelector(
          "meta[property='og:description']"
        );
        const ogImage = document.querySelector("meta[property='og:image']");
        const ogUrl = document.querySelector("meta[property='og:url']");
        const twitterCard = document.querySelector("meta[name='twitter:card']");
        const twitterTitle = document.querySelector(
          "meta[name='twitter:title']"
        );
        const twitterDescription = document.querySelector(
          "meta[name='twitter:description']"
        );

        return {
          title,
          description: metaDescription ? metaDescription.content : null,
          keywords: metaKeywords ? metaKeywords.content : null,
          robots: metaRobots ? metaRobots.content : null,
          viewport: metaViewport ? metaViewport.content : null,
          ogTitle: ogTitle ? ogTitle.content : null,
          ogDescription: ogDescription ? ogDescription.content : null,
          ogImage: ogImage ? ogImage.content : null,
          ogUrl: ogUrl ? ogUrl.content : null,
          twitterCard: twitterCard ? twitterCard.content : null,
          twitterTitle: twitterTitle ? twitterTitle.content : null,
          twitterDescription: twitterDescription
            ? twitterDescription.content
            : null,
        };
      });

      const issues = [];
      const warnings = [];
      const recommendations = [];

      this.auditTitle(metaData.title, issues, warnings, recommendations);
      this.auditDescription(
        metaData.description,
        issues,
        warnings,
        recommendations
      );
      this.auditViewport(metaData.viewport, issues, warnings, recommendations);
      this.auditOpenGraph(metaData, issues, warnings, recommendations);
      this.auditTwitterCards(metaData, issues, warnings, recommendations);
      this.auditRobots(metaData.robots, issues, warnings, recommendations);

      return {
        title: metaData.title,
        description: metaData.description,
        keywords: metaData.keywords,
        robots: metaData.robots,
        viewport: metaData.viewport,
        openGraph: {
          title: metaData.ogTitle,
          description: metaData.ogDescription,
          image: metaData.ogImage,
          url: metaData.ogUrl,
        },
        twitter: {
          card: metaData.twitterCard,
          title: metaData.twitterTitle,
          description: metaData.twitterDescription,
        },
        issues,
        warnings,
        recommendations,
        score: this.calculateScore(issues, warnings),
      };
    } catch (error) {
      this.logger.error("Meta tag audit failed", error);
      throw error;
    }
  }

  auditTitle(title, issues, warnings) {
    if (!title || title.trim() === "") {
      issues.push(
        this.createError("missing_title", "Page is missing title tag", {
          title,
        })
      );
    } else {
      const titleLength = title.length;

      if (titleLength < this.titleMinLength) {
        warnings.push(
          this.createWarning(
            "title_too_short",
            `Title is too short (${titleLength} characters). Recommended: ${this.titleMinLength}-${this.titleMaxLength}`,
            {
              title,
              length: titleLength,
            }
          )
        );
      }

      if (titleLength > this.titleMaxLength) {
        warnings.push(
          this.createWarning(
            "title_too_long",
            `Title is too long (${titleLength} characters). Recommended: ${this.titleMinLength}-${this.titleMaxLength}`,
            {
              title,
              length: titleLength,
            }
          )
        );
      }
    }
  }

  auditDescription(description, issues, warnings) {
    if (!description || description.trim() === "") {
      issues.push(
        this.createError(
          "missing_description",
          "Page is missing meta description",
          { description }
        )
      );
    } else {
      const descLength = description.length;

      if (descLength < this.descriptionMinLength) {
        warnings.push(
          this.createWarning(
            "description_too_short",
            `Meta description is too short (${descLength} characters). Recommended: ${this.descriptionMinLength}-${this.descriptionMaxLength}`,
            {
              description,
              length: descLength,
            }
          )
        );
      }

      if (descLength > this.descriptionMaxLength) {
        warnings.push(
          this.createWarning(
            "description_too_long",
            `Meta description is too long (${descLength} characters). Recommended: ${this.descriptionMinLength}-${this.descriptionMaxLength}`,
            {
              description,
              length: descLength,
            }
          )
        );
      }
    }
  }

  auditViewport(viewport, warnings) {
    if (!viewport) {
      warnings.push(
        this.createWarning(
          "missing_viewport",
          "Page is missing viewport meta tag",
          { viewport }
        )
      );
    } else if (!viewport.includes("width=device-width")) {
      warnings.push(
        this.createWarning(
          "viewport_not_responsive",
          "Viewport meta tag should include 'width=device-width'",
          { viewport }
        )
      );
    }
  }

  auditOpenGraph(metaData, recommendations) {
    if (!metaData.ogTitle) {
      recommendations.push(
        this.createRecommendation(
          "add_og_title",
          "Consider adding Open Graph title for better social sharing"
        )
      );
    }

    if (!metaData.ogDescription) {
      recommendations.push(
        this.createRecommendation(
          "add_og_description",
          "Consider adding Open Graph description for better social sharing"
        )
      );
    }

    if (!metaData.ogImage) {
      recommendations.push(
        this.createRecommendation(
          "add_og_image",
          "Consider adding Open Graph image for better social sharing"
        )
      );
    }
  }

  auditTwitterCards(metaData, recommendations) {
    if (!metaData.twitterCard) {
      recommendations.push(
        this.createRecommendation(
          "add_twitter_card",
          "Consider adding Twitter Card meta tags for better social sharing"
        )
      );
    }
  }

  auditRobots(robots, warnings) {
    if (robots) {
      if (robots.includes("noindex")) {
        warnings.push(
          this.createWarning(
            "noindex_directive",
            "Page has noindex directive - it won't be indexed by search engines",
            { robots }
          )
        );
      }

      if (robots.includes("nofollow")) {
        warnings.push(
          this.createWarning(
            "nofollow_directive",
            "Page has nofollow directive - links won't be followed by search engines",
            { robots }
          )
        );
      }
    }
  }

  calculateScore(issues, warnings) {
    let score = 100;
    score -= issues.length * 20;
    score -= warnings.length * 10;
    return Math.max(0, score);
  }
}

export default MetaTagAuditor;
