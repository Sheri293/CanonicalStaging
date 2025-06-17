class CrawlQueue {
  constructor() {
    this.queue = [];
    this.processing = new Set();
  }

  async initialize() {
    this.queue = [];
    this.processing.clear();
  }

  add(url, depth) {
    this.queue.push({ url, depth, added: Date.now() });
  }

  next() {
    return this.queue.shift();
  }

  isEmpty() {
    return this.queue.length === 0;
  }

  size() {
    return this.queue.length;
  }

  async cleanup() {
    this.queue = [];
    this.processing.clear();
  }
}

module.exports = CrawlQueue;
