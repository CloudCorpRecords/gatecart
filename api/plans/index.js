// Vercel native function for POST /api/plans.
const server = require('../../server');
module.exports = (req, res) => server.emit('request', req, res);
