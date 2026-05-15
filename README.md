# Haravan AI Product Writer

> Tự động generate mô tả sản phẩm chuẩn SEO bằng Claude AI, đẩy thẳng lên Haravan store.

## Cài đặt & Chạy

```bash
npm install
npm start
# → http://localhost:3000
```

## Cấu hình `.env`

| Biến | Mô tả |
|---|---|
| `API_KEY` | Client ID của Haravan App |
| `SECRET_KEY` | Client Secret của Haravan App |
| `REDIRECT_URI` | Phải khớp URI trong Haravan Partners |
| `CLAUDE_API_KEY` | API Key từ [console.anthropic.com](https://console.anthropic.com) |
| `SESSION_SECRET` | Chuỗi bí mật ngẫu nhiên cho session |
| `PORT` | Port server (mặc định 3000) |

## Luồng hoạt động

```
/ (OAuth Form)
  → POST /connect → Haravan OAuth
  → GET /auth/callback → lưu token vào session
  → GET /products (danh sách sản phẩm)
  → POST /generate (gọi Claude AI)
  → GET /generate.ejs (preview + edit)
  → POST /publish (PUT lên Haravan)
```

## Cấu trúc thư mục

```
├── index.js          # Express server + tất cả routes
├── views/
│   ├── index.ejs     # OAuth form
│   ├── products.ejs  # Danh sách sản phẩm
│   ├── generate.ejs  # Preview & edit mô tả AI
│   ├── error.ejs     # Trang lỗi
│   └── result.ejs    # Kết quả (legacy)
├── public/
│   └── style.css     # Dark glassmorphism UI
├── .env              # Credentials (không commit)
└── .env.example      # Template cấu hình
```
