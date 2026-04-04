import { appConfig } from './app.config';

describe('appConfig', () => {
  it('registers the root providers', () => {
    expect(appConfig.providers).toBeDefined();
    expect(appConfig.providers?.length).toBe(4);
  });
});
