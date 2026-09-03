export default {
  // 1. Scheduled cron trigger (Cloudflare Worker Cron Triggers)
  async scheduled(event, env, ctx) {
    ctx.waitUntil(triggerGitHubWorkflow(env, 'all'));
  },

  // 2. HTTP endpoint for manual or webhook triggering:
  // e.g. curl -X POST https://daily-briefing-cron-trigger.<subdomain>.workers.dev/trigger?target=all
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/trigger' || url.pathname === '/trigger/') {
      // Optional security token check
      const authHeader = request.headers.get('Authorization') || '';
      if (env.TRIGGER_SECRET && authHeader !== `Bearer ${env.TRIGGER_SECRET}`) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const target = url.searchParams.get('target') || 'all';
      const result = await triggerGitHubWorkflow(env, target);
      return new Response(JSON.stringify(result, null, 2), {
        status: result.success ? 200 : 502,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      service: "daily-briefing-cron-trigger",
      status: "active",
      repo: `${env.GITHUB_OWNER || 'warboys-village'}/${env.GITHUB_REPO || 'daily-briefing'}`,
      endpoints: {
        trigger: "POST /trigger?target=all|warboys|ramsey"
      }
    }, null, 2), { headers: { 'Content-Type': 'application/json' } });
  }
};

async function triggerGitHubWorkflow(env, target = 'all') {
  const owner = env.GITHUB_OWNER || 'warboys-village';
  const repo = env.GITHUB_REPO || 'daily-briefing';
  const workflowId = 'daily-briefing.yml';
  const branch = env.GITHUB_BRANCH || 'main';

  if (!env.GITHUB_PAT) {
    console.error('[Trigger] Error: GITHUB_PAT environment secret is missing!');
    return { success: false, error: 'GITHUB_PAT secret not configured on Worker' };
  }

  const dispatchUrl = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`;

  console.log(`[Trigger] Dispatching GitHub workflow (${workflowId}) on ${owner}/${repo} (target: ${target})...`);

  try {
    const res = await fetch(dispatchUrl, {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${env.GITHUB_PAT}`,
        'User-Agent': 'Cloudflare-Worker-DailyBriefing-Trigger',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ref: branch,
        inputs: {
          target
        }
      })
    });

    if (res.status === 204) {
      console.log(`[Trigger] Success: GitHub workflow dispatched successfully for target '${target}'`);
      return { success: true, target, message: `Workflow queued successfully on branch ${branch}` };
    } else {
      const errText = await res.text();
      console.error(`[Trigger] GitHub dispatch failed (${res.status}): ${errText}`);
      return { success: false, status: res.status, error: errText };
    }
  } catch (err) {
    console.error(`[Trigger] Network error calling GitHub API:`, err.message);
    return { success: false, error: err.message };
  }
}
