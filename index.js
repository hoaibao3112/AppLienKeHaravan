require('dotenv').config();
const express  = require('express');
const axios    = require('axios');
const path          = require('path');
const cookieSession = require('cookie-session');
const OpenAI        = require('openai');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Khởi tạo OpenAI client ────────────────────────────────
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ── Cấu hình Express ───────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/public', express.static(path.join(__dirname, 'public')));

// ── Session (Cookie-based, an toàn cho Vercel) ─────────────
app.use(cookieSession({
  name: 'haravan-ai-session',
  keys: [process.env.SESSION_SECRET || 'haravan-private-token-secret'],
  maxAge: 8 * 60 * 60 * 1000, // 8 giờ
}));

// ── Middleware kiểm tra đã kết nối chưa ───────────────────
function requireAuth(req, res, next) {
  if (!req.session.privateToken || !req.session.shop) {
    return res.redirect('/');
  }
  next();
}

// ── Hàm tạo header Haravan từ private token ───────────────
function haravanHeaders(token) {
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

// ── Hàm generate mô tả sản phẩm bằng GPT-4o ─────────────
async function generateDescription(product) {
  const variants = (product.variants || []).slice(0, 5)
    .map(v => `- ${v.title || 'Mặc định'}: ${v.price ? Number(v.price).toLocaleString('vi-VN') + ' ₫' : 'Liên hệ'}`)
    .join('\n');

  const systemPrompt = `Bạn là chuyên gia viết nội dung marketing thương mại điện tử Việt Nam.
Viết mô tả sản phẩm hấp dẫn, chuẩn SEO, bằng tiếng Việt.
Yêu cầu:
- Độ dài 150-300 từ
- Có từ khoá chính trong tiêu đề và đoạn đầu
- Dùng <h2>, <h3>, <ul>, <li>, <p>, <strong> (HTML thuần)
- Kết thúc bằng call-to-action
- Chỉ trả về HTML, không giải thích thêm.`;

  const userMsg = `Tên sản phẩm: ${product.title}
Loại: ${product.product_type || 'Không rõ'}
Thương hiệu: ${product.vendor || 'Không rõ'}
Tags: ${product.tags || 'Không có'}
Biến thể/Giá:\n${variants || '- Liên hệ để biết giá'}`;

  // Gọi OpenAI Chat Completions API
  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o',
    max_tokens: 1024,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userMsg },
    ],
  });

  return completion.choices[0].message.content;
}

// ═══════════════════════════════════════════════════════════
// ROUTE: GET / — Form nhập Shop + Private Token
// ═══════════════════════════════════════════════════════════
app.get('/', (req, res) => {
  // Nếu đã kết nối → chuyển thẳng sang danh sách sản phẩm
  if (req.session.privateToken && req.session.shop) {
    return res.redirect('/products');
  }
  res.render('index', {
    shop:  req.query.shop  || 'baohoai-dev.myharavan.com',
    error: req.query.error || null,
  });
});

// ═══════════════════════════════════════════════════════════
// ROUTE: POST /connect — Xác thực private token
// ═══════════════════════════════════════════════════════════
app.post('/connect', async (req, res) => {
  const { shop, privateToken } = req.body;

  if (!shop || !privateToken) {
    return res.render('index', {
      shop,
      error: 'Vui lòng nhập đủ Shop domain và Private Token.',
    });
  }

  try {
    // Thử gọi /admin/shop.json để xác minh token hợp lệ
    const shopUrl = `https://${shop}/admin/shop.json`;
    const resp    = await axios.get(shopUrl, {
      headers: haravanHeaders(privateToken),
      timeout: 10000,
    });

    // Lưu vào session
    req.session.shop         = shop;
    req.session.privateToken = privateToken;
    req.session.shopInfo     = resp.data?.shop || null;

    res.redirect('/products');
  } catch (err) {
    let errMsg = 'Kết nối thất bại. Kiểm tra lại Shop domain và Private Token.';
    if (err.response?.status === 401) errMsg = 'Private Token không hợp lệ hoặc đã hết hạn.';
    if (err.response?.status === 404) errMsg = 'Không tìm thấy shop. Kiểm tra lại domain.';
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') errMsg = 'Không thể kết nối tới shop. Kiểm tra domain.';

    res.render('index', { shop, error: errMsg });
  }
});

// ═══════════════════════════════════════════════════════════
// ROUTE: GET /products — Danh sách sản phẩm
// ═══════════════════════════════════════════════════════════
app.get('/products', requireAuth, async (req, res) => {
  const { shop, privateToken, shopInfo } = req.session;
  const filterNoDesc = req.query.filter === 'no_desc';

  try {
    // Fetch danh sách sản phẩm
    const url  = `https://${shop}/admin/products.json?limit=50&fields=id,title,images,body_html,status,product_type,variants,vendor`;
    const resp = await axios.get(url, {
      headers: haravanHeaders(privateToken),
      timeout: 15000,
    });

    let products = (resp.data?.products || []).map(p => ({
      ...p,
      hasDescription: !!(p.body_html && p.body_html.trim().length > 10),
      thumbnail:      p.images?.[0]?.src || null,
      minPrice:       p.variants?.[0]?.price || null,
    }));

    const allCount    = products.length;
    const noDescCount = products.filter(p => !p.hasDescription).length;

    if (filterNoDesc) products = products.filter(p => !p.hasDescription);

    res.render('products', {
      products, allCount, noDescCount, filterNoDesc,
      shop, shopInfo,
      error: req.query.error || null,
    });
  } catch (err) {
    if (err.response?.status === 401) {
      req.session = null; // Clear cookie session
      return res.redirect('/?error=token_expired');
    }
    res.render('error', {
      error:   'Không tải được danh sách sản phẩm.',
      details: err.response ? JSON.stringify(err.response.data) : err.message,
    });
  }
});

