// Vercel entry point: GateCart's server.js exports its http.Server
// (it only calls listen() when run directly).
//
// Vercel's catch-all rewrite sends every request to this function, but
// the function then sees the REWRITTEN path (/api/index.js), not the
// path the browser asked for — so server.js's router matched nothing
// and answered "Unknown API route" for every endpoint. Fix: vercel.json
// carries the original path in a query param (__vercel_path), and this
// wrapper restores req.url to it before handing the request to the
// server's own listener. Direct calls without the param pass through
// unchanged (local dev, direct /api/index.js hits).
const server = require('../server');

module.exports = (req, res) => {
  try {
    const u = new URL(req.url, 'http://localhost');
    const orig = u.searchParams.get('__vercel_path');
    if (orig) {
      u.searchParams.delete('__vercel_path');
      const rest = u.searchParams.toString();
      req.url = orig + (rest ? '?' + rest : '');
    }
  } catch (e) {
    // Leave req.url alone; the server will answer 404/Unknown as before.
  }
  server.emit('request', req, res);
};
