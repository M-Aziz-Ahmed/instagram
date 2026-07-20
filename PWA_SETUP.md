# PWA Setup Instructions

## Icons Needed

You need to create the following icon files and place them in the `/public` folder:

### Required Icons:
1. **icon-192.png** - 192x192 pixels
2. **icon-512.png** - 512x512 pixels

### Optional (for better experience):
3. **screenshot-mobile.png** - 390x844 pixels (mobile screenshot)
4. **screenshot-desktop.png** - 1920x1080 pixels (desktop screenshot)

## How to Create Icons

### Option 1: Use an online tool
Visit one of these free tools:
- https://realfavicongenerator.net/
- https://www.pwabuilder.com/imageGenerator
- https://favicon.io/

Upload your logo/design and download the generated icons.

### Option 2: Use design software
1. Create a square logo (recommended 1024x1024 for best quality)
2. Export it as PNG in the following sizes:
   - 192x192 (icon-192.png)
   - 512x512 (icon-512.png)
3. Place files in `/public` folder

### Option 3: Quick placeholder
For testing, you can create simple colored squares:

```bash
# If you have ImageMagick installed:
magick -size 192x192 xc:#000000 -gravity center -pointsize 64 -fill white -annotate +0+0 "A" public/icon-192.png
magick -size 512x512 xc:#000000 -gravity center -pointsize 180 -fill white -annotate +0+0 "A" public/icon-512.png
```

## Testing PWA Installation

After creating icons:

1. **Development**: 
   ```bash
   npm run dev
   ```

2. **Production build** (PWA works best in production):
   ```bash
   npm run build
   npm start
   ```

3. **Test installation**:
   - **Chrome/Edge**: Look for install icon in address bar
   - **Mobile**: Open browser menu → "Add to Home Screen" or "Install"
   - **Safari (iOS)**: Share button → "Add to Home Screen"

## Troubleshooting

### "Install" option not showing?

1. **Use HTTPS** - PWA requires secure connection (localhost is OK for dev)
2. **Check manifest** - Visit `/manifest.json` to verify it loads
3. **Service Worker** - Check browser DevTools → Application → Service Workers
4. **Clear cache** - Sometimes browsers cache the old manifest

### After you deleted the app once:

Browsers may block reinstallation temporarily. Try:
1. Clear browser data for your site
2. Hard refresh (Ctrl+Shift+R or Cmd+Shift+R)
3. Wait 24-48 hours (browser cooldown period)
4. Try a different browser
5. Use incognito/private mode

### Chrome specific:
1. Open DevTools → Application tab
2. Check "Manifest" section for errors
3. Check "Service Workers" are registered
4. Look at "Storage" → Clear site data if needed

## Current Status

✅ Manifest file created (`/public/manifest.json`)
✅ Service Worker created (`/public/sw.js`)
✅ Offline page created (`/public/offline.html`)
✅ Meta tags added to layout
✅ Service Worker registration in providers
⚠️ **Need to create**: icon-192.png, icon-512.png

Once you add the icons, your app will be fully installable as a PWA!
