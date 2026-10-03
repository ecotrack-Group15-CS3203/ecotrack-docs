// Local stand-in for the Asgardeo tenant, used only to screenshot the web dashboard
// against the case-study database. Serves JWKS at the Asgardeo path and mints
// RS256 tokens whose iss/aud satisfy both the web app (lib/asgardeo-session.ts) and
// the API (OIDC_ISSUER / OIDC_JWKS_URI). Same `sub` values as run-scenario.js, so a
// token for cs-<run>-nimal signs in as the scenario's BLCS coordinator.
//   node local-issuer.js            -> http://localhost:9998
//   GET /token?sub=<sub>&name=<n>&email=<e>
const http = require('http');
const crypto = require('crypto');

const PORT = 9998;
const BASE = `http://localhost:${PORT}`;
const ISSUER = `${BASE}/oauth2/token`;
const AUD = process.env.CLIENT_ID || 'casestudy-local';
const KID = `casestudy-${Date.now()}`; // new kid per start, so cached JWKS sets refetch
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = publicKey.export({ format: 'jwk' });
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

function mint(sub, name, email) {
  const now = Math.floor(Date.now() / 1000);
  const input = `${b64({ alg: 'RS256', typ: 'JWT', kid: KID })}.${b64({ sub, name, email, iss: ISSUER, aud: AUD, iat: now, exp: now + 3500 })}`;
  return `${input}.${crypto.sign('RSA-SHA256', Buffer.from(input), privateKey).toString('base64url')}`;
}

http.createServer((req, res) => {
  const url = new URL(req.url, BASE);
  if (url.pathname === '/oauth2/jwks') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ keys: [{ ...jwk, kid: KID, alg: 'RS256', use: 'sig' }] }));
  }
  if (url.pathname === '/token') {
    const sub = url.searchParams.get('sub');
    res.writeHead(200, { 'content-type': 'text/plain' });
    return res.end(mint(sub, url.searchParams.get('name') || sub, url.searchParams.get('email') || `${sub}@bolgoda.example`));
  }
  res.writeHead(404).end();
}).listen(PORT, () => console.log(`local issuer ${ISSUER}, aud ${AUD}`));
