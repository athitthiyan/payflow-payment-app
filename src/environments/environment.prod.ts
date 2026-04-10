/**
 * M-10: Environment file naming convention:
 *
 * This file (environment.prod.ts) is used for the 'prod' build configuration.
 * It re-exports the environment from environment.production.ts.
 *
 * relationship:
 *  - environment.ts          → default/dev environment (ng serve)
 *  - environment.prod.ts     → production build alias (ng build --configuration production)
 *  - environment.production.ts → actual production configuration
 *
 * NOTE: Consider renaming environment.prod.ts to environment.production.ts
 * and updating angular.json to reference it directly to avoid aliasing confusion.
 */
export { environment } from './environment.production';
