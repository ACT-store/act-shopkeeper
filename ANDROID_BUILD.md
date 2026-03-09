# Android APK Build Guide

This guide will help you build the A.C.T Services Shopkeeper app as an Android APK that you can install on Android devices.

## Prerequisites

### Required Software

1. **Node.js** (version 18 or higher)
   - Download from: https://nodejs.org/
   - Choose the LTS (Long Term Support) version
   - Verify installation: `node --version`

2. **Java Development Kit (JDK)** (version 17)
   - Download from: https://adoptium.net/
   - Choose JDK 17 (LTS)
   - Set JAVA_HOME environment variable

3. **Android Studio** (Optional but recommended)
   - Download from: https://developer.android.com/studio
   - Only needed if you want to customize the Android app or build release APKs
   - The command-line tools are sufficient for debug builds

### For Windows Users
- Make sure you have PowerShell or Command Prompt available

### For Mac/Linux Users
- Make sure you have a terminal available
- Install bash if not already installed

## Method 1: Quick Build (Recommended)

### Windows

1. **Open Command Prompt or PowerShell**
   - Navigate to the a.c.t-services-shopkeeper folder
   ```cmd
   cd path\to\a.c.t-pos
   ```

2. **Run the build script**
   ```cmd
   build-android.bat
   ```

3. **Wait for build to complete**
   - This will automatically:
     - Install dependencies
     - Build the web app
     - Set up Android platform
     - Build the APK
   - Takes 5-10 minutes on first run

4. **Find your APK**
   - Location: `a.c.t-services-shopkeeper-debug.apk` (in the root folder)
   - Or: `android\app\build\outputs\apk\debug\app-debug.apk`

### Mac/Linux

1. **Open Terminal**
   - Navigate to the a.c.t-shopkeeper folder
   ```bash
   cd path/to/a.c.t-shopkeeper 
   ```

2. **Make the script executable**
   ```bash
   chmod +x build-android.sh
   ```

3. **Run the build script**
   ```bash
   ./build-android.sh
   ```

4. **Find your APK**
   - Location: `a.c.t-services-shopkeeper-debug.apk` (in the root folder)
   - Or: `android/app/build/outputs/apk/debug/app-debug.apk`

## Method 2: Manual Build (Step by Step)

If the automated script doesn't work, follow these manual steps:

### Step 1: Install Dependencies

```bash
npm install
```

### Step 2: Build Web Assets

```bash
npm run build
```

This creates the `dist/` folder with your web app.

### Step 3: Add Android Platform

```bash
npx cap add android
```

This creates the `android/` folder with native Android code.

### Step 4: Sync Capacitor

```bash
npx cap sync android
```

This copies your web assets to the Android project.

### Step 5: Build APK

**Windows:**
```cmd
cd android
gradlew.bat assembleDebug
cd ..
```

**Mac/Linux:**
```bash
cd android
./gradlew assembleDebug
cd ..
```

### Step 6: Locate APK

Your APK will be at:
```
android/app/build/outputs/apk/debug/app-debug.apk
```

## Method 3: Using GitHub Actions (Automated Cloud Build)

If you push your code to GitHub, it will automatically build the APK for you!

### Setup

1. **Create a GitHub repository**
   - Go to https://github.com/new
   - Create a new repository (public or private)

2. **Push your code**
   ```bash
   cd a.c.t-pos
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/yourusername/a.c.t-pos.git
   git push -u origin main
   ```

3. **GitHub Actions will automatically:**
   - Detect the `.github/workflows/android.yml` file
   - Build your APK in the cloud
   - Make it available for download

4. **Download your APK**
   - Go to your repository on GitHub
   - Click "Actions" tab
   - Click on the latest workflow run
   - Download the APK from "Artifacts"

## Installing the APK on Your Android Device

### Option 1: Direct Install (USB Cable)

1. **Enable Developer Options on your Android device**
   - Go to Settings → About Phone
   - Tap "Build Number" 7 times
   - Developer Options will appear in Settings

2. **Enable USB Debugging**
   - Go to Settings → Developer Options
   - Enable "USB Debugging"

