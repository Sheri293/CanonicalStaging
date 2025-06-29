class CrawlResult {
  constructor(data = {}) {
    this.url = data.url || "";
    this.discovered = data.discovered || false;
    this.depth = data.depth || 0;
    this.source = data.source || "unknown";
    this.timestamp = data.timestamp || new Date().toISOString();
    this.parentUrl = data.parentUrl || null;
    this.linkText = data.linkText || "";
  }
}

export default CrawlResult;
