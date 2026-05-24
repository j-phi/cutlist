import { resolve } from 'node:path';
import pkg from '../package.json';

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  telemetry: false,
  appConfig: {
    version: process.env.NUXT_APP_VERSION || pkg.version,
  },
  modules: ['@nuxt/ui', '@vueuse/nuxt', '@sentry/nuxt/module'],
  components: [
    {
      path: '~/components',
      pathPrefix: false,
    },
  ],
  css: ['~/assets/css/main.css'],
  ssr: false,
  colorMode: {
    preference: 'dark',
  },
  alias: {
    cutlist: resolve(__dirname, 'lib'),
  },
  runtimeConfig: {
    public: {
      sentryDsn: process.env.NUXT_PUBLIC_SENTRY_DSN ?? '',
    },
  },
  sentry: {
    org: 'cutlist',
    project: 'cutlist',
  },
  sourcemap: {
    client: 'hidden',
  },
  app: {
    baseURL: '/cutlist/',
    head: {
      title: 'Cutlist Generator',
      htmlAttrs: {
        lang: 'en',
      },
      link: [
        { rel: 'icon', href: '/favicon.svg' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        {
          rel: 'preconnect',
          href: 'https://fonts.gstatic.com',
          crossorigin: '',
        },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,400..700;1,8..60,400..700&display=swap',
        },
      ],
      meta: [
        {
          name: 'viewport',
          content: 'width=device-width, initial-scale=1, viewport-fit=cover',
        },
        {
          name: 'description',
          content:
            'Import GLTF assemblies and generate optimised cutlists for boards and panels.',
        },
      ],
    },
  },
});
