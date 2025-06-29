import BaseAuditor from "./BaseAuditor.js";

class StructuredDataAuditor extends BaseAuditor {
  constructor(config = {}) {
    super(config);
  }

  async audit(page) {
    try {
      const structuredData = await this.extractStructuredData(page);
      const issues = [];
      const warnings = [];
      const recommendations = [];

      this.auditJsonLd(
        structuredData.jsonLd,
        issues,
        warnings,
        recommendations
      );
      this.auditMicrodata(
        structuredData.microdata,
        issues,
        warnings,
        recommendations
      );
      this.auditRdfa(structuredData.rdfa, issues, warnings, recommendations);

      return {
        jsonLd: structuredData.jsonLd,
        microdata: structuredData.microdata,
        rdfa: structuredData.rdfa,
        totalSchemas:
          structuredData.jsonLd.length +
          structuredData.microdata.length +
          structuredData.rdfa.length,
        hasStructuredData:
          structuredData.jsonLd.length > 0 ||
          structuredData.microdata.length > 0 ||
          structuredData.rdfa.length > 0,
        issues,
        warnings,
        recommendations,
        score: this.calculateScore(structuredData, issues, warnings),
      };
    } catch (error) {
      this.logger.error("Structured data audit failed", error);
      throw error;
    }
  }

  async extractStructuredData(page) {
    return await page.evaluate(() => {
      const result = {
        jsonLd: [],
        microdata: [],
        rdfa: [],
      };

      const jsonLdScripts = document.querySelectorAll(
        'script[type="application/ld+json"]'
      );
      jsonLdScripts.forEach((script, index) => {
        try {
          const jsonData = JSON.parse(script.textContent);
          result.jsonLd.push({
            index,
            data: jsonData,
            type: Array.isArray(jsonData)
              ? jsonData.map((item) => item["@type"]).join(", ")
              : jsonData["@type"] || "Unknown",
            valid: true,
            raw: script.textContent,
          });
        } catch (error) {
          result.jsonLd.push({
            index,
            data: null,
            type: "Invalid JSON",
            valid: false,
            error: error.message,
            raw: script.textContent,
          });
        }
      });

      const microdataElements = document.querySelectorAll("[itemscope]");
      microdataElements.forEach((element, index) => {
        const itemType = element.getAttribute("itemtype") || "";
        const itemProps = [];

        const propElements = element.querySelectorAll("[itemprop]");
        propElements.forEach((propElement) => {
          const propName = propElement.getAttribute("itemprop");
          const propValue =
            propElement.getAttribute("content") ||
            propElement.getAttribute("href") ||
            propElement.textContent.trim();

          itemProps.push({
            property: propName,
            value: propValue,
          });
        });

        result.microdata.push({
          index,
          itemType,
          properties: itemProps,
          element: element.tagName.toLowerCase(),
        });
      });

      const rdfaElements = document.querySelectorAll(
        "[typeof], [property], [vocab]"
      );
      const processedElements = new Set();

      rdfaElements.forEach((element, index) => {
        if (processedElements.has(element)) return;
        processedElements.add(element);

        const typeOf = element.getAttribute("typeof") || "";
        const vocab =
          element.getAttribute("vocab") ||
          element.closest("[vocab]")?.getAttribute("vocab") ||
          "";
        const properties = [];

        const propertyElements = element.querySelectorAll("[property]");
        propertyElements.forEach((propElement) => {
          const property = propElement.getAttribute("property");
          const content =
            propElement.getAttribute("content") ||
            propElement.textContent.trim();

          properties.push({
            property,
            content,
          });
        });

        if (typeOf || properties.length > 0) {
          result.rdfa.push({
            index,
            typeOf,
            vocab,
            properties,
            element: element.tagName.toLowerCase(),
          });
        }
      });

      return result;
    });
  }

