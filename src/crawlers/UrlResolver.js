class UrlResolver {
  constructor(config = {}) {
    this.config = config;
  }

  normalize(url) {
    try {
      const urlObj = new URL(url);
      if (
        (urlObj.protocol === "http:" && urlObj.port === "80") ||
        (urlObj.protocol === "https:" && urlObj.port === "443")
      ) {
        urlObj.port = "";
      }
      urlObj.pathname = urlObj.pathname.replace(/\/+/g, "/");
      if (urlObj.pathname.endsWith("/") && urlObj.pathname.length > 1) {
        urlObj.pathname = urlObj.pathname.slice(0, -1);
      }
      return urlObj.toString();
    } catch (error) {
      return url;
    }
  }

  resolve(href, baseUrl) {
    try {
      if (href.startsWith("http://") || href.startsWith("https://")) {
        return href;
      }
      if (href.startsWith("//")) {
        const base = new URL(baseUrl);
        return `${base.protocol}${href}`;
      }
      const base = new URL(baseUrl);
      return new URL(href, base).href;
    } catch (error) {
      return null;
    }
  }

  extractDomain(url) {
    try {
      return new URL(url).hostname;
    } catch (error) {
      return null;
    }
  }
}

module.exports = UrlResolver;
