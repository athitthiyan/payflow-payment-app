import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./features/payment-form/payment-form.component').then(m => m.PaymentFormComponent),
    title: 'Stayvora Pay — Secure Checkout',
  },
  {
    path: 'success',
    loadComponent: () =>
      import('./features/success/success.component').then(m => m.SuccessComponent),
    title: 'Payment Successful — Stayvora Pay',
  },
  {
    path: 'failure',
    loadComponent: () =>
      import('./features/failure/failure.component').then(m => m.FailureComponent),
    title: 'Payment Failed — Stayvora Pay',
  },
  {
    path: 'transactions',
    loadComponent: () =>
      import('./features/transaction-history/transaction-history.component').then(m => m.TransactionHistoryComponent),
    title: 'Transaction History — Stayvora Pay',
  },
  { path: '**', redirectTo: '' },
];
