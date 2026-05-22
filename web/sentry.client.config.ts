import * as Sentry from '@sentry/nuxt';

// Sentry is hard-disabled. Flip to true (and provide a DSN) to re-enable.
const SENTRY_ENABLED = false;

const config = useRuntimeConfig();
const dsn = config.public.sentryDsn;

if (SENTRY_ENABLED && dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    debug: false,
    enableLogs: true,
    integrations: [
      Sentry.feedbackIntegration({
        autoInject: false,
        colorScheme: 'dark',
        isNameRequired: false,
        isEmailRequired: true,
        enableScreenshot: true,
        showBranding: false,
        formTitle: 'Report an issue',
        submitButtonLabel: 'Send report',
      }),
    ],
  });
}
