const fs = require('fs');

class AccountManager {
  constructor(filePath, logger) {
    this.filePath = filePath;
    this.logger = logger;
    this.accounts = [];
    this.currentIndex = 0;
    this.stats = {};
    this.loadAccounts();
  }

  loadAccounts() {
    try {
      const content = fs.readFileSync(this.filePath, 'utf8');
      this.accounts = content
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'));

      this.accounts.forEach(acc => {
        if (!this.stats[acc]) {
          this.stats[acc] = { kicks: 0, sessions: 0, status: 'ready', registered: false };
        }
      });

      this.logger.info(`Loaded ${this.accounts.length} accounts: ${this.accounts.join(', ')}`);
    } catch (err) {
      this.logger.error(`Failed to load usernames.txt: ${err.message}`);
      this.accounts = [];
    }
  }

  getNextAccount() {
    if (this.accounts.length === 0) return null;
    this.loadAccounts(); // reload in case file was updated live
    const account = this.accounts[this.currentIndex % this.accounts.length];
    this.currentIndex = (this.currentIndex + 1) % this.accounts.length;
    return account;
  }

  getCurrentAccount() {
    if (this.accounts.length === 0) return null;
    const idx = (this.currentIndex - 1 + this.accounts.length) % this.accounts.length;
    return this.accounts[idx];
  }

  markKicked(username) {
    if (this.stats[username]) {
      this.stats[username].kicks++;
      this.stats[username].status = 'kicked';
    }
  }

  markSuccess(username) {
    if (this.stats[username]) {
      this.stats[username].sessions++;
      this.stats[username].status = 'online';
    }
  }

  markRegistered(username) {
    if (this.stats[username]) {
      this.stats[username].registered = true;
    }
  }

  getStats() { return this.stats; }
  getAccountCount() { return this.accounts.length; }
  getAccountList() { return this.accounts; }
}

module.exports = AccountManager;
