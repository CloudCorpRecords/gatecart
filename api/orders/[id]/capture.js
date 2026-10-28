// Vercel native function for POST /api/orders/:id/capture.
const server = require('../../../server');
module.exports = (req, res) => server.emit('request', req, res);
