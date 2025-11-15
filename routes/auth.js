const express = require('express');
const axios = require('axios');
const db = require('../config/database');
require('dotenv').config();

const router = express.Router();

// GET /install - Redirect to Zid authorization
router.get('/install', (req, res) => {
  const authUrl = new URL(process.env.ZID_AUTH_URL);
  authUrl.searchParams.set('client_id', process.env.ZID_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', process.env.ZID_REDIRECT_URI);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'read_orders read_products read_customers');

  res.redirect(authUrl.toString());
});

// GET /callback - Handle OAuth callback
router.get('/callback', async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    return res.status(400).json({ error: 'Authorization failed', details: error });
  }

  if (!code) {
    return res.status(400).json({ error: 'Authorization code missing' });
  }

  try {
    // Exchange code for access token
    const tokenResponse = await axios.post(process.env.ZID_TOKEN_URL, {
      grant_type: 'authorization_code',
      client_id: process.env.ZID_CLIENT_ID,
      client_secret: process.env.ZID_CLIENT_SECRET,
      code: code,
      redirect_uri: process.env.ZID_REDIRECT_URI
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const { access_token, manager_token, refresh_token, store_id } = tokenResponse.data;

    if (!access_token || !store_id) {
      return res.status(400).json({ error: 'Invalid token response' });
    }

    // Store tokens in database
    const existing = db.prepare('SELECT id FROM merchants WHERE store_id = ?').get(store_id);

    if (existing) {
      db.prepare(`
        UPDATE merchants 
        SET access_token = ?, manager_token = ?, refresh_token = ?, updated_at = CURRENT_TIMESTAMP
        WHERE store_id = ?
      `).run(access_token, manager_token || null, refresh_token || null, store_id);
    } else {
      db.prepare(`
        INSERT INTO merchants (store_id, access_token, manager_token, refresh_token)
        VALUES (?, ?, ?, ?)
      `).run(store_id, access_token, manager_token || null, refresh_token || null);
    }

    res.send(`
      <html>
        <head><title>Installation Successful</title></head>
        <body style="font-family: Arial; padding: 40px; text-align: center;">
          <h1>✅ Installation Successful!</h1>
          <p>Your store has been connected successfully.</p>
          <p>Store ID: ${store_id}</p>
          <p><a href="/dashboard">Go to Dashboard</a></p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('OAuth callback error:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Token exchange failed', 
      details: error.response?.data || error.message 
    });
  }
});

// GET /test-api - Test API access
router.get('/test-api', async (req, res) => {
  try {
    const storeId = req.query.store_id;
    if (!storeId) {
      return res.status(400).json({ error: 'store_id parameter required' });
    }

    const merchant = db.prepare('SELECT * FROM merchants WHERE store_id = ?').get(storeId);
    if (!merchant) {
      return res.status(404).json({ error: 'Store not found. Please install first.' });
    }

    const ZidApi = require('../services/zidApi');
    const zidApi = new ZidApi(merchant.access_token);

    // Test fetching products
    const products = await zidApi.getProducts(1, 5);
    
    res.json({
      success: true,
      message: 'API connection successful',
      store_id: storeId,
      products_sample: products.payload || products.products || products
    });
  } catch (error) {
    res.status(500).json({
      error: 'API test failed',
      details: error.response?.data || error.message
    });
  }
});

module.exports = router;

