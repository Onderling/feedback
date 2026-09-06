// The Telegram bot for ONE project, wired the way a deployment needs it — the composition
// scripts/tg-bot-smoke.js used to hold inline, now shared by the smoke (a walk) and the box's
// `project.js run` (many projects, one process each). What it does:
//   · applies the project's LLM route and refuses an unsafe clean route up front,
//   · a real CSS central pod + the bot's own pod + per-participant provisioning when owner
//     credentials are given; in-memory otherwise (a smoke — it SAYS so),
//   · an HMAC pseudonym so the pod never holds a reversible chat id,
//   · the walk log's run header.
import { TelegramFeedbackBot } from '../channel/telegram-bot.js';
import { InMemoryCentralPod } from '../pod/central-pod.js';
import { walkLog } from '../walk-log.js';
import { cryptoForProject } from '../pod/crypto-config.js';
import { applyLlmRoute, assertCleanRouteSafe } from '../ollama.js';

/**
 * @param {object} a
 * @param {object} a.config      a validated ProjectConfig
 * @param {string} a.token       the project's Telegram bot token
 * @param {{ cssUrl:string, clientId:string, clientSecret:string, ownerWebId:string, projectPod:string }} [a.owner]
 *   the project-pod owner (from `project.js new` / bootstrap-owner); absent ⇒ in-memory pod
 * @param {string} [a.pseudonymSecret]   HMAC secret for chatId → pseudonym (default: the token)
 * @param {(m:string)=>void} [a.say]     progress lines (default console.log)
 * @returns {Promise<{ bot: TelegramFeedbackBot, stop:()=>Promise<void>, pod:'css'|'memory' }>}
 */
export async function startTelegramProjectBot({ config, token, owner, pseudonymSecret, say = console.log }) {
  if (!token) throw new Error('startTelegramProjectBot: a Telegram bot token is required');
  const { TelegramBridge } = await import('@onderling/chat-agent/bridges/telegram');
  const applied = applyLlmRoute(config.llm);
  assertCleanRouteSafe(config.llm);
  say(`[${config.projectId}] LLM route: ${applied.route} (${applied.baseURL}) model ${config.llm.model}`);
  if (config.privacy?.seal) say(`[${config.projectId}] sealing contributions to the project key (host-blind writer).`);

  let pod = new InMemoryCentralPod();
  let ownPod = new InMemoryCentralPod();
  let onActivate;
  let podKind = 'memory';
  if (owner?.cssUrl && owner.clientId && owner.projectPod) {
    const { clientCredentialsFetch } = await import('../pod/css-auth.js');
    const { CssCentralPod } = await import('../pod/css-central-pod.js');
    const { provisionCssPod } = await import('../activation/provision-css-pod.js');
    const projectPodBase = owner.projectPod;
    const ownerFetch = await clientCredentialsFetch({ cssUrl: owner.cssUrl, clientId: owner.clientId, clientSecret: owner.clientSecret });
    pod = new CssCentralPod({ authedFetch: ownerFetch, podBase: `${projectPodBase.replace(/\/$/, '')}/central/`, ...cryptoForProject({ config }) });
    ownPod = new CssCentralPod({ authedFetch: ownerFetch, podBase: `${projectPodBase.replace(/\/$/, '')}/own/`, ...cryptoForProject({ config }) });
    onActivate = (participant) => provisionCssPod({ ownerFetch, projectPodBase, participant, participantWebId: owner.ownerWebId, ownerWebId: owner.ownerWebId });
    podKind = 'css';
    say(`[${config.projectId}] central + own pod at ${projectPodBase}`);
  } else {
    say(`[${config.projectId}] NO owner credentials — in-memory pod (a smoke, nothing is kept)`);
  }
  walkLog({ kind: 'run', bot: 'telegram', project: config.projectId, pod: podKind, llm: { route: config.llm.route, model: config.llm.model } });
  const bridge = new TelegramBridge({ botToken: token, mode: 'long-polling', dropPendingUpdates: true });
  const bot = new TelegramFeedbackBot({ bridge, pod, config, onActivate, pseudonymSecret: pseudonymSecret || token, ownPod });
  await bot.start();
  return { bot, pod: podKind, stop: () => bot.stop() };
}
