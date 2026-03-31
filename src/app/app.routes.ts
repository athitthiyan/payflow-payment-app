import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./features/payment-form/payment-form.component').then(m => m.PaymentFormComponent),
    title: 'PayFlow — Secure Checkout',
  },
  {
    path: 'success',
    loadComponent: () =>
      import('./features/success/success.component').then(m => m.SuccessComponent),
    title: 'Payment Successful — PayFlow',
  },
  {
    path: 'failure',
    loadComponent: () =>
      import('./features/failure/failure.component').then(m => m.FailureComponent),
    title: 'Payment Failed — PayFlow',
  },
  {
    path: 'transactions',
    loadComponent: () =>
      import('./features/transaction-history/transaction-history.component').then(m => m.TransactionHistoryComponent),
    title: 'Transaction History — PayFlow',
  },
  { path: '**', redirectTo: '' },
];
