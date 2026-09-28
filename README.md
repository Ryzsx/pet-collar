# Smart Pet Collar web system

This repository currently contains the static PawSense web frontend. It runs from the repository root without a build step. The pages use HTML, CSS, JavaScript, Firebase Authentication, Firestore helpers, Firebase Storage helpers, Bootstrap on the dashboard, and Google Maps on the live tracking view. There is no C# backend or device firmware in this repository yet.

## Current structure

```text
index.html                    Landing page
css/
  landing.css                Landing page styles
  login.css                  Login and registration styles
  forgot-password.css        Password reset and success page styles
  dashboard.css              Dashboard styles
js/
  core/firebase-config.js    Single Firebase browser app and service instances
  services/AuthService.js    Authentication operations and page-facing service
  services/PetService.js     Existing Firestore pet/location operations
  utils/validators.js        Shared username, email, and password checks
  firebase-init.js           Compatibility exports, profile/storage helpers
  pages/                     Login, registration, and pet setup page logic
  forgot-password.js         Password reset and email-action page logic
  dashboard.js               Dashboard initialization and navigation
  dashboard/                 Feature modules and isolated prototype data
pages/
  login.html                 Sign-in page
  register.html              Registration and email verification page
  forgot-password.html       Password reset and email-action page
  pet-setup.html             Standalone pet setup page
  dashboard.html             Live tracking, activity, history, pets, notifications, settings
tests/
  module-graph.test.cjs      Local JavaScript import/export link check
  dashboard-wiring.test.mjs  Prototype dashboard module smoke test
  validators.test.mjs        Shared authentication validation checks
```

The landing page still has its small inline navigation script. Login, registration, and pet setup load page-specific modules. Every page that uses Firebase loads the shared browser configuration through `js/core/firebase-config.js`; `js/firebase-init.js` keeps the older named imports working.

## Running locally

Serve the repository over HTTP, for example from the existing XAMPP document root at `http://localhost/pet-collar/`. Open `index.html` or go directly to a page under `pages/`. Browser module imports and Firebase Authentication require an HTTP origin that the Firebase project permits. External Firebase, Google Maps, Bootstrap, font, and image resources require network access. No npm install or build command is currently required.

## Current behavior and data boundaries

- **Real Firebase data:** Login, registration, verification, and password reset call Firebase Authentication through `js/services/AuthService.js`. Existing Firestore pet/location operations are in `js/services/PetService.js`; user profile and Storage helpers remain available through `js/firebase-init.js`. The reset alias `pages/forgotpass.html` still redirects to `pages/forgot-password.html` for possible external links.
- **Demo data:** `js/dashboard/demo-data.js` holds representative collar readings, pet profiles, and notifications. The live tracking, activity, history, and notification views still present this prototype data. The Google Maps key remains in the live tracking module with the same value and loader behavior.
- **Local storage data:** `pages/pet-setup.html` saves pet details to browser local storage. It is not currently linked from the checked-in pages, and the dashboard does not load those saved pets. Keep this page until its external usage and intended data flow are confirmed.
- **In-memory data:** Dashboard add/delete pet actions and notification read/filter actions update page memory only. Reloading resets them to the demo data.
- Activity Monitoring contains the History interface. The existing `#history` dashboard URL opens that interface for compatibility. Route history, charts, and some settings controls still display prototype data or UI-only actions.
- The Google Maps key and Firebase browser configuration are client-side configuration. Do not add Firebase Admin credentials, private keys, device secrets, or backend credentials to frontend files or commits. Check API key restrictions and Firebase security rules in their respective consoles; those settings are outside this repository.

## Local checks

Run `node --check` on changed JavaScript files, `node --experimental-vm-modules tests/module-graph.test.cjs` to link local imports and exports, `node tests/dashboard-wiring.test.mjs` to check prototype dashboard modules, and `node tests/validators.test.mjs` to check shared validation. These checks do not replace browser testing of authenticated flows.

## Next development boundary

The planned ASP.NET Core API and device integration are separate future work. Before connecting them, define which pet, location, activity, and notification records are authoritative and review Firestore/Storage rules. Keep the present frontend URLs and Firebase Auth flow working during that work.
