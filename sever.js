// DISABLED: legacy RAG server contained unauthenticated memory/document routes and unrestricted URL fetch.
// The supported entrypoint is server.js. Do not restore or deploy this legacy server without a separate security review.
console.error('Legacy Voom AI RAG server is disabled. Use the authenticated server.js entrypoint.');
process.exitCode = 1;
