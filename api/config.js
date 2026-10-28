// Vercel native function for GET /api/config.
// Native functions receive the browser's real path, so just hand the
// request to GateCart's server listener unchanged.
const server = require('../server');
module.exports = (req, res) => server.emit('request', req, res);
