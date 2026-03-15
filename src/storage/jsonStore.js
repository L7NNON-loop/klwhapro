const fs = require('fs/promises');
const path = require('path');

class JsonStore {
  constructor(filename, defaultValue) {
    this.filePath = path.join(process.cwd(), 'data', filename);
    this.defaultValue = defaultValue;
  }

  async ensureFile() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      await fs.access(this.filePath);
    } catch {
      await fs.writeFile(this.filePath, JSON.stringify(this.defaultValue, null, 2), 'utf8');
    }
  }

  async read() {
    await this.ensureFile();
    const raw = await fs.readFile(this.filePath, 'utf8');
    return JSON.parse(raw || JSON.stringify(this.defaultValue));
  }

  async write(data) {
    await this.ensureFile();
    await fs.writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf8');
    return data;
  }
}

module.exports = { JsonStore };
