// Vercel entry point: GateCart's server.js exports its http.Server
// (it only calls listen() when run directly), so hand the server
// instance to the Vercel Node runtime.
module.exports = require('../server');