  auditJsonLd(jsonLdData, issues, warnings, recommendations) {
    if (jsonLdData.length === 0) {
      recommendations.push(
        this.createRecommendation(
          "add_json_ld",
          "Consider adding JSON-LD structured data for better search engine understanding"
        )
      );
    } else {
      jsonLdData.forEach((schema, index) => {
        if (!schema.valid) {
          issues.push(
            this.createError(
              "invalid_json_ld",
              `JSON-LD schema ${index + 1} contains invalid JSON`,
              {
                index,
                error: schema.error,
                raw: schema.raw,
              }
            )
          );
        } else {
          this.validateJsonLdSchema(
            schema,
            issues,
            warnings,
            recommendations,
            index
          );
        }
      });
    }
  }

  validateJsonLdSchema(schema, issues, warnings, recommendations, index) {
    const data = schema.data;

    if (Array.isArray(data)) {
      data.forEach((item, itemIndex) => {
        this.validateSingleJsonLdItem(
          item,
          issues,
          warnings,
          recommendations,
          `${index + 1}.${itemIndex + 1}`
        );
      });
    } else {
      this.validateSingleJsonLdItem(
        data,
        issues,
        warnings,
        recommendations,
        index + 1
      );
    }
  }

  validateSingleJsonLdItem(
    item,
    issues,
    warnings,
    recommendations,
    identifier
  ) {
    if (!item["@context"]) {
      warnings.push(
        this.createWarning(
          "missing_context",
          `JSON-LD schema ${identifier} is missing @context`,
          {
            identifier,
            type: item["@type"],
          }
        )
      );
    }

    if (!item["@type"]) {
      warnings.push(
        this.createWarning(
          "missing_type",
          `JSON-LD schema ${identifier} is missing @type`,
          { identifier }
        )
      );
    }

    if (item["@type"] === "Organization") {
      this.validateOrganizationSchema(
        item,
        issues,
        warnings,
        recommendations,
        identifier
      );
    } else if (item["@type"] === "WebPage" || item["@type"] === "WebSite") {
      this.validateWebPageSchema(
        item,
        issues,
        warnings,
        recommendations,
        identifier
      );
    } else if (item["@type"] === "Article") {
      this.validateArticleSchema(
        item,
        issues,
        warnings,
        recommendations,
        identifier
      );
    } else if (item["@type"] === "Product") {
      this.validateProductSchema(
        item,
        issues,
        warnings,
        recommendations,
        identifier
      );
    } else if (item["@type"] === "LocalBusiness") {
      this.validateLocalBusinessSchema(
        item,
        issues,
        warnings,
        recommendations,
        identifier
      );
    }
  }

  validateOrganizationSchema(
    item,
    issues,

    recommendations,
    identifier
  ) {
    const requiredFields = ["name", "url"];
    const recommendedFields = ["logo", "contactPoint", "address"];

    requiredFields.forEach((field) => {
      if (!item[field]) {
        issues.push(
          this.createError(
            "missing_required_field",
            `Organization schema ${identifier} missing required field: ${field}`,
            {
              identifier,
              field,
              type: "Organization",
            }
          )
        );
      }
    });

    recommendedFields.forEach((field) => {
      if (!item[field]) {
        recommendations.push(
          this.createRecommendation(
            "add_recommended_field",
            `Consider adding ${field} to Organization schema ${identifier}`,
            {
              identifier,
              field,
              type: "Organization",
            }
          )
        );
      }
    });
  }

  validateWebPageSchema(item, issues, recommendations, identifier) {
    const requiredFields = ["name", "url"];

    requiredFields.forEach((field) => {
      if (!item[field]) {
        issues.push(
          this.createError(
            "missing_required_field",
            `WebPage schema ${identifier} missing required field: ${field}`,
            {
              identifier,
              field,
              type: item["@type"],
            }
          )
        );
      }
    });

    if (!item["description"]) {
      recommendations.push(
        this.createRecommendation(
          "add_description",
          `Consider adding description to WebPage schema ${identifier}`,
          {
            identifier,
            type: item["@type"],
          }
        )
      );
    }
  }

