# A.C.T POS - Complete Folder Structure

```
a.c.t-pos/
│
├── .github/
│   └── workflows/
│       └── android.yml              # GitHub Actions for auto-build APK
│
├── electron/
│   └── main.js                      # Electron main process (for desktop)
│
├── src/
│   ├── screens/                     # Main application screens
│   │   ├── CashRegister.jsx         # Cash register screen
│   │   ├── CashRegister.css         # Cash register styles
│   │   ├── SalesRecord.jsx          # Sales record screen
│   │   ├── SalesRecord.css          # Sales record styles
│   │   ├── Debtors.jsx              # Debtors management screen
│   │   ├── Debtors.css              # Debtors styles
│   │   ├── Inventory.jsx            # Inventory screen
│   │   └── Inventory.css            # Inventory styles
│   │
│   ├── services/
│   │   └── dataService.js           # Offline-first data management
│   │
│   ├── App.jsx                      # Main app component with routing
│   ├── App.css                      # App-level styles
│   ├── main.jsx                     # React entry point
│   └── index.css                    # Global styles & variables
│
├── public/                          # Static assets (created after first build)
│
├── dist/                            # Build output (created by npm run build)
│
├── android/                         # Android native project (created by cap add android)
│   ├── app/
│   │   ├── src/
│   │   └── build/
│   │       └── outputs/
│   │           └── apk/
│   │               └── debug/
│   │                   └── app-debug.apk  # Your APK file!
│   ├── gradle/
│   ├── gradlew                     # Gradle wrapper (Linux/Mac)
│   ├── gradlew.bat                 # Gradle wrapper (Windows)
│   └── build.gradle                # Android build configuration
│
├── node_modules/                    # Dependencies (created by npm install)
│
├── index.html                       # HTML template
├── package.json                     # Project dependencies & scripts
├── capacitor.config.json            # Capacitor configuration
├── vite.config.js                   # Vite build configuration
│
├── build-android.sh                 # Auto-build script (Mac/Linux)
├── build-android.bat                # Auto-build script (Windows)
│
├── .env.example                     # Environment variables template
├── .gitignore                       # Git ignore rules
│
├── README.md                        # Main documentation
├── ANDROID_BUILD.md                 # Android build guide
├── BACKEND_SETUP.md                 # Backend integration guide
└── DEPLOYMENT.md                    # Deployment guide

```

## Key Folders Explained

### Source Code (`src/`)
All your React application code lives here:
- **screens/** - The 4 main screens (Cash Register, Sales Record, Debtors, Inventory)
- **services/** - Data management and offline sync logic
- **App.jsx** - Main app with navigation
- **main.jsx** - Entry point that renders the app

### Android (`android/`)
Native Android project (created automatically):
- Generated when you run `npx cap add android`
- Contains all native Android code
- **APK output location**: `android/app/build/outputs/apk/debug/app-debug.apk`

### GitHub Actions (`.github/workflows/`)
Automated build configuration:
- **android.yml** - Builds APK automatically when you push to GitHub
- No manual setup needed - just push your code!

### Build Outputs
- **dist/** - Web build (created by `npm run build`)
- **android/app/build/** - APK build outputs
- **a.c.t-pos-debug.apk** - Final APK (copied to root by build scripts)

## Files You'll Interact With

### To Build:
1. `build-android.bat` (Windows) or `build-android.sh` (Mac/Linux)
2. Or use GitHub Actions with `android.yml`

### To Configure:
1. `package.json` - Add/update dependencies
2. `capacitor.config.json` - Change app name/ID
3. `.env` - Set backend URLs (copy from `.env.example`)

### To Learn:
1. `ANDROID_BUILD.md` - How to build APK
2. `README.md` - General documentation
3. `BACKEND_SETUP.md` - Connect to cloud database
4. `DEPLOYMENT.md` - Deploy to production

## Folder Creation Timeline

When you run the build process:

1. **After `npm install`**: `node_modules/` created
2. **After `npm run build`**: `dist/` created
3. **After `npx cap add android`**: `android/` created
4. **After `gradlew assembleDebug`**: APK created in `android/app/build/outputs/apk/debug/`

## Important Notes

- **Don't commit**: `node_modules/`, `dist/`, `android/`, `.env` (all in .gitignore)
- **Do commit**: Everything in `src/`, config files, build scripts
- **APK location**: Always `android/app/build/outputs/apk/debug/app-debug.apk`
- **Build scripts**: Copy APK to root as `a.c.t-pos-debug.apk` for convenience
