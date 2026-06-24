class Logger {
  constructor() {
    this.levels = { info: '✅', warn: '⚠️', error: '❌', debug: '🔍' };
  }

  _log(level, message) {
    const time = new Date().toLocaleTimeString();
    const icon = this.levels[level] || '•';
    console.log(`[${time}] ${icon} [${level.toUpperCase()}] ${message}`);
  }

  info(msg)  { this._log('info', msg); }
  warn(msg)  { this._log('warn', msg); }
  error(msg) { this._log('error', msg); }
  debug(msg) { this._log('debug', msg); }
}

module.exports = Logger;
