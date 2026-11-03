const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8787;
const targets = [
  { id: 'openai', name: 'OpenAI', domain: 'status.openai.com', logo: '✳', color: '#8cf3c2', statusApi: 'https://status.openai.com/api/v2/summary.json', url: 'https://status.openai.com' },
  { id: 'claude', name: 'Claude', domain: 'status.anthropic.com', logo: '✦', color: '#ef9e7b', statusApi: 'https://status.anthropic.com/api/v2/summary.json', url: 'https://status.anthropic.com' },
  { id: 'grok', name: 'Grok', domain: 'status.x.ai', logo: '𝕏', color: '#9eb8ff', statusApi: 'https://status.x.ai/api/v2/summary.json', url: 'https://status.x.ai' },
  { id: 'deepseek', name: 'DeepSeek', domain: 'status.deepseek.com', logo: 'D', color: '#6ab7ff', statusApi: 'https://status.deepseek.com/api/v2/summary.json', url: 'https://status.deepseek.com', probe: 'https://www.deepseek.com' },
  { id: 'glm', name: 'GLM / 智谱', domain: 'open.bigmodel.cn', logo: '智', color: '#bb9cff', url: 'https://open.bigmodel.cn', probe: 'https://open.bigmodel.cn' },
  { id: 'kimi', name: 'Kimi', domain: 'platform.moonshot.cn', logo: 'K', color: '#f7d477', statusApi: 'https://status.moonshot.cn/api/v2/summary.json', url: 'https://platform.moonshot.cn', probe: 'https://kimi.moonshot.cn' }
];

async function fetchJson(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'Pulse-Status-Probe/1.0', accept: 'application/json' }, signal: AbortSignal.timeout(7000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function inspect(target) {
  const checkedAt = new Date().toISOString();
  try {
    if (target.statusApi) {
      const data = await fetchJson(target.statusApi);
      const incidents = (data.incidents || []).filter(i => i.status !== 'resolved').slice(0, 3);
      const degraded = data.status?.indicator && data.status.indicator !== 'none';
      return { ...target, ok: !degraded, indicator: data.status?.indicator || 'none', label: degraded ? '服务异常' : '正常', incidents, description: incidents[0]?.name || (degraded ? '官方状态页报告服务降级，请查看事件详情。' : '官方状态页未报告异常。'), checkedAt, source: '官方 Statuspage API' };
    }
    const response = await fetch(target.probe || target.url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(7000), headers: { 'user-agent': 'Pulse-Status-Probe/1.0' } });
    const ok = response.status >= 200 && response.status < 500;
    return { ...target, ok, indicator: ok ? 'none' : 'major', label: ok ? '连通正常' : '访问异常', incidents: [], description: ok ? '官网可连通；该平台未提供公开 Statuspage API。' : `官网探针返回 HTTP ${response.status}。`, checkedAt, source: '官网连通性探针' };
  } catch (error) {
    return { ...target, ok: false, indicator: 'unknown', label: '探针失败', incidents: [], description: `无法完成实时探测：${error.message}。`, checkedAt, source: '探针请求失败' };
  }
}

async function getStatus() { return Promise.all(targets.map(inspect)); }

const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, `http://${req.headers.host}`).pathname;
  if (pathname === '/api/status') {
    const payload = { checkedAt: new Date().toISOString(), services: await getStatus() };
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'access-control-allow-origin': '*' });
    return res.end(JSON.stringify(payload));
  }
  // Keep Node hosting compatible with the static deployment entrypoint.
  // Public hosts can serve index.html directly without running this file.
  const file = pathname === '/' ? 'index.html' : pathname.slice(1);
  const safe = path.resolve(process.cwd(), file);
  if (!safe.startsWith(path.resolve(process.cwd()))) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(safe, (error, data) => { if (error) { res.writeHead(404); return res.end('Not found'); } res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(data); });
});
server.listen(PORT, () => console.log(`Pulse status monitor: http://localhost:${PORT}`));
