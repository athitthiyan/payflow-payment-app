export const environment = {
  production: false,
  apiUrl: 'http://localhost:8000',
  apiBaseUrl: 'http://localhost:8000',
  bookingAppUrl: 'http://localhost:4200',
  customerPortalUrl: 'http://localhost:4200',
  paymentPortalUrl: 'http://localhost:4201',
  adminPortalUrl: 'http://localhost:4202',
  partnerPortalUrl: 'http://localhost:4203',
  stripePublishableKey: 'pk_test_51TH0UuBDYx3dIveAYRnmWFuHY6EB8yZigeKqjltdRnQpc3iidRxSDV6rdmZrH8bcRt9fg3HIBCp32GRpMTnjSGcy00KPKiGzPL',
  // Feature toggle: set false to disable Stripe globally (Razorpay/mock remain available)
  stripeEnabled: true,
};
