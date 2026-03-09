@echo off
echo.
echo ========================================
echo Building A.C.T POS Android APK
echo ========================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Node.js is not installed.
    echo Please install Node.js 18 or higher from https://nodejs.org/
    pause
    exit /b 1
)

echo [OK] Node.js version:
node --version
echo.

REM Install dependencies if needed
if not exist "node_modules\" (
    echo Installing dependencies...
    call npm install
    echo.
)

REM Build web assets
echo Building web assets...
call npm run build
echo.

REM Add Android platform if not exists
if not exist "android\" (
    echo Adding Android platform...
    call npx cap add android
    echo.
)

REM Sync Capacitor
echo Syncing Capacitor...
call npx cap sync android
echo.

REM Build APK
echo Building Android APK...
cd android
call gradlew.bat assembleDebug
cd ..
echo.

REM Check if APK was created
if exist "android\app\build\outputs\apk\debug\app-debug.apk" (
    echo.
    echo ========================================
    echo SUCCESS! APK built successfully!
    echo ========================================
    echo.
    echo APK Location: android\app\build\outputs\apk\debug\app-debug.apk
    echo.
    
    REM Copy APK to root for easy access
    copy "android\app\build\outputs\apk\debug\app-debug.apk" "a.c.t-pos-debug.apk"
    echo APK also copied to: a.c.t-pos-debug.apk
    echo.
    echo You can now install this APK on your Android device.
    echo.
) else (
    echo.
    echo ERROR: Build failed. Check the output above for errors.
    echo.
)

pause
