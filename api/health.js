// Vercel native function for GET /api/health.
const server = require('../server');
module.exports = (req, res) => server.emit('request', req, res);
