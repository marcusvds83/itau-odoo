// ============================================
// LOGGER - Utilitario de logs estruturados
// ============================================

const dayjs = require('dayjs');

function formatLog(level, message, meta = null) {
  const timestamp = dayjs().format('YYYY-MM-DD HH:mm:ss.SSS');
  const metaStr = meta ? ' | ' + JSON.stringify(meta) : '';
  return `[${timestamp}] [${level}] ${message}${metaStr}`;
}

const logger = {
  info: (msg, meta) => console.log(formatLog('INFO ', msg, meta)),
  warn: (msg, meta) => console.warn(formatLog('WARN ', msg, meta)),
  error: (msg, meta) => console.error(formatLog('ERROR', msg, meta)),
  debug: (msg, meta) => {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(formatLog('DEBUG', msg, meta));
    }
  },
};

module.exports = logger;
