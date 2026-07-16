// One-off (walkthrough): open verification round 1 in the SHARED pod /control/ container so the
// participant's bot sees it on contact-open. Owner-write + PUBLIC-read (participant WebIDs aren't
// known ahead of activation). Run with the walkproject owner credentials in env.
import { clientCredentialsFetch, makeCssCentralPod } from '../src/pod/css-auth.js';
import { PodRoundControl } from '../src/verify/round-control.js';
import { acrUriOf } from '../src/pod/acp.js';

const CSS = (process.env.CSS_URL || 'http://localhost:3000').replace(/\/$/, '');
const ownerWebId = process.env.FP_OWNER_WEBID;
const controlBase = `${process.env.FP_PROJECT_POD.replace(/\/$/, '')}/central/control/`;

const ownerFetch = await clientCredentialsFetch({ cssUrl: CSS, clientId: process.env.FP_OWNER_CLIENT_ID, clientSecret: process.env.FP_OWNER_CLIENT_SECRET });

// 1. create the /control/ container (idempotent)
await ownerFetch(controlBase, { method: 'PUT', headers: { 'content-type': 'text/turtle', link: '<http://www.w3.org/ns/ldp#Container>; rel="type"' } });

// 2. ACR: owner read/write/control + PUBLIC read
const acr = `@prefix acp: <http://www.w3.org/ns/solid/acp#>.
@prefix acl: <http://www.w3.org/ns/auth/acl#>.
<#ac> a acp:AccessControlResource; acp:resource <${controlBase}>; acp:accessControl <#c>; acp:memberAccessControl <#c>.
<#c> a acp:AccessControl; acp:apply <#pOwner>; acp:apply <#pPub>.
<#pOwner> a acp:Policy; acp:allow acl:Read, acl:Write, acl:Control; acp:anyOf <#mOwner>.
<#mOwner> a acp:Matcher; acp:agent <${ownerWebId}>.
<#pPub> a acp:Policy; acp:allow acl:Read; acp:anyOf <#mPub>.
<#mPub> a acp:Matcher; acp:agent acp:PublicAgent.`;
const acrUri = await acrUriOf(ownerFetch, controlBase);
const acrRes = await ownerFetch(acrUri, { method: 'PUT', headers: { 'content-type': 'text/turtle' }, body: acr });
console.log('ACR PUT', acrUri, '->', acrRes.status);

// 3. write round 1
const pod = await makeCssCentralPod({ podBase: controlBase, authedFetch: ownerFetch, flat: true });
const ctrl = new PodRoundControl({ pod });
try { await ctrl.writeRound({ projectId: 'demo-walkthrough', round: 1, openedAt: new Date().toISOString(), openedBy: 'lead', message: 'Verifieer je samenvatting' }); }
catch (e) { console.log('writeRound:', e.message); }

// 4. verify
console.log('owner sees rounds:', (await ctrl.listRounds('demo-walkthrough')).length);
const pub = await fetch(controlBase, { headers: { accept: 'text/turtle' } });   // UNauthenticated = public
console.log('PUBLIC GET /control/ ->', pub.status, pub.status === 200 ? '(participants can poll ✓)' : '(NOT public — participants would 403)');
