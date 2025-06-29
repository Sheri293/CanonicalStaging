import BaseAuditor from "./BaseAuditor.js";

class AccessibilityAuditor extends BaseAuditor {
  constructor(config = {}) {
    super(config);
  }

  async audit(page, url) {
    try {
      const accessibilityData = await this.runAccessibilityChecks(page);
      const issues = [];
      const warnings = [];
      const recommendations = [];

      this.auditImages(
        accessibilityData.images,
        issues,
        warnings,
        recommendations
      );
      this.auditLinks(
        accessibilityData.links,
        issues,
        warnings,
        recommendations
      );
      this.auditForms(
        accessibilityData.forms,
        issues,
        warnings,
        recommendations
      );
      this.auditHeadings(
        accessibilityData.headings,
        issues,
        warnings,
        recommendations
      );
      this.auditAriaElements(
        accessibilityData.aria,
        issues,
        warnings,
        recommendations
      );

      return {
        images: accessibilityData.images,
        links: accessibilityData.links,
        forms: accessibilityData.forms,
        headings: accessibilityData.headings,
        aria: accessibilityData.aria,
        colorContrast: accessibilityData.colorContrast,
        issues,
        warnings,
        recommendations,
        score: this.calculateScore(issues, warnings),
      };
    } catch (error) {
      this.logger.error("Accessibility audit failed", {
        error: error.message,
        stack: error.stack,
        url,
      });
      throw error;
    }
  }

  async runAccessibilityChecks(page) {
    return await page.evaluate(() => {
      const result = {
        images: [],
        links: [],
        forms: [],
        headings: [],
        aria: [],
        colorContrast: { status: "manual_check_required" },
      };

      const images = document.querySelectorAll("img");
      images.forEach((img, index) => {
        const alt = img.getAttribute("alt");
        const src = img.getAttribute("src");
        const hasAlt = alt !== null;
        const isDecorative = alt === "";

        result.images.push({
          index,
          src: src || "",
          alt: alt || "",
          hasAlt,
          isDecorative,
          isEmpty: !hasAlt,
          ariaLabel: img.getAttribute("aria-label"),
          role: img.getAttribute("role"),
        });
      });

      const links = document.querySelectorAll("a");
      links.forEach((link, index) => {
        const href = link.getAttribute("href");
        const text = link.textContent ? link.textContent.trim() : "";
        const ariaLabel = link.getAttribute("aria-label");
        const title = link.getAttribute("title");

        result.links.push({
          index,
          href: href || "",
          text,
          isEmpty: !text && !ariaLabel && !title,
          hasAriaLabel: !!ariaLabel,
          hasTitle: !!title,
          isExternal:
            href &&
            href.startsWith("http") &&
            !href.includes(window.location.hostname),
        });
      });

      const forms = document.querySelectorAll("form");
      forms.forEach((form, index) => {
        const inputs = [];
        const formInputs = form.querySelectorAll("input, textarea, select");

        formInputs.forEach((input, inputIndex) => {
          const id = input.getAttribute("id");
          const name = input.getAttribute("name");
          const type =
            input.getAttribute("type") || input.tagName.toLowerCase();
          const label = id
            ? document.querySelector(`label[for="${id}"]`)
            : null;
          const ariaLabel = input.getAttribute("aria-label");
          const ariaLabelledBy = input.getAttribute("aria-labelledby");

          inputs.push({
            index: inputIndex,
            id: id || "",
            name: name || "",
            type,
            hasLabel: !!label,
            labelText: label ? label.textContent.trim() : "",
            ariaLabel: ariaLabel || "",
            ariaLabelledBy: ariaLabelledBy || "",
            required: input.hasAttribute("required"),
          });
        });

        result.forms.push({
          index,
          inputs,
          hasFieldset: form.querySelector("fieldset") !== null,
          hasLegend: form.querySelector("legend") !== null,
        });
      });

      const headings = document.querySelectorAll("h1, h2, h3, h4, h5, h6");
      headings.forEach((heading, index) => {
        const level = parseInt(heading.tagName.substring(1));
        const text = heading.textContent ? heading.textContent.trim() : "";

        result.headings.push({
          index,
          level,
          text,
          isEmpty: !text,
          hasId: !!heading.id,
          id: heading.id || "",
        });
      });

      const ariaElements = document.querySelectorAll(
        "[aria-label], [aria-labelledby], [role], [aria-describedby], [aria-expanded], [aria-hidden]"
      );
      ariaElements.forEach((element, index) => {
        const ariaAttributes = {};
        for (let attr of element.attributes) {
          if (attr.name.startsWith("aria-") || attr.name === "role") {
            ariaAttributes[attr.name] = attr.value;
          }
        }

        result.aria.push({
          index,
          tagName: element.tagName.toLowerCase(),
          attributes: ariaAttributes,
          text: element.textContent
            ? element.textContent.trim().substring(0, 50)
            : "",
        });
      });

      return result;
    });
  }

