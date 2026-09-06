// Bootstrap a project-pod OWNER on a Community Solid Server: an account, a pod, and client
// credentials — the four values every writer of that pod needs (FP_OWNER_CLIENT_ID/SECRET,
// FP_OWNER_WEBID, FP_PROJECT_POD). Plain fetch against the CSS .account API (cookie auth); no auth lib.
// Used by scripts/bootstrap-owner.js (prints .env lines) and scripts/project.js new (reserves the
// central pod for a project).

const rand = () => Math.random().toString(36).slice(2, 10);
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t; } };
const post = (url, cookie, body) => fetch(url, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) });

/**
 * @param {{ cssUrl:string, podName?:string, email?:string, password?:string }} a
 * @returns {Promise<{ clientId:string, clientSecret:string, webId:string, pod:string, email:string, password:string }>}
 */
export async function bootstrapOwner({ cssUrl, podName = 'project', email, password }) {
  const base = String(cssUrl || '').replace(/\/$/, '');
  if (!base) throw new Error('bootstrapOwner: cssUrl is required');
  const EMAIL = email || `owner-${rand()}@local`;
  const PASSWORD = password || rand() + rand();
  const acc = await fetch(`${base}/.account/account/`, { method: 'POST' });
  const cookie = (acc.headers.get('set-cookie') || '').split(';')[0];
  if (!cookie) throw new Error('no session cookie from /.account/account/ — is this a CSS with the account API?');
  const ctrl = (await j(await fetch(`${base}/.account/`, { headers: { cookie } }))).controls;
  if (!ctrl?.account?.pod) throw new Error('unexpected .account controls shape');
  await post(ctrl.password.create, cookie, { email: EMAIL, password: PASSWORD });
  const pod = await j(await post(ctrl.account.pod, cookie, { name: podName }));
  if (!pod?.webId) {
    const msg = JSON.stringify(pod);
    if (/already/i.test(msg)) throw new Error(`pod "${podName}" already exists on this CSS — pick another name`);
    throw new Error(`pod creation failed: ${msg.slice(0, 200)}`);
  }
  const cc = await j(await post(ctrl.account.clientCredentials, cookie, { name: 'fp', webId: pod.webId }));
  if (!cc?.id || !cc?.secret) throw new Error(`client-credentials failed: ${JSON.stringify(cc).slice(0, 200)}`);
  return { clientId: cc.id, clientSecret: cc.secret, webId: pod.webId, pod: pod.pod, email: EMAIL, password: PASSWORD };
}
