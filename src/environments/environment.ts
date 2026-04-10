import { PORTAL_URLS, STRIPE_TEST_KEY } from '../app/core/config/stayvora.config';

export const environment = {
  production: false,
  ...PORTAL_URLS.dev,
  bookingAppUrl: PORTAL_URLS.dev.customerPortalUrl as string,
  stripePublishableKey: STRIPE_TEST_KEY,
  stripeEnabled: true,
};
