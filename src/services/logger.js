class InMemoryLogger {
  constructor(maxEntries = 1000) {
    this.maxEntries = maxEntries;
    this.logs = [];
  }

  add(entry) {
    this.logs.push({ timestamp: new Date().toISOString(), ...entry });
    if (this.logs.length > this.maxEntries) {
      this.logs.shift();
    }
  }

  all() {
    return [...this.logs].reverse();
  }
}

module.exports = { InMemoryLogger };
