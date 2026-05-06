import * as Sentry from '@sentry/nuxt';

const config = useRuntimeConfig();
const dsn = config.public.sentryDsn;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    debug: false,
    enableLogs: true,
  });
}
