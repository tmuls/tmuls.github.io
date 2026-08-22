import { Config } from '@stencil/core';

export const config: Config = {
  namespace: 'app',
  globalStyle: 'src/global/app.css',
  outputTargets: [
    {
      type: 'www',
      serviceWorker: null,
      dir: 'www',
      empty: true,
      copy: [
        { src: 'pages/guide/index.html', dest: 'guide/index.html' },
        { src: 'pages/guide/content', dest: 'assets/guides' },
      ],
    },
  ],
};
