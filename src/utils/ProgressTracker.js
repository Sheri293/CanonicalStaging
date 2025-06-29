import Logger from "./Logger.js";

class ProgressTracker {
  constructor() {
    this.logger = new Logger("ProgressTracker");
    this.phases = new Map();
    this.currentPhase = null;
    this.total = 0;
    this.current = 0;
    this.startTime = null;
  }

  async initialize() {
    this.phases.clear();
    this.reset();
  }

  reset() {
    this.currentPhase = null;
    this.total = 0;
    this.current = 0;
    this.startTime = Date.now();
  }

  startPhase(name) {
    this.currentPhase = name;
    this.phases.set(name, {
      name,
      startTime: Date.now(),
      endTime: null,
      completed: false,
    });
    this.logger.info(`Phase started: ${name}`);
  }

  completePhase(name, count = 0) {
    const phase = this.phases.get(name);
    if (phase) {
      phase.endTime = Date.now();
      phase.completed = true;
      phase.count = count;
      this.logger.success(`Phase completed: ${name} (${count} items)`);
    }
  }

  setTotal(total) {
    this.total = total;
    this.current = 0;
  }

  updateProgress(progress) {
    this.current = progress.current || this.current + 1;
    const percentage = Math.round((this.current / this.total) * 100);
    const elapsed = Date.now() - this.startTime;
    const rate = this.current / (elapsed / 1000);
    const eta =
      this.total > this.current ? (this.total - this.current) / rate : 0;

    if (this.current % 10 === 0 || this.current === this.total) {
      this.logger.info(
        `Progress: ${this.current}/${
          this.total
        } (${percentage}%) - ETA: ${Math.round(eta)}s`
      );
    }
  }

  getProgress() {
    return {
      current: this.current,
      total: this.total,
      percentage:
        this.total > 0 ? Math.round((this.current / this.total) * 100) : 0,
      phases: Array.from(this.phases.values()),
      elapsed: Date.now() - this.startTime,
    };
  }

  async cleanup() {
    this.phases.clear();
    this.reset();
  }
}

export default ProgressTracker;
