# Deployment Guide

This guide covers deploying A.C.T Services Shopkeeper to various platforms.

## Web Deployment

### Option 1: Vercel (Recommended for Web)

1. **Install Vercel CLI**
   ```bash
   npm install -g vercel
   ```

2. **Deploy**
   ```bash
   npm run build
   vercel --prod
   ```

3. **Configure**
   - Add environment variables in Vercel dashboard
   - Set build command: `npm run build`
   - Set output directory: `dist`

### Option 2: Netlify

1. **Install Netlify CLI**
   ```bash
   npm install -g netlify-cli
   ```

2. **Deploy**
   ```bash
   npm run build
   netlify deploy --prod --dir=dist
   ```

3. **Configure**
   ```toml
   # netlify.toml
   [build]
     command = "npm run build"
     publish = "dist"
   
   [[redirects]]
     from = "/*"
     to = "/index.html"
     status = 200
   ```

### Option 3: GitHub Pages

1. **Install gh-pages**
   ```bash
   npm install --save-dev gh-pages
   ```

2. **Add to package.json**
   ```json
   {
     "scripts": {
       "predeploy": "npm run build",
       "deploy": "gh-pages -d dist"
     },
     "homepage": "https://sinitasaare.github.io/a.c.t-pos"
   }
   ```

3. **Deploy**
   ```bash
   npm run deploy
   ```

## Desktop Deployment (Electron)

### Windows

1. **Build**
   ```bash
   npm run electron:build
   ```

2. **Configure electron-builder**
   Add to `package.json`:
   ```json
   {
     "build": {
       "appId": "com.sinitasaare.a.c.tshopkeeper",
       "productName": "A.C.T Services Shopkeeper",
       "win": {
         "target": ["nsis", "portable"],
         "icon": "build/icon.ico"
       }
     }
   }
   ```

3. **Output**
   - Installer: `dist/A.C.T Services Shopkeeper Setup.exe`
   - Portable: `dist/A.C.T Services Shopkeeper.exe`

### macOS

1. **Build**
   ```bash
   npm run electron:build
   ```

2. **Configure**
   ```json
   {
     "build": {
       "mac": {
         "target": ["dmg", "zip"],
         "icon": "build/icon.icns",
         "category": "public.app-category.business"
       }
     }
   }
   ```

3. **Code Signing** (for distribution)
   ```bash
   export CSC_LINK=/path/to/certificate.p12
   export CSC_KEY_PASSWORD=your-password
   npm run electron:build
   ```

### Linux

1. **Build**
   ```bash
   npm run electron:build
   ```

2. **Configure**
   ```json
   {
     "build": {
       "linux": {
         "target": ["AppImage", "deb", "rpm"],
         "icon": "build/icon.png",
         "category": "Office"
       }
     }
   }
   ```

3. **Output**
   - AppImage: Universal Linux package
   - deb: Debian/Ubuntu package
   - rpm: RedHat/Fedora package

## Mobile Deployment

### Android

#### Development Build

1. **Build and sync**
   ```bash
   npm run build
   npx cap sync android
   npx cap open android
   ```

2. **In Android Studio**
   - Build → Generate Signed Bundle/APK
   - Choose APK or AAB
   - Configure signing

#### Production Build

1. **Generate signing key**
   ```bash
   keytool -genkey -v -keystore a.c.t-pos.keystore \
     -alias a.c.t -keyalg RSA -keysize 2048 -validity 10000
   ```

2. **Configure gradle**
   Create `android/key.properties`:
   ```properties
   storePassword=your-store-password
   keyPassword=your-key-password
   keyAlias=a.c.t
   storeFile=../a.c.t-services-shopkeeper.keystore
   ```

3. **Update `android/app/build.gradle`**
   ```gradle
   android {
     signingConfigs {
       release {
         storeFile file(keystoreProperties['storeFile'])
         storePassword keystoreProperties['storePassword']
         keyAlias keystoreProperties['keyAlias']
         keyPassword keystoreProperties['keyPassword']
       }
     }
     buildTypes {
       release {
         signingConfig signingConfigs.release
       }
     }
   }
   ```

4. **Build release APK**
   ```bash
   cd android
   ./gradlew assembleRelease
   ```

5. **Output**: `android/app/build/outputs/apk/release/app-release.apk`

#### Google Play Store

1. **Create Google Play Console account**
2. **Upload AAB file** (preferred over APK)
3. **Fill in store listing**
   - App name: A.C.T Services Shopkeeper
   - Description: Cash register and sales management
   - Screenshots: Capture from different screens
   - Icon: 512x512 PNG

### iOS

#### Development Build

1. **Prerequisites**
   - macOS with Xcode
   - Apple Developer account ($99/year)
   - iOS device for testing

