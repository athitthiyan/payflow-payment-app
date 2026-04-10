import { PORTAL_URLS, STRIPE_TEST_KEY } from '../app/core/config/stayvora.config';

export const environment = {
  production: true,
  ...PORTAL_URLS.prod,
  bookingAppUrl: PORTAL_URLS.prod.customerPortalUrl as string,
  stripePublishableKey: STRIPE_TEST_KEY,
  // Stripe is DISABLED in production until webhook secret is confirmed live
  stripeEnabled: false,
  sentryDsn: '',
};
