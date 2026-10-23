// DzCalendar's documentation site: Astro Starlight, English at the root and French under /fr/.
// The library is read from source (../packages/*/src), so every page shows the current code.
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import { fileURLToPath } from 'node:url';

const repo = (path) => fileURLToPath(new URL(`../${path}`, import.meta.url));

/** As the playground's vite.config.ts: subpaths first, or '@dzcalendar/dom' would swallow '@dzcalendar/dom/list'. */
const alias = {
  '@dzcalendar/theme/dzcalendar.css': repo('packages/theme/dzcalendar.css'),
  '@dzcalendar/dom/list': repo('packages/dom/src/list.ts'),
  '@dzcalendar/dom/multimonth': repo('packages/dom/src/multimonth.ts'),
  '@dzcalendar/dom/locales/ar': repo('packages/dom/src/locales/ar.ts'),
  '@dzcalendar/dom/locales/es': repo('packages/dom/src/locales/es.ts'),
  '@dzcalendar/dom/locales/de': repo('packages/dom/src/locales/de.ts'),
  '@dzcalendar/dom/toolkit': repo('packages/dom/src/toolkit.ts'),
  '@dzcalendar/dom/custom': repo('packages/dom/src/custom.ts'),
  '@dzcalendar/dom/drag': repo('packages/dom/src/drag.ts'),
  '@dzcalendar/core/views': repo('packages/core/src/views.ts'),
  '@dzcalendar/core/recurrence': repo('packages/core/src/recurrence-entry.ts'),
  '@dzcalendar/dom/base': repo('packages/dom/src/base.ts'),
  '@dzcalendar/dom/timegrid': repo('packages/dom/src/timegrid.ts'),
  '@dzcalendar/dom/daygrid': repo('packages/dom/src/daygrid.ts'),
  '@dzcalendar/core': repo('packages/core/src/index.ts'),
  '@dzcalendar/dom': repo('packages/dom/src/index.ts'),
  '@dzcalendar/rrule': repo('packages/rrule/src/index.ts'),
  '@dzcalendar/ical': repo('packages/ical/src/index.ts'),
  '@dzcalendar/slots': repo('packages/slots/src/index.ts'),
  '@dzcalendar/element/define': repo('packages/element/src/define.ts'),
  '@dzcalendar/element': repo('packages/element/src/index.ts'),
  '@dzcalendar/compat-fullcalendar': repo('packages/compat-fullcalendar/src/index.ts'),
  '@dzcalendar/pro/export': repo('packages/pro/src/export-entry.ts'),
  '@dzcalendar/pro/print': repo('packages/pro/src/print-entry.ts'),
  '@dzcalendar/pro/editor': repo('packages/pro/src/editor-entry.ts'),
  '@dzcalendar/pro/slots': repo('packages/pro/src/slots-entry.ts'),
  '@dzcalendar/pro/model': repo('packages/pro/src/model-entry.ts'),
  '@dzcalendar/pro': repo('packages/pro/src/index.ts'),
  '@dzcalendar/motion-gsap': repo('packages/motion-gsap/src/index.ts'),
  // Installed at the root (npm ci there): the one Temporal the packages share.
  '@tzslot/core': repo('node_modules/@tzslot/core'),
};

export default defineConfig({
  site: 'https://plinthworks.github.io',
  base: '/dzcalendar/',
  trailingSlash: 'always',
  server: { port: 4700 },
  integrations: [
    starlight({
      title: 'DzCalendar',
      description: 'A calendar and scheduler on Temporal: every event in its own time zone, days of 23 and 25 hours drawn as they are.',
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/plinthworks/dzcalendar' }],
      defaultLocale: 'root',
      locales: {
        root: { label: 'English', lang: 'en' },
        fr: { label: 'Français', lang: 'fr' },
      },
      customCss: ['./src/styles/custom.css'],
      sidebar: [
        {
          label: 'Getting started',
          translations: { fr: 'Prise en main' },
          items: [
            { slug: 'getting-started/installation' },
            { slug: 'getting-started/vanilla' },
            { slug: 'getting-started/angular' },
            { slug: 'getting-started/react' },
            { slug: 'getting-started/vue' },
            { slug: 'getting-started/migrating-from-fullcalendar' },
          ],
        },
        {
          label: 'Guides',
          translations: { fr: 'Guides' },
          items: [
            'events',
            'event-sources',
            'recurrence',
            'views',
            'drag-and-drop',
            'selection',
            'keyboard-accessibility',
            'time-zones',
            'theming',
            'tailwind',
            'unstyled',
            'languages',
            'resources-timeline',
            'editor',
            'print-export',
          ].map((page) => ({ slug: `guides/${page}` })),
        },
        {
          label: 'Options',
          translations: { fr: 'Options' },
          // Every page written under options/ (the index first, its sidebar.order 0): a new page needs no line here.
          items: [{ autogenerate: { directory: 'options' } }],
        },
        {
          label: 'API',
          translations: { fr: 'API' },
          items: [{ slug: 'api' }],
        },
      ],
    }),
  ],
  vite: {
    resolve: { alias },
    // The packages' sources live outside website/.
    server: { fs: { allow: [repo('')] } },
  },
});
