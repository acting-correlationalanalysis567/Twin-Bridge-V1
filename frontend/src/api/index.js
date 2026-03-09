const BASE = '/api';

async function req(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    const e = new Error(err.error || res.statusText);
    e.response = { data: err, status: res.status };
    throw e;
  }
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  return res;
}

export const healthApi = {
  check: () => req('GET', '/health'),
};

export const twinsApi = {
  list:   ()         => req('GET',    '/twins'),
  get:    (id)       => req('GET',    `/twins/${id}`),
  create: (data)     => req('POST',   '/twins', data),
  update: (id, data) => req('PATCH',  `/twins/${id}`, data),
  delete: (id)       => req('DELETE', `/twins/${id}`),
  clone:  (id)       => req('POST',   `/twins/${id}/clone`),
  schema: (id)       => req('GET',    `/twins/${id}/schema`),
  events: (id, params = {}) => {
    const qs = new URLSearchParams({ twinId: id, ...params }).toString();
    return req('GET', `/capture/events?${qs}`);
  },
};

export const proxyApi = {
  start:  (twinId, upstream, port) => req('POST', '/proxy/start', { twinId, upstream, port }),
  stop:   (twinId, port)           => req('POST', '/proxy/stop',  { twinId, port }),
  status: ()                        => req('GET',  '/proxy/status'),
};

export const captureApi = {
  events:    (params = {}) => req('GET', `/capture/events?${new URLSearchParams(params)}`),
  exportUrl: (params = {}) => `${BASE}/capture/export?${new URLSearchParams(params)}`,
};

export const replayApi = {
  runs:    (twinId) => req('GET',  `/replay/runs${twinId ? `?twinId=${twinId}` : ''}`),
  results: (runId)  => req('GET',  `/replay/runs/${runId}/results`),
  start:   (data)   => req('POST', '/replay/start', data),
};

export const registryApi = {
  list:       ()       => req('GET',  '/registry'),
  categories: ()       => req('GET',  '/registry/categories'),
  pull:       (name)   => req('POST', '/registry/pull', { name }),
};

export const versionsApi = {
  list:     (twinId)           => req('GET',    `/versions/${twinId}`),
  snapshot: (twinId, label='') => req('POST',   `/versions/${twinId}/snapshot`, { label }),
  diff:     (twinId, a, b)     => req('GET',    `/versions/${twinId}/diff?a=${a}&b=${b}`),
  delete:   (twinId, versionId)=> req('DELETE', `/versions/${twinId}/${versionId}`),
};

export const githubApi = {
  status:   ()                                   => req('GET',  '/github/status'),
  settings: ()                                   => req('GET',  '/github/settings'),
  save:     (data)                               => req('POST', '/github/settings', data),
  repos:    ()                                   => req('GET',  '/github/repos'),
  tree:     (repo, branch='main')                => req('GET',  `/github/tree?repo=${encodeURIComponent(repo)}&branch=${branch}`),
  push:     (twinId, repo, filePath, message='') => req('POST', '/github/push', { twinId, repo, filePath, message }),
  pull:     (repo, filePath, branch, twinName)   => req('POST', '/github/pull', { repo, filePath, branch, twinName }),
};

export const shadowApi = {
  start:   (twinId, durationMs)  => req('POST', '/replay/shadow/start', { twinId, durationMs }),
  stop:    (sessionId)           => req('POST', '/replay/shadow/stop', { sessionId }),
  results: (sessionId)           => req('GET',  `/replay/shadow/${sessionId}/results`),
  list:    ()                    => req('GET',  '/replay/shadow'),
};

export const packageApi = {
  install:  (pkg)    => req('POST',   '/registry/install', pkg),
  remove:   (name)   => req('DELETE', `/registry/cache/${name}`),
  cache:    ()       => req('GET',    '/registry/cache'),
  exportUrl:(twinId) => `${BASE}/registry/export/${twinId}`,
};
