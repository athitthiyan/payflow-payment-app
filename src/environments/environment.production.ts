export const environment = {
  production: true,
  apiUrl: 'https://hotel-api-production-447d.up.railway.app',
  apiBaseUrl: 'https://hotel-api-production-447d.up.railway.app',
  bookingAppUrl: 'https://stayvora.co.in',
  customerPortalUrl: 'https://stayvora.co.in',
  paymentPortalUrl: 'https://pay.stayvora.co.in',
  adminPortalUrl: 'https://admin.stayvora.co.in',
  partnerPortalUrl: 'https://partner.stayvora.co.in',
  stripePublishableKey: 'pk_test_51TH0UuBDYx3dIveAYRnmWFuHY6EB8yZigeKqjltdRnQpc3iidRxSDV6rdmZrH8bcRt9fg3HIBCp32GRpMTnjSGcy00KPKiGzPL',
  // Feature toggle: Stripe is DISABLED in production until webhook secret is confirmed live
  stripeEnabled: false,
};
