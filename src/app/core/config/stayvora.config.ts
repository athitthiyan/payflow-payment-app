export const PORTAL_URLS = {
  dev: {
    apiUrl: 'http://localhost:8000',
    apiBaseUrl: 'http://localhost:8000',
    customerPortalUrl: 'http://localhost:4200',
    paymentPortalUrl: 'http://localhost:4201',
    adminPortalUrl: 'http://localhost:4202',
    partnerPortalUrl: 'http://localhost:4203',
  },
  prod: {
    apiUrl: 'https://hotel-api-production-447d.up.railway.app',
    apiBaseUrl: 'https://hotel-api-production-447d.up.railway.app',
    customerPortalUrl: 'https://stayvora.co.in',
    paymentPortalUrl: 'https://pay.stayvora.co.in',
    adminPortalUrl: 'https://admin.stayvora.co.in',
    partnerPortalUrl: 'https://partner.stayvora.co.in',
  },
} as const;

export const STRIPE_TEST_KEY =
  'pk_test_51TH0UuBDYx3dIveAYRnmWFuHY6EB8yZigeKqjltdRnQpc3iidRxSDV6rdmZrH8bcRt9fg3HIBCp32GRpMTnjSGcy00KPKiGzPL';
