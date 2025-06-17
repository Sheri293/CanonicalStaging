const Logger = require("../utils/Logger");

class LinkDiscovery {
  constructor(config = {}) {
    this.config = config;
    this.logger = new Logger("LinkDiscovery");
  }

  async initialize() {
    this.logger.info("LinkDiscovery initialized");
  }

  async extractLinks(page, currentUrl) {
    return await page.evaluate(() => {
      const links = [];
      const anchors = document.querySelectorAll("a[href]");

      anchors.forEach((anchor) => {
        const href = anchor.getAttribute("href");
        const text = anchor.textContent?.trim() || "";
        const title = anchor.getAttribute("title") || "";

        if (href) {
          links.push({
            href,
            text,
            title,
            element: anchor.tagName.toLowerCase(),
          });
        }
      });

      return links;
    });
  }
}

module.exports = LinkDiscovery;