// ═══════════════════════════════════════════════════════════
// ROUTE: POST /generate — Generate mô tả AI cho sản phẩm đã chọn
// ═══════════════════════════════════════════════════════════
app.post('/generate', requireAuth, async (req, res) => {
  const { shop, privateToken } = req.session;
  let productIds = req.body.productIds;

  if (!productIds) return res.redirect('/products?error=no_selection');
  if (!Array.isArray(productIds)) productIds = [productIds];
  if (productIds.length === 0)  return res.redirect('/products?error=no_selection');

  // Giới hạn 10 sản phẩm để tránh timeout
  productIds = productIds.slice(0, 10);

  try {
    // Fetch chi tiết từng sản phẩm và generate mô tả
    const results = [];

    for (const id of productIds) {
      let product = null;
      try {
        const r = await axios.get(`https://${shop}/admin/products/${id}.json`, {
          headers: haravanHeaders(privateToken),
          timeout: 10000,
        });
        product = r.data?.product;
      } catch (e) {
        results.push({ id, title: `ID ${id}`, thumbnail: null, description: '', status: 'error', error: 'Không fetch được sản phẩm.' });
        continue;
      }

      try {
        const description = await generateDescription(product);
        results.push({
          id:          product.id,
          title:       product.title,
          thumbnail:   product.images?.[0]?.src || null,
          description,
          status:      'success',
          error:       null,
        });
      } catch (e) {
        let errMsg = e.message;
        if (e.status === 429) errMsg = 'Claude API rate limit. Thử lại sau.';
        if (e.status === 401) errMsg = 'ANTHROPIC_API_KEY không hợp lệ.';
        results.push({ id: product.id, title: product.title, thumbnail: product.images?.[0]?.src || null, description: '', status: 'error', error: errMsg });
      }
    }

    res.render('generate', { results, shop });
  } catch (err) {
    res.render('error', {
      error:   'Lỗi khi generate mô tả.',
      details: err.message,
    });
  }
});

// ═══════════════════════════════════════════════════════════
// ROUTE: POST /regenerate — Viết lại mô tả (AJAX)
// ═══════════════════════════════════════════════════════════
app.post('/regenerate', requireAuth, async (req, res) => {
  const { shop, privateToken } = req.session;
  const { productId }          = req.body;

  if (!productId) return res.status(400).json({ error: 'Thiếu productId' });

  try {
    const r       = await axios.get(`https://${shop}/admin/products/${productId}.json`, { headers: haravanHeaders(privateToken), timeout: 10000 });
    const product = r.data?.product;
    if (!product) return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });

    const description = await generateDescription(product);
    res.json({ success: true, description });
  } catch (err) {
    let msg = err.message;
    if (err.status === 429) msg = 'Rate limit Claude. Thử lại sau vài giây.';
    res.status(500).json({ error: msg });
  }
});

// ═══════════════════════════════════════════════════════════
// ROUTE: POST /publish — Đẩy mô tả lên Haravan (AJAX)
// ═══════════════════════════════════════════════════════════
app.post('/publish', requireAuth, async (req, res) => {
  const { shop, privateToken } = req.session;
  const { productId, description } = req.body;

  if (!productId || description === undefined) {
    return res.status(400).json({ error: 'Thiếu productId hoặc description' });
  }

  try {
    // PUT /admin/products/{id}.json — cập nhật body_html
    const r = await axios.put(
      `https://${shop}/admin/products/${productId}.json`,
      { product: { id: productId, body_html: description } },
      { headers: haravanHeaders(privateToken), timeout: 15000 }
    );

    const title = r.data?.product?.title || 'sản phẩm';
    res.json({ success: true, message: `✓ Đã cập nhật mô tả cho "${title}"` });
  } catch (err) {
    let msg = 'Lỗi khi cập nhật sản phẩm.';
    if (err.response?.status === 401) msg = 'Token không hợp lệ hoặc hết hạn.';
    if (err.response?.status === 422) msg = 'Dữ liệu không hợp lệ.';
    if (err.response?.status === 429) msg = 'Rate limit Haravan. Thử lại sau.';
    res.status(err.response?.status || 500).json({ error: msg });
  }
});

// ═══════════════════════════════════════════════════════════
// ROUTE: GET /disconnect — Xoá session
// ═══════════════════════════════════════════════════════════
app.get('/disconnect', (req, res) => {
  req.session = null; // Xoá toàn bộ session trong cookie
  res.redirect('/');
});

// ── Khởi động server (Local) hoặc Export (Vercel) ──────────
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`\n🚀 Haravan AI Product Writer (OpenAI GPT-4o mode)`);
    console.log(`   URL   : http://localhost:${PORT}`);
    console.log(`   OpenAI: ${process.env.OPENAI_API_KEY ? '✅ OK' : '❌ Chưa cấu hình OPENAI_API_KEY'}\n`);
  });
}

// Export app instance để Vercel Serverless Function sử dụng
module.exports = app;
