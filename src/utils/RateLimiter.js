class RateLimiter {
  constructor(options = {}) {
    this.requests = options.requests || 10;
    this.window = options.window || 1000;
    this.queue = [];
  }

  async acquire() {
    return new Promise((resolve) => {
      const now = Date.now();
      this.queue = this.queue.filter((time) => now - time < this.window);

      if (this.queue.length < this.requests) {
        this.queue.push(now);
        resolve();
      } else {
        const delay = this.window - (now - this.queue[0]);
        setTimeout(() => {
          this.queue.push(Date.now());
          resolve();
        }, delay);
      }
    });
  }
}

module.exports = RateLimiter;
