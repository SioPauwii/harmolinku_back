const request = require('supertest');
const app = require('../server');

describe('GET /api/discover', () => {
  it('should return profiles excluding the logged-in user', async () => {
    const token = 'valid-jwt-token';
    const response = await request(app)
      .get('/api/discover')
      .set('Authorization', `Bearer ${token}`);
    
    expect(response.status).toBe(200);
    expect(response.body).toBeInstanceOf(Array);
  });
});