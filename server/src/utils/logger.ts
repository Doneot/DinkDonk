const levels = ["debug", "info", "warn", "error"] as const;

type LogLevel = (typeof levels)[number];

type LogMeta = Record<string, unknown>;

type Logger = {
  [K in LogLevel]: (message: string, meta?: LogMeta) => void;
};

function log(level: LogLevel, message: string, meta?: LogMeta): void {
  const timestamp = new Date().toISOString();

  const payload = meta ? ` ${JSON.stringify(meta)}` : "";

  console[level](`[${timestamp}] ${message}${payload}`);
}

export const logger = levels.reduce<Logger>((acc, level) => {
  acc[level] = (message: string, meta?: LogMeta): void => {
    log(level, message, meta);
  };

  return acc;
}, {} as Logger);