3. **Connect device to computer via USB**

4. **Install APK**
   ```bash
   npx cap run android
   ```
   Or use ADB:
   ```bash
   adb install a.c.t-pos-debug.apk
   ```

### Option 2: Transfer and Install

1. **Copy APK to your phone**
   - Email it to yourself
   - Use Google Drive, Dropbox, etc.
   - Transfer via USB to Downloads folder

2. **Install from phone**
   - Open Files app or Downloads
   - Tap the APK file
   - Allow installation from unknown sources if prompted
   - Tap "Install"

### Option 3: QR Code

1. **Upload APK to file sharing service**
   - Google Drive (get shareable link)
   - Dropbox
   - WeTransfer

2. **Create QR code** from the link
   - Use https://www.qr-code-generator.com/

3. **Scan QR code** with your phone
   - Download and install

## Troubleshooting

### "Node is not recognized"
- Install Node.js from https://nodejs.org/
- Restart your terminal after installation

### "JAVA_HOME is not set"
1. Install JDK 17 from https://adoptium.net/
2. Set JAVA_HOME:
   - **Windows**: 
     ```cmd
     setx JAVA_HOME "C:\Program Files\Eclipse Adoptium\jdk-17.0.x"
     ```
   - **Mac/Linux**: Add to `~/.bashrc` or `~/.zshrc`:
     ```bash
     export JAVA_HOME=/path/to/jdk-17
     ```

### "Android SDK not found"
- You have two options:
  1. Install Android Studio (includes SDK)
  2. Install command-line tools only:
     - Download from: https://developer.android.com/studio#command-tools
     - Set ANDROID_HOME environment variable

### "Gradle build failed"
- Check that you have enough disk space (need ~2GB)
- Try cleaning the build:
  ```bash
  cd android
  ./gradlew clean
  ./gradlew assembleDebug
  ```

### "Permission denied" (Mac/Linux)
```bash
chmod +x android/gradlew
chmod +x build-android.sh
```

### "Cannot install APK on device"
- Enable "Install unknown apps" for your file manager
- Check that USB debugging is enabled
- Try revoking and re-authorizing USB debugging

## Building a Release APK (For Production)

The debug APK is fine for testing, but for distribution you'll want a release APK.

### Step 1: Generate Signing Key

```bash
keytool -genkey -v -keystore a.c.t-pos.keystore \
  -alias a.c.t -keyalg RSA -keysize 2048 -validity 10000
```

Save the password and keep the keystore file safe!

### Step 2: Configure Signing

Create `android/key.properties`:
```properties
storePassword=your-store-password
keyPassword=your-key-password
keyAlias=a.c.t
storeFile=../a.c.t-pos.keystore
```

### Step 3: Build Release APK

```bash
cd android
./gradlew assembleRelease
```

Output: `android/app/build/outputs/apk/release/app-release.apk`

## APK Size

- Debug APK: ~15-25 MB
- Release APK: ~10-15 MB (smaller and optimized)

## Testing Checklist

After installing the APK, test:

- [ ] App launches successfully
- [ ] Cash Register screen works
- [ ] Can add items to basket
- [ ] Can complete a sale (cash)
- [ ] Can complete a credit sale
- [ ] Camera works for photos
- [ ] Sales Record shows transactions
- [ ] Debtors screen shows credit customers
- [ ] Inventory screen displays items
- [ ] Offline mode works (turn off WiFi)
- [ ] Data syncs when back online

## Updating the App

To update the app:

1. Make your code changes
2. Rebuild: `npm run build`
3. Sync: `npx cap sync android`
4. Build new APK
5. Install over the existing app (data will be preserved)

## Need Help?

Common issues and solutions:

| Problem | Solution |
|---------|----------|
| Build takes forever | First build downloads dependencies (~500MB), be patient |
| Out of memory error | Close other apps, ensure 4GB+ RAM available |
| APK won't install | Check Android version (need 6.0+), enable unknown sources |
| Camera doesn't work | Grant camera permission in app settings |
| Data not saving | Grant storage permission in app settings |

---

**You're all set!** Run the build script and you'll have your APK in minutes. 🚀