  auditImages(images, issues, warnings, recommendations) {
    const imagesWithoutAlt = images.filter((img) => !img.hasAlt);
    const emptyAltImages = images.filter(
      (img) => img.hasAlt && img.alt === "" && !img.isDecorative
    );

    imagesWithoutAlt.forEach((img) => {
      issues.push(
        this.createError("image_missing_alt", "Image missing alt attribute", {
          src: img.src,
          index: img.index,
        })
      );
    });

    emptyAltImages.forEach((img) => {
      warnings.push(
        this.createWarning(
          "image_empty_alt",
          "Image has empty alt attribute but may not be decorative",
          {
            src: img.src,
            index: img.index,
          }
        )
      );
    });

    if (images.length > 0) {
      const altPercentage =
        ((images.length - imagesWithoutAlt.length) / images.length) * 100;
      if (altPercentage < 80) {
        recommendations.push(
          this.createRecommendation(
            "improve_alt_text_coverage",
            `Only ${Math.round(
              altPercentage
            )}% of images have alt text. Aim for 100% coverage.`
          )
        );
      }
    }
  }

  auditLinks(links, issues, recommendations) {
    const emptyLinks = links.filter((link) => link.isEmpty);
    const externalLinksWithoutWarning = links.filter(
      (link) =>
        link.isExternal && !link.text.includes("external") && !link.hasTitle
    );

    emptyLinks.forEach((link) => {
      issues.push(
        this.createError("empty_link", "Link without accessible text", {
          href: link.href,
          index: link.index,
        })
      );
    });

    externalLinksWithoutWarning.forEach((link) => {
      recommendations.push(
        this.createRecommendation(
          "external_link_indication",
          "Consider indicating external links for better user experience",
          {
            href: link.href,
            text: link.text,
          }
        )
      );
    });
  }

  auditForms(forms, issues, warnings, recommendations) {
    forms.forEach((form, formIndex) => {
      const inputsWithoutLabels = form.inputs.filter(
        (input) => !input.hasLabel && !input.ariaLabel && !input.ariaLabelledBy
      );

      inputsWithoutLabels.forEach((input) => {
        issues.push(
          this.createError(
            "form_input_missing_label",
            "Form input missing accessible label",
            {
              formIndex,
              inputIndex: input.index,
              type: input.type,
              name: input.name,
            }
          )
        );
      });

      const requiredInputsWithoutIndication = form.inputs.filter(
        (input) =>
          input.required &&
          !input.labelText.includes("required") &&
          !input.ariaLabel.includes("required")
      );

      requiredInputsWithoutIndication.forEach((input) => {
        warnings.push(
          this.createWarning(
            "required_field_not_indicated",
            "Required field not clearly indicated",
            {
              formIndex,
              inputIndex: input.index,
              type: input.type,
            }
          )
        );
      });

      if (form.inputs.length > 3 && !form.hasFieldset) {
        recommendations.push(
          this.createRecommendation(
            "use_fieldset_legend",
            "Consider using fieldset and legend for complex forms",
            {
              formIndex,
              inputCount: form.inputs.length,
            }
          )
        );
      }
    });
  }

  auditHeadings(headings, issues, warnings) {
    const emptyHeadings = headings.filter((h) => h.isEmpty);

    emptyHeadings.forEach((heading) => {
      issues.push(
        this.createError(
          "accessibility_empty_heading",
          `Empty H${heading.level} heading affects screen reader navigation`,
          {
            level: heading.level,
            index: heading.index,
          }
        )
      );
    });

    let previousLevel = 0;
    headings.forEach((heading) => {
      if (heading.level > previousLevel + 1) {
        warnings.push(
          this.createWarning(
            "heading_hierarchy_accessibility",
            `Heading hierarchy skip affects screen reader navigation: H${previousLevel} to H${heading.level}`,
            {
              from: previousLevel,
              to: heading.level,
              text: heading.text.substring(0, 50),
            }
          )
        );
      }
      previousLevel = heading.level;
    });
  }

  auditAriaElements(ariaElements, issues, warnings, recommendations) {
    ariaElements.forEach((element) => {
      if (element.attributes["aria-labelledby"]) {
        const labelledById = element.attributes["aria-labelledby"];
        const referencedElement = document.getElementById
          ? document.getElementById(labelledById)
          : null;

        if (!referencedElement) {
          issues.push(
            this.createError(
              "aria_labelledby_invalid",
              "aria-labelledby references non-existent element",
              {
                elementId: labelledById,
                tagName: element.tagName,
              }
            )
          );
        }
      }

      if (element.attributes["aria-describedby"]) {
        const describedById = element.attributes["aria-describedby"];
        const referencedElement = document.getElementById
          ? document.getElementById(describedById)
          : null;

        if (!referencedElement) {
          warnings.push(
            this.createWarning(
              "aria_describedby_invalid",
              "aria-describedby references non-existent element",
              {
                elementId: describedById,
                tagName: element.tagName,
              }
            )
          );
        }
      }
    });

    if (ariaElements.length > 0) {
      recommendations.push(
        this.createRecommendation(
          "aria_usage_good",
          `Found ${ariaElements.length} elements with ARIA attributes - good accessibility practice`
        )
      );
    }
  }

  calculateScore(issues, warnings) {
    let score = 100;
    score -= issues.length * 15;
    score -= warnings.length * 8;
    return Math.max(0, score);
  }
}

export default AccessibilityAuditor;
