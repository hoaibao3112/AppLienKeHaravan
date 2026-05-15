require('dotenv').config();
const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/public', express.static(path.join(__dirname, 'public')));

const DEFAULT_REDIRECT = process.env.REDIRECT_URI || `http://localhost:${PORT}/auth/callback`;
const SCOPES = 'read_products,read_orders,read_customers';

app.get('/', (req, res) => {
  res.render('index', {
    apiKey: process.env.API_KEY || '',
    secretKey: process.env.SECRET_KEY || '',
    shop: '' ,
    redirectUri: DEFAULT_REDIRECT
  });
});

app.post('/connect', (req, res) => {
  const { apiKey, secretKey, shop, redirectUri } = req.body;
  if (!apiKey || !secretKey || !shop) {
    return res.status(400).render('index', { apiKey, secretKey, shop, redirectUri: redirectUri || DEFAULT_REDIRECT, error: 'API Key, Secret and Shop are required.' });
  }

  const state = encodeURIComponent(shop);
  const authUrl = `https://${shop}/admin/oauth/authorize?client_id=${encodeURIComponent(apiKey)}&scope=${encodeURIComponent(SCOPES)}&redirect_uri=${encodeURIComponent(redirectUri || DEFAULT_REDIRECT)}&state=${state}`;
  res.redirect(authUrl);
});

app.get('/auth/callback', async (req, res) => {
  const { code, state, shop: shopQuery } = req.query;
  const shop = shopQuery || (state ? decodeURIComponent(state) : null);
  const apiKey = process.env.API_KEY || req.query.client_id;
  const secretKey = process.env.SECRET_KEY || process.env.SECRET || null;

  if (!code) return res.status(400).render('result', { error: 'Missing code in callback query.' });
  if (!shop) return res.status(400).render('result', { error: 'Missing shop parameter (cannot determine shop).' });

  try {
    const tokenUrl = `https://${shop}/admin/oauth/access_token`;
    const body = {
      client_id: apiKey,
      client_secret: secretKey,
      code
    };

    const tokenResp = await axios.post(tokenUrl, body, { headers: { 'Content-Type': 'application/json' }, timeout: 10000 });
    const accessToken = tokenResp.data && (tokenResp.data.access_token || tokenResp.data.accessToken || tokenResp.data.token);

    if (!accessToken) {
      return res.status(500).render('result', { error: 'No access_token returned from token endpoint.', details: tokenResp.data });
    }

    // Try to fetch shop info
    let shopInfo = null;
    try {
      const shopUrl = `https://${shop}/admin/shop.json`;
      const shopResp = await axios.get(shopUrl, { headers: { 'X-Haravan-Access-Token': accessToken, 'Authorization': `Bearer ${accessToken}` }, timeout: 10000 });
      shopInfo = shopResp.data;
    } catch (err) {
      shopInfo = { error: 'Failed to fetch shop info', details: err.response ? err.response.data : err.message };
    }

    res.render('result', { accessToken, shopInfo, shop });
  } catch (err) {
    const details = err.response ? err.response.data : err.message;
    res.status(500).render('result', { error: 'Token exchange failed', details });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
