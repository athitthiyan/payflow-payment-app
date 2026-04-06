import { test, expect, type Page, type Route } from '@playwright/test';

const MOCK_BOOKING = {
  id: 7,
  booking_ref: 'BK-PAYFLOW-001',
  room_id: 1,
  room: { hotel_name: 'The Grand Azure', location: 'Paris', room_type: 'suite' },
  user_name: 'Athit',
  email: 'athit@example.com',
  check_in: '2027-06-01',
  check_out: '2027-06-04',
  nights: 3,
  total_amount: 1050,
  status: 'pending',
  payment_status: 'pending',
};

const MOCK_PAYMENT_INTENT = {
  client_secret: 'pi_test_secret_abc123',
  payment_intent_id: 'pi_test_abc123',
  booking_ref: 'BK-PAYFLOW-001',
  transaction_ref: 'TXN-PAYFLOW-001',
  amount: 1050,
};

const MOCK_TRANSACTION = {
  id: 1,
  transaction_ref: 'TXN-PLAYWRIGHT-001',
  booking_id: 7,
  amount: 1050,
  currency: 'usd',
  status: 'success',
  payment_method: 'card',
  created_at: new Date().toISOString(),
  booking: {
    id: 7,
    booking_ref: 'BK-PAYFLOW-001',
    user_name: 'Athit',
    email: 'athit@example.com',
    check_in: '2027-06-01',
    check_out: '2027-06-04',
    nights: 3,
    room: { hotel_name: 'The Grand Azure', location: 'Paris', image_url: '' },
  },
};

const MOCK_TRANSACTIONS_LIST = {
  transactions: [
    { id: 1, transaction_ref: 'TXN-001', amount: 1050, status: 'success', payment_method: 'mock', created_at: new Date().toISOString(), booking: { user_name: 'Athit', room: { hotel_name: 'The Grand Azure' } } },
    { id: 2, transaction_ref: 'TXN-002', amount: 500, status: 'failed', payment_method: 'card', created_at: new Date().toISOString(), booking: { user_name: 'Jamie', room: { hotel_name: 'Sea View Resort' } } },
    { id: 3, transaction_ref: 'TXN-003', amount: 200, status: 'pending', payment_method: 'mock', created_at: new Date().toISOString(), booking: { user_name: 'Chris', room: { hotel_name: 'City Loft' } } },
  ],
  total: 3,
};

async function installStripeMock(page: Page): Promise<void> {
  await page.addInitScript(() => {
    class MockCardElement {
      private handlers: Record<string, Array<(...args: unknown[]) => void>> = {};

      mount() {
        queueMicrotask(() => {
          (this.handlers.ready || []).forEach(handler => handler());
        });
      }

      on(event: string, handler: (...args: unknown[]) => void) {
        this.handlers[event] = this.handlers[event] || [];
        this.handlers[event].push(handler);
      }

      unmount() {}
      destroy() {}
    }

    class MockElements {
      create() {
        return new MockCardElement();
      }
    }

    (window as unknown as { Stripe: unknown }).Stripe = () => ({
      elements: () => new MockElements(),
      confirmCardPayment: async () => ({ paymentIntent: { status: 'succeeded', id: 'pi_test_abc123' } }),
    });
  });
}

async function mockBookingAndPaymentApis(
  page: Page,
  options: {
    bookingPaymentStatus?: string;
    bookingStatus?: string;
    paymentSuccessStatus?: string;
    pollResponses?: Array<{
      booking_status: string;
      payment_status: string;
      lifecycle_state?: string;
      latest_transaction: Record<string, unknown> | null;
    }>;
  } = {},
): Promise<void> {
  const bookingPaymentStatus = options.bookingPaymentStatus ?? 'pending';
  const bookingStatus = options.bookingStatus ?? 'pending';
  const paymentSuccessStatus = options.paymentSuccessStatus ?? 'success';
  const pollResponses = [...(options.pollResponses ?? [])];

  await page.route('**/bookings/7', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ...MOCK_BOOKING,
        status: bookingStatus,
        payment_status: bookingPaymentStatus,
      }),
    });
  });

  await page.route('**/payments/create-payment-intent', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_PAYMENT_INTENT),
    });
  });

  await page.route('**/payments/payment-success', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ...MOCK_TRANSACTION,
        status: paymentSuccessStatus,
      }),
    });
  });

  await page.route('**/payments/payment-failure**', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Failure recorded' }),
    });
  });

  await page.route('**/payments/status/7', async (route: Route) => {
    const nextResponse = pollResponses.shift();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        booking_id: 7,
        booking_ref: 'BK-PAYFLOW-001',
        booking_status: nextResponse?.booking_status ?? bookingStatus,
        payment_status: nextResponse?.payment_status ?? bookingPaymentStatus,
        lifecycle_state: nextResponse?.lifecycle_state,
        latest_transaction: nextResponse?.latest_transaction ?? null,
      }),
    });
  });
}

