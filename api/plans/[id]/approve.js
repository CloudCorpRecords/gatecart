// Vercel native function for POST /api/plans/:id/approve and :id/reject
// (dynamic segment; the browser path arrives intact).
const server = require('../../../server');
module.exports = (req, res) => server.emit('request', req, res);
