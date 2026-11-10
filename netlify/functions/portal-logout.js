'use strict';
// portal-logout.js — signing out also removes the cookie that lets this browser load the portal (portal-gate edge function).
const { clearGateCookie } = require('./portal-auth-lib');
exports.handler = async () => ({ statusCode: 200, headers: { 'Set-Cookie': clearGateCookie(), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: '{"ok":true}' });