test.describe('PayFlow End-to-End Journeys', () => {
  test('loads booking details from query params', async ({ page }) => {
    await installStripeMock(page);
    await mockBookingAndPaymentApis(page);
    await page.goto('/?booking_id=7&ref=BK-PAYFLOW-001');

    await expect(page.locator('.amount-total')).toHaveText(/\$1,050/);
    await expect(page.getByText('The Grand Azure')).toBeVisible();
  });

  test('shows booking load error for bad booking id', async ({ page }) => {
    await installStripeMock(page);
    await page.route('**/bookings/999', async (route: Route) => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Booking not found' }),
      });
    });

    await page.goto('/?booking_id=999&ref=BK-NOTFOUND');

    await expect(page.getByText(/Unable to load|not found|error/i)).toBeVisible();
  });

  test('redirects to success when booking is already paid', async ({ page }) => {
    await installStripeMock(page);
    await mockBookingAndPaymentApis(page, { bookingPaymentStatus: 'paid', bookingStatus: 'confirmed' });
    await page.goto('/?booking_id=7&ref=BK-PAYFLOW-001');

    await expect(page).toHaveURL(/success/);
  });

  test('secure card payment success navigates to success page', async ({ page }) => {
    await installStripeMock(page);
    await mockBookingAndPaymentApis(page);
    await page.goto('/?booking_id=7&ref=BK-PAYFLOW-001');

    await page.getByLabel(/Cardholder Name/i).fill('Athit Thiyian');
    await page.getByRole('button', { name: /Pay .* Securely/i }).click();

    await expect(page).toHaveURL(/success/);
    await expect(page.getByRole('heading', { name: /Payment Successful/i })).toBeVisible();
  });

  test('processing payment success waits for polling confirmation before redirecting', async ({ page }) => {
    await installStripeMock(page);
    await mockBookingAndPaymentApis(page, {
      paymentSuccessStatus: 'processing',
      pollResponses: [
        {
          booking_status: 'processing',
          payment_status: 'processing',
          lifecycle_state: 'PAYMENT_PENDING',
          latest_transaction: null,
        },
        {
          booking_status: 'confirmed',
          payment_status: 'paid',
          lifecycle_state: 'CONFIRMED',
          latest_transaction: MOCK_TRANSACTION,
        },
      ],
    });
    await page.goto('/?booking_id=7&ref=BK-PAYFLOW-001');

    await page.getByLabel(/Cardholder Name/i).fill('Athit Thiyian');
    await page.getByRole('button', { name: /Pay .* Securely/i }).click();

    await expect(page).toHaveURL(/success/);
    await expect(page.getByText('TXN-PLAYWRIGHT-001')).toBeVisible();
  });

  test('success page shows transaction details and booking confirmation link', async ({ page }) => {
    await page.goto('/success?ref=TXN-PLAYWRIGHT-001&amount=1050&booking_ref=BK-PAYFLOW-001&booking_id=7');

    await expect(page.getByText('TXN-PLAYWRIGHT-001')).toBeVisible();
    await expect(page.getByRole('link', { name: /View My Booking/i })).toHaveAttribute('href', /booking-confirmation/);
  });

  test('failure page shows retry controls', async ({ page }) => {
    await page.goto('/failure?reason=Card%20was%20declined&booking_id=7&ref=BK-PAYFLOW-001');

    await expect(page.getByText(/Card was declined/)).toBeVisible();
    await expect(page.getByRole('link', { name: /Retry Payment|Try Again/i }).or(page.getByRole('button', { name: /Retry Payment|Try Again/i }))).toBeVisible();
  });

  test('failure page preserves booking id, shows countdown, and can retry to success', async ({ page }) => {
    await installStripeMock(page);
    await mockBookingAndPaymentApis(page);

    const holdExpiresAt = new Date(Date.now() + 120000).toISOString();
    await page.goto(`/failure?reason=Card%20was%20declined&booking_id=7&ref=BK-PAYFLOW-001&hold_expires_at=${encodeURIComponent(holdExpiresAt)}`);

    const retryLink = page.getByRole('link', { name: /Retry Payment/i });
    await expect(retryLink).toBeVisible();
    await expect(retryLink).toHaveAttribute('href', /booking_id=7/);
    await expect(page.getByText(/Hold expires in/i)).toBeVisible();

    await retryLink.click();
    await expect(page).toHaveURL(/booking_id=7/);

    await page.getByLabel(/Cardholder Name/i).fill('Athit Thiyian');
    await page.getByRole('button', { name: /Pay .* Securely/i }).click();

    await expect(page).toHaveURL(/success/);
    await expect(page.getByText('TXN-PLAYWRIGHT-001')).toBeVisible();
  });

  test('transaction history page loads and filters by status', async ({ page }) => {
    await page.route('**/payments/transactions**', async (route: Route) => {
      const url = route.request().url();
      const failedOnly = url.includes('status=failed');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          failedOnly
            ? { transactions: [MOCK_TRANSACTIONS_LIST.transactions[1]], total: 1 }
            : MOCK_TRANSACTIONS_LIST
        ),
      });
    });

    await page.goto('/transactions');

    await expect(page.getByText('TXN-001')).toBeVisible();
    await page.locator('select').first().selectOption('failed');
    await expect(page.getByText('TXN-002')).toBeVisible();
    await expect(page.getByText('TXN-001')).not.toBeVisible();
  });

  test('transaction history handles API error', async ({ page }) => {
    await page.route('**/payments/transactions**', async (route: Route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Server error' }),
      });
    });

    await page.goto('/transactions');

    await expect(page.getByRole('heading', { name: /No transactions yet/i })).toBeVisible();
  });
});
