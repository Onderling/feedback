// Bootstrap the project-pod owner on a running CSS (runbook step 3) — automates the manual
// curl: create an account + a project pod + client-credentials via the CSS .account API, and
// print the deploy/.env lines to paste. The work is src/pod/css-bootstrap.js (shared with
// scripts/project.js new).
//
//   CSS_URL=https://pods.example.org [POD_NAME=project] [OWNER_EMAIL=… OWNER_PASSWORD=…] \
//     node scripts/bootstrap-owner.js
//
// Skips cleanly (exit 0) if CSS_URL is unset.
import { bootstrapOwner } from '../src/pod/css-bootstrap.js';

if (!process.env.CSS_URL) { console.log('SKIP: set CSS_URL to a running CSS'); process.exit(0); }
try {
  const o = await bootstrapOwner({ cssUrl: process.env.CSS_URL, podName: process.env.POD_NAME || 'project', email: process.env.OWNER_EMAIL, password: process.env.OWNER_PASSWORD });
  console.log('# project-pod owner created. Paste into deploy/.env:\n');
  console.log(`FP_OWNER_CLIENT_ID=${o.clientId}`);
  console.log(`FP_OWNER_CLIENT_SECRET=${o.clientSecret}`);
  console.log(`FP_OWNER_WEBID=${o.webId}`);
  console.log(`FP_PROJECT_POD=${o.pod}`);
  console.log(`\n# account login (keep safe): ${o.email} / ${o.password}`);
} catch (e) {
  console.error(`bootstrap failed: ${e.message}`);
  process.exit(1);
}
