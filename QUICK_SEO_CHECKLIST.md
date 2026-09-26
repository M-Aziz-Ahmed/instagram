# Quick SEO Setup Checklist

## ✅ Files Created
- ✅ `app/layout.js` - Enhanced with full metadata, OpenGraph, Twitter Cards
- ✅ `app/sitemap.js` - Dynamic sitemap generator
- ✅ `app/opengraph-image.js` - Auto-generated social sharing image
- ✅ `public/robots.txt` - Crawler rules
- ✅ `SEO_SETUP_GUIDE.md` - Complete setup instructions
- ✅ Page metadata for: home, login, search, bookmarks, profile

## 🚀 Quick Setup (5 steps)

### 1. Update Your Domain URL
Edit `.env.local` (create if doesn't exist):
```env
NEXT_PUBLIC_BASE_URL=https://yourdomain.com
```

### 2. Update robots.txt
Open `public/robots.txt` and replace:
```
Sitemap: https://yourapp.com/sitemap.xml
```
With your actual domain:
```
Sitemap: https://yourdomain.com/sitemap.xml
```

### 3. Deploy Your App
```bash
npm run build
npm start
# or deploy to Vercel/Netlify
```

### 4. Go to Google Search Console
1. Visit: https://search.google.com/search-console
2. Click "Add Property"
3. Enter your URL: `https://yourdomain.com`

### 5. Verify Ownership
**Option A: HTML Tag** (Easiest)
1. Google gives you a code like: `google-site-verification=ABC123`
2. Open `app/layout.js`
3. Find line with `verification: { google: 'your-google-verification-code' }`
4. Replace with your code
5. Redeploy
6. Click "Verify" in Google Search Console

**Option B: HTML File**
1. Download verification file from Google
2. Put it in `public` folder
3. Redeploy
4. Click "Verify"

### 6. Submit Sitemap
In Google Search Console:
1. Go to "Sitemaps" (left menu)
2. Enter: `sitemap.xml`
3. Click "Submit"

## 🎯 Done!
Within 1-2 weeks, Google will start indexing your pages. Monitor progress in Google Search Console.

## 📊 Check These URLs Work
- https://yourdomain.com/
- https://yourdomain.com/sitemap.xml
- https://yourdomain.com/robots.txt
- https://yourdomain.com/opengraph-image

## 🔍 Need Help?
Read the full guide: `SEO_SETUP_GUIDE.md`
