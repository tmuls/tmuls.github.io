import { Config } from '@stencil/core';

export const config: Config = {
  namespace: 'app',
  globalStyle: 'src/global/app.css',
  outputTargets: [
    {
      type: 'www',
      serviceWorker: null,
      dir: '.',
      empty: false,
    },
  ],
};
