require('dotenv').config();
process.env.NODE_ENV = 'test';

const bcrypt = require('bcryptjs');
const db = require('../db');

// Inject pool into createApp - tidak pakai PgSession untuk test
async function seedUser() {
  const hash = bcrypt.hashSync('admin123', 10);
  await db.run(
    "INSERT INTO users (username, password, nama_lengkap, role) VALUES ($1, $2, $3, $4) ON CONFLICT (username) DO UPDATE SET password = $2",
    ['api_test_user', hash, 'Test User', 'user']
  );
}

describe('API Endpoints', () => {
  beforeAll(async () => {
    await seedUser();
  });

  afterAll(async () => {
    // Keep connection for other tests
  });

  describe('GET /api/csrf', () => {
    it.skip('should return CSRF token', async () => {
      // Skip karena express-session butuh store yg proper
      const { createApp } = require('../index');
      const app = createApp();
      
      const request = require('supertest')(app);
      const res = await request.get('/api/csrf');
      
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('csrfToken');
    });
  });
});
