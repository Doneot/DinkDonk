const levels = ['debug', 'info', 'warn', 'error'];

function log(level, message, meta) {
  const timestamp = new Date().toISOString();
  const payload = meta ? ` ${JSON.stringify(meta)}` : '';
  // eslint-disable-next-line no-console
  console[level](`[${timestamp}] ${message}${payload}`);
}

const logger = levels.reduce((acc, level) => ({
  ...acc,
  [level]: (message, meta) => log(level, message, meta),
}), {});

module.exports = { logger };
