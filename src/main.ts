import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

// TODO: Add Sentry integration for error tracking and monitoring in production.
// This is especially important for payment processing to catch and track payment failures.
// Example: import * as Sentry from "@sentry/angular"; Sentry.init({ dsn: "..." });

bootstrapApplication(AppComponent, appConfig).catch(err => console.error(err));
