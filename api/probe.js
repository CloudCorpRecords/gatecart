// TEMPORARY DIAGNOSTIC ONLY — remove before calling the demo done.
// Echoes exactly what Vercel hands a rewritten function: url + headers.
module.exports = (req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    url: req.url,
    method: req.method,
    headers: req.headers,
  }, null, 2));
};
