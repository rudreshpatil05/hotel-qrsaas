import winston from 'winston';
import * as Sentry from '@sentry/node';
import { CloudWatchLogsClient, CreateLogStreamCommand, PutLogEventsCommand } from '@aws-sdk/client-cloudwatch-logs';
import { config } from './config.js';

if (config.SENTRY_DSN) Sentry.init({ dsn: config.SENTRY_DSN, environment: config.NODE_ENV, tracesSampleRate: 0.1 });
export const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [new winston.transports.Console()]
});
const cloudwatch = config.CLOUDWATCH_LOG_GROUP ? new CloudWatchLogsClient({ region: config.AWS_REGION }) : null;
let cloudwatchSequenceToken: string | undefined;
const safe = (value: unknown): unknown => typeof value === 'object' && value !== null ? '[redacted]' : value;
export async function logInfo(message: string, metadata: Record<string, unknown> = {}): Promise<void> {
  const entry = { message, ...Object.fromEntries(Object.entries(metadata).filter(([key]) => !/password|secret|token|authorization|payment/i.test(key)).map(([key, value]) => [key, safe(value)])) };
  logger.info(entry);
  if (!cloudwatch || !config.CLOUDWATCH_LOG_GROUP) return;
  try {
    const streamName = new Date().toISOString().slice(0, 10);
    if (!cloudwatchSequenceToken) await cloudwatch.send(new CreateLogStreamCommand({ logGroupName: config.CLOUDWATCH_LOG_GROUP, logStreamName: streamName }));
    const result = await cloudwatch.send(new PutLogEventsCommand({ logGroupName: config.CLOUDWATCH_LOG_GROUP, logStreamName: streamName, sequenceToken: cloudwatchSequenceToken, logEvents: [{ message: JSON.stringify(entry), timestamp: Date.now() }] }));
    cloudwatchSequenceToken = result.nextSequenceToken;
  } catch (error) { logger.warn({ message: 'CloudWatch logging failed', error: error instanceof Error ? error.message : 'unknown' }); }
}
export function captureException(error: unknown, context: Record<string, unknown> = {}): void {
  if (config.SENTRY_DSN) Sentry.withScope((scope) => { Object.entries(context).forEach(([key, value]) => scope.setExtra(key, safe(value))); Sentry.captureException(error); });
  void logInfo('Unhandled application error', { ...context, error: error instanceof Error ? error.message : 'unknown' });
}