2. **Build and sync**
   ```bash
   npm run build
   npx cap sync ios
   npx cap open ios
   ```

3. **In Xcode**
   - Select your team
   - Configure signing
   - Select device or simulator
   - Run

#### Production Build

1. **Configure App ID**
   - Go to Apple Developer portal
   - Create App ID: com.sinitasaare.A.C.Tshopkeeper
   - Enable required capabilities

2. **Create Provisioning Profile**
   - Development profile for testing
   - Distribution profile for App Store

3. **In Xcode**
   - Product → Archive
   - Distribute App
   - Upload to App Store

4. **App Store Connect**
   - Fill in app information
   - Add screenshots (required sizes)
   - Submit for review

## Progressive Web App (PWA)

### Enable PWA Features

1. **Create manifest.json**
   ```json
   {
     "name": "A.C.T POS",
     "short_name": "A.C.TServicesShopkeeper",
     "description": "Cash register and sales management",
     "start_url": "/",
     "display": "standalone",
     "background_color": "#ffffff",
     "theme_color": "#2563eb",
     "icons": [
       {
         "src": "/icon-192.png",
         "sizes": "192x192",
         "type": "image/png"
       },
       {
         "src": "/icon-512.png",
         "sizes": "512x512",
         "type": "image/png"
       }
     ]
   }
   ```

2. **Create service worker** (optional)
   ```javascript
   // public/sw.js
   self.addEventListener('install', (event) => {
     event.waitUntil(
       caches.open('a.c.t-services-shopkeeper-v1').then((cache) => {
         return cache.addAll([
           '/',
           '/index.html',
           '/assets/index.js',
           '/assets/index.css',
         ]);
       })
     );
   });
   ```

3. **Update index.html**
   ```html
   <link rel="manifest" href="/manifest.json">
   <meta name="theme-color" content="#2563eb">
   ```

## Domain & SSL

### Custom Domain Setup

1. **Purchase domain** (optional)
   - Namecheap, GoDaddy, Google Domains

2. **Configure DNS**
   ```
   A record: @ → your-server-ip
   CNAME: www → your-app.vercel.app
   ```

3. **Enable HTTPS**
   - Automatic on Vercel/Netlify
   - Use Let's Encrypt for self-hosted

## Environment Variables by Platform

### Vercel
```bash
vercel env add VITE_API_URL production
```

### Netlify
```bash
netlify env:set VITE_API_URL "https://api.example.com"
```

### Docker (if self-hosting)
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
CMD ["npm", "run", "preview"]
```

## Post-Deployment Checklist

### Web
- [ ] Test all features in production
- [ ] Verify HTTPS is working
- [ ] Test offline functionality
- [ ] Check mobile responsiveness
- [ ] Verify camera/photo upload works
- [ ] Test sync with backend
- [ ] Check error tracking

### Desktop
- [ ] Test on Windows
- [ ] Test on macOS
- [ ] Test on Linux
- [ ] Verify auto-updates work
- [ ] Test offline storage
- [ ] Check file system permissions

### Mobile
- [ ] Test on real devices
- [ ] Verify camera permissions
- [ ] Test offline mode
- [ ] Check photo upload
- [ ] Test share functionality
- [ ] Verify storage permissions
- [ ] Check battery usage

## Monitoring & Analytics

### Error Tracking (Sentry)

1. **Install**
   ```bash
   npm install @sentry/react
   ```

2. **Configure**
   ```javascript
   import * as Sentry from "@sentry/react";
   
   Sentry.init({
     dsn: "your-sentry-dsn",
     environment: "production",
   });
   ```

### Analytics (Google Analytics)

1. **Install**
   ```bash
   npm install react-ga4
   ```

2. **Configure**
   ```javascript
   import ReactGA from "react-ga4";
   
   ReactGA.initialize("G-XXXXXXXXXX");
   ```

## Maintenance

### Regular Updates
- Update dependencies monthly
- Test security patches
- Monitor error reports
- Backup database regularly

### Performance Monitoring
- Check page load times
- Monitor sync performance
- Track offline usage
- Measure photo upload times

### User Feedback
- Set up feedback form
- Monitor app store reviews
- Track support tickets
- Collect feature requests

## Rollback Procedure

If deployment fails:

1. **Web**: Revert to previous Vercel deployment
2. **Desktop**: Keep previous installer available
3. **Mobile**: Submit bug fix update ASAP
4. **Database**: Have backup ready to restore

## Support Resources

- [Capacitor Docs](https://capacitorjs.com/docs)
- [Electron Builder](https://www.electron.build/)
- [Vercel Docs](https://vercel.com/docs)
- [App Store Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Google Play Policies](https://play.google.com/about/developer-content-policy/)

---

**Remember**: Always test thoroughly before deploying to production!
