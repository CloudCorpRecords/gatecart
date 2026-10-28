// Vercel native function for POST /api/orders/:id/simulate-approval.
const server = require('../../../server');
module.exports = (req, res) => server.emit('request', req, res);
