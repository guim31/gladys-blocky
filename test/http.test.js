// -----------------------------------------------------------------------------
// The real transport (node:http), against a server on the loopback interface:
// JSON both ways, headers, timeout. Nothing leaves the machine.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { httpRequest } from '../src/blocky/http.js';

async function withServer(handler, run) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

test('sends a JSON body with its headers and reads the answer', async () => {
  await withServer(
    (req, res) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            method: req.method,
            url: req.url,
            sid: req.headers['x-ftl-sid'],
            type: req.headers['content-type'],
            body: JSON.parse(body),
          }),
        );
      });
    },
    async (base) => {
      const response = await httpRequest(`${base}/api/dns/blocking`, {
        method: 'POST',
        headers: { 'X-FTL-SID': 'abc' },
        json: { blocking: false, timer: 60 },
      });
      assert.equal(response.status, 200);
      assert.deepEqual(JSON.parse(response.body), {
        method: 'POST',
        url: '/api/dns/blocking',
        sid: 'abc',
        type: 'application/json',
        body: { blocking: false, timer: 60 },
      });
    },
  );
});

test('a server that does not answer in time is a timeout', async () => {
  await withServer(
    () => {
      // Never answers.
    },
    async (base) => {
      await assert.rejects(httpRequest(`${base}/api/auth`, { timeoutMs: 100 }), (err) => {
        assert.equal(err.code, 'ETIMEDOUT');
        return true;
      });
    },
  );
});

test('a closed port is refused', async () => {
  const server = http.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  await assert.rejects(httpRequest(`http://127.0.0.1:${port}/api/auth`), (err) => {
    assert.equal(err.code, 'ECONNREFUSED');
    return true;
  });
});
