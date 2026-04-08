import { routes } from './app.routes';

describe('routes', () => {
  it('defines the payment application routes', () => {
    expect(routes.map(route => route.path)).toEqual([
      '',
      'success',
      'failure',
      'transactions',
      '**',
    ]);
  });

  it('keeps the fallback redirect and titles in place', () => {
    expect(routes.find(route => route.path === '**')?.redirectTo).toBe('');
    expect(routes.find(route => route.path === '')?.title).toContain('Stayvora Pay');
    expect(routes.find(route => route.path === 'success')?.title).toContain('Successful');
    expect(routes.find(route => route.path === 'failure')?.title).toContain('Failed');
  });

  it('lazy-loads each page component', async () => {
    const loaded = await Promise.all(
      routes
        .filter(route => route.loadComponent)
        .map(route => route.loadComponent!())
    );

    expect(loaded).toHaveLength(4);
    expect(loaded.every(component => !!component)).toBe(true);
  });
});
