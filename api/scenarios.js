// Vercel native function for GET /api/scenarios.
const server = require('../server');
module.exports = (req, res) => server.emit('request', req, res);
