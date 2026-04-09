type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'http';

type LogMeta = Record<string, unknown>;

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  http: 20,
  info: 30,
  warn: 40,
  error: 50,
};

function getMinimumLogLevel(): LogLevel {
  const configuredLevel = process.env.LOG_LEVEL as LogLevel | undefined;

  if (configuredLevel && configuredLevel in LOG_LEVEL_ORDER) {
    return configuredLevel;
  }

  return process.env.NODE_ENV === 'development' ? 'info' : 'http';
}

function shouldLog(level: LogLevel) {
  const minimumLevel = getMinimumLogLevel();
  return LOG_LEVEL_ORDER[level] >= LOG_LEVEL_ORDER[minimumLevel];
}

function write(level: LogLevel, message: string, meta?: LogMeta) {
  if (!shouldLog(level)) {
    return;
  }

  const payload = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...meta,
  };

  const line = JSON.stringify(payload);

  if (level === 'error') {
    console.error(line);
    return;
  }

  if (level === 'warn') {
    console.warn(line);
    return;
  }

  console.log(line);
}

export const logger = {
  debug: (message: string, meta?: LogMeta) => write('debug', message, meta),
  info: (message: string, meta?: LogMeta) => write('info', message, meta),
  warn: (message: string, meta?: LogMeta) => write('warn', message, meta),
  error: (message: string, meta?: LogMeta) => write('error', message, meta),
  http: (message: string, meta?: LogMeta) => write('http', message, meta),
};