  validateArticleSchema(item, issues, warnings, identifier) {
    const requiredFields = ["headline", "author", "datePublished"];

    requiredFields.forEach((field) => {
      if (!item[field]) {
        issues.push(
          this.createError(
            "missing_required_field",
            `Article schema ${identifier} missing required field: ${field}`,
            {
              identifier,
              field,
              type: "Article",
            }
          )
        );
      }
    });

    if (!item["image"]) {
      warnings.push(
        this.createWarning(
          "missing_article_image",
          `Article schema ${identifier} missing image - recommended for rich snippets`,
          { identifier }
        )
      );
    }
  }

  validateProductSchema(item, issues, warnings, identifier) {
    const requiredFields = ["name", "image", "description"];

    requiredFields.forEach((field) => {
      if (!item[field]) {
        issues.push(
          this.createError(
            "missing_required_field",
            `Product schema ${identifier} missing required field: ${field}`,
            {
              identifier,
              field,
              type: "Product",
            }
          )
        );
      }
    });

    if (!item["offers"]) {
      warnings.push(
        this.createWarning(
          "missing_product_offers",
          `Product schema ${identifier} missing offers - recommended for e-commerce`,
          { identifier }
        )
      );
    }
  }

  validateLocalBusinessSchema(
    item,
    issues,

    recommendations,
    identifier
  ) {
    const requiredFields = ["name", "address", "telephone"];

    requiredFields.forEach((field) => {
      if (!item[field]) {
        issues.push(
          this.createError(
            "missing_required_field",
            `LocalBusiness schema ${identifier} missing required field: ${field}`,
            {
              identifier,
              field,
              type: "LocalBusiness",
            }
          )
        );
      }
    });

    if (!item["openingHours"]) {
      recommendations.push(
        this.createRecommendation(
          "add_opening_hours",
          `Consider adding openingHours to LocalBusiness schema ${identifier}`,
          { identifier }
        )
      );
    }
  }

  auditMicrodata(microdataData, warnings, recommendations) {
    if (microdataData.length === 0) {
      recommendations.push(
        this.createRecommendation(
          "consider_microdata",
          "No microdata found. Consider adding microdata markup for additional structured data"
        )
      );
    } else {
      microdataData.forEach((item, index) => {
        if (!item.itemType) {
          warnings.push(
            this.createWarning(
              "microdata_no_itemtype",
              `Microdata item ${index + 1} has itemscope but no itemtype`,
              { index }
            )
          );
        }

        if (item.properties.length === 0) {
          warnings.push(
            this.createWarning(
              "microdata_no_properties",
              `Microdata item ${index + 1} has no properties`,
              {
                index,
                itemType: item.itemType,
              }
            )
          );
        }
      });
    }
  }

  auditRdfa(rdfaData, warnings, recommendations) {
    if (rdfaData.length === 0) {
      recommendations.push(
        this.createRecommendation(
          "consider_rdfa",
          "No RDFa markup found. Consider adding RDFa for additional semantic markup"
        )
      );
    } else {
      rdfaData.forEach((item, index) => {
        if (!item.vocab && !item.typeOf) {
          warnings.push(
            this.createWarning(
              "rdfa_no_vocab_or_typeof",
              `RDFa element ${index + 1} has properties but no vocab or typeof`,
              { index }
            )
          );
        }
      });
    }
  }

  calculateScore(structuredData, issues, warnings) {
    let score = 50;

    if (structuredData.jsonLd.length > 0) {
      score += 30;
    }

    if (structuredData.microdata.length > 0) {
      score += 10;
    }

    if (structuredData.rdfa.length > 0) {
      score += 10;
    }

    score -= issues.length * 15;
    score -= warnings.length * 5;

    return Math.max(0, Math.min(100, score));
  }
}

export default StructuredDataAuditor;
