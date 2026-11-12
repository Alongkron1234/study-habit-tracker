require('./helpers/test-env');

const request = require('supertest');
const { createApp } = require('../src/app');
const pool = require('../src/db/db');

describe('GET /api/ready — Readiness check for Cloud Run and K8s', () => {
  let app;

  beforeAll(() => {
    app = createApp();
  });

  afterAll(async () => {
    await pool.end();
  });

  test('returns 200 { status: "ready", db: "connected" } when DB is connected', async () => {
    const res = await request(app).get('/api/ready');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ready', db: 'connected' });
  });
});
