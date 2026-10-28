// Vercel native function for GET /api/orders/:id.
const server = require('../../server');
module.exports = (req, res) => server.emit('request', req, res);
