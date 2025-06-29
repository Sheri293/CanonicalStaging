import Logger from "./Logger.js";

class MetricsCollector {
  constructor() {
    this.logger = new Logger("MetricsCollector");
    this.metrics = {
      startTime: Date.now(),
      endTime: null,
      urlsProcessed: 0,
      urlsSuccessful: 0,
      urlsFailed: 0,
      avgPageLoad: 0,
      memoryUsage: 0,
      pagesPerSecond: 0,
    };
    this.pageTimes = [];
  }

  recordPageLoad(url, loadTime, success = true) {
    this.metrics.urlsProcessed++;

    if (success) {
      this.metrics.urlsSuccessful++;
      if (loadTime) {
        this.pageTimes.push(loadTime);
        this.metrics.avgPageLoad =
          this.pageTimes.reduce((a, b) => a + b, 0) / this.pageTimes.length;
      }
    } else {
      this.metrics.urlsFailed++;
    }

    this.updateMemoryUsage();
    this.calculatePagesPerSecond();
  }

  updateMemoryUsage() {
    const memUsage = process.memoryUsage();
    this.metrics.memoryUsage = Math.round(memUsage.heapUsed / 1024 / 1024);
  }

  calculatePagesPerSecond() {
    const elapsed = (Date.now() - this.metrics.startTime) / 1000;
    this.metrics.pagesPerSecond = this.metrics.urlsProcessed / elapsed;
  }

  getMetrics() {
    this.metrics.endTime = Date.now();

    return {
      ...this.metrics,
      duration: this.metrics.endTime - this.metrics.startTime,
      successRate:
        this.metrics.urlsProcessed > 0
          ? Math.round(
              (this.metrics.urlsSuccessful / this.metrics.urlsProcessed) * 100
            )
          : 0,
    };
  }

  reset() {
    this.metrics = {
      startTime: Date.now(),
      endTime: null,
      urlsProcessed: 0,
      urlsSuccessful: 0,
      urlsFailed: 0,
      avgPageLoad: 0,
      memoryUsage: 0,
      pagesPerSecond: 0,
    };
    this.pageTimes = [];
  }
}

export default MetricsCollector;
