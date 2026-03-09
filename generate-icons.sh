#!/bin/bash

# Android Icon & Splash Screen Generator for A.C.T Shopkeeper
# Fully replaces ALL Capacitor-generated icon layers with custom icons.

echo "Generating Android Icons & Splash Screens..."

cd "$(dirname "$0")"

if ! command -v convert &> /dev/null; then
    echo "Error: ImageMagick is not installed"
    echo "Please install it: sudo apt-get install imagemagick"
    exit 1
fi

SOURCE_ICON="resources/icon.png"
SOURCE_SPLASH="resources/splash.png"

if [ ! -f "$SOURCE_ICON" ]; then
    echo "Error: icon.png not found in resources folder"
    exit 1
fi

echo "Source icon found: $SOURCE_ICON"

# Create all Android resource directories
mkdir -p android/app/src/main/res/mipmap-mdpi
mkdir -p android/app/src/main/res/mipmap-hdpi
mkdir -p android/app/src/main/res/mipmap-xhdpi
mkdir -p android/app/src/main/res/mipmap-xxhdpi
mkdir -p android/app/src/main/res/mipmap-xxxhdpi
mkdir -p android/app/src/main/res/mipmap-anydpi-v26
mkdir -p android/app/src/main/res/drawable
mkdir -p android/app/src/main/res/drawable-land-mdpi
mkdir -p android/app/src/main/res/drawable-land-hdpi
mkdir -p android/app/src/main/res/drawable-land-xhdpi
mkdir -p android/app/src/main/res/drawable-land-xxhdpi
mkdir -p android/app/src/main/res/drawable-land-xxxhdpi
mkdir -p android/app/src/main/res/drawable-port-mdpi
mkdir -p android/app/src/main/res/drawable-port-hdpi
mkdir -p android/app/src/main/res/drawable-port-xhdpi
mkdir -p android/app/src/main/res/drawable-port-xxhdpi
mkdir -p android/app/src/main/res/drawable-port-xxxhdpi
mkdir -p android/app/src/main/res/values

echo "Generating standard launcher PNGs..."
convert "$SOURCE_ICON" -resize 48x48   android/app/src/main/res/mipmap-mdpi/ic_launcher.png
convert "$SOURCE_ICON" -resize 72x72   android/app/src/main/res/mipmap-hdpi/ic_launcher.png
convert "$SOURCE_ICON" -resize 96x96   android/app/src/main/res/mipmap-xhdpi/ic_launcher.png
convert "$SOURCE_ICON" -resize 144x144 android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png
convert "$SOURCE_ICON" -resize 192x192 android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png

# Round icons (simple resize - works fine for most launchers)
cp android/app/src/main/res/mipmap-mdpi/ic_launcher.png    android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png
cp android/app/src/main/res/mipmap-hdpi/ic_launcher.png    android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png
cp android/app/src/main/res/mipmap-xhdpi/ic_launcher.png   android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png
cp android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png  android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png
cp android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png

echo "Generating adaptive icon foreground layers (Android 8+)..."
# Foreground: logo fills 75% of canvas — gives a clean padded look on the launcher
# Canvas sizes per density: mdpi=108, hdpi=162, xhdpi=216, xxhdpi=324, xxxhdpi=432
# Logo at 75%:              81,       122,      162,       243,         324
convert "$SOURCE_ICON" -resize 81x81    -background none -gravity center -extent 108x108 android/app/src/main/res/mipmap-mdpi/ic_launcher_foreground.png
convert "$SOURCE_ICON" -resize 122x122  -background none -gravity center -extent 162x162 android/app/src/main/res/mipmap-hdpi/ic_launcher_foreground.png
convert "$SOURCE_ICON" -resize 162x162  -background none -gravity center -extent 216x216 android/app/src/main/res/mipmap-xhdpi/ic_launcher_foreground.png
convert "$SOURCE_ICON" -resize 243x243  -background none -gravity center -extent 324x324 android/app/src/main/res/mipmap-xxhdpi/ic_launcher_foreground.png
convert "$SOURCE_ICON" -resize 324x324  -background none -gravity center -extent 432x432 android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png

echo "Writing adaptive icon XMLs..."
cat > android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml << 'EOF'
<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
EOF

cat > android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml << 'EOF'
<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
EOF

echo "Writing background color (purple #ffffff)..."
COLORS_FILE="android/app/src/main/res/values/colors.xml"
if [ -f "$COLORS_FILE" ]; then
    if grep -q "ic_launcher_background" "$COLORS_FILE"; then
        sed -i 's|<color name="ic_launcher_background">.*</color>|<color name="ic_launcher_background">#ffffff</color>|g' "$COLORS_FILE"
    else
        sed -i 's|</resources>|    <color name="ic_launcher_background">#ffffff</color>\n</resources>|' "$COLORS_FILE"
    fi
else
    printf '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#ffffff</color>\n    <color name="splash_background">#ffffff</color>\n</resources>\n' > "$COLORS_FILE"
fi

# Add splash_background colour if not already present
if ! grep -q "splash_background" "$COLORS_FILE"; then
    sed -i 's|</resources>|    <color name="splash_background">#ffffff</color>\n</resources>|' "$COLORS_FILE"
fi

echo "Generating splash screens (PNG fallback for older Android)..."
convert -size 320x480   canvas:'#ffffff' "$SOURCE_ICON" -resize 200x200 -gravity center -composite android/app/src/main/res/drawable-port-mdpi/splash.png
convert -size 480x800   canvas:'#ffffff' "$SOURCE_ICON" -resize 300x300 -gravity center -composite android/app/src/main/res/drawable-port-hdpi/splash.png
convert -size 720x1280  canvas:'#ffffff' "$SOURCE_ICON" -resize 450x450 -gravity center -composite android/app/src/main/res/drawable-port-xhdpi/splash.png
convert -size 960x1600  canvas:'#ffffff' "$SOURCE_ICON" -resize 600x600 -gravity center -composite android/app/src/main/res/drawable-port-xxhdpi/splash.png
convert -size 1280x1920 canvas:'#ffffff' "$SOURCE_ICON" -resize 800x800 -gravity center -composite android/app/src/main/res/drawable-port-xxxhdpi/splash.png
convert -size 480x320   canvas:'#ffffff' "$SOURCE_ICON" -resize 200x200 -gravity center -composite android/app/src/main/res/drawable-land-mdpi/splash.png
convert -size 800x480   canvas:'#ffffff' "$SOURCE_ICON" -resize 300x300 -gravity center -composite android/app/src/main/res/drawable-land-hdpi/splash.png
convert -size 1280x720  canvas:'#ffffff' "$SOURCE_ICON" -resize 450x450 -gravity center -composite android/app/src/main/res/drawable-land-xhdpi/splash.png
convert -size 1600x960  canvas:'#ffffff' "$SOURCE_ICON" -resize 600x600 -gravity center -composite android/app/src/main/res/drawable-land-xxhdpi/splash.png
convert -size 1920x1280 canvas:'#ffffff' "$SOURCE_ICON" -resize 800x800 -gravity center -composite android/app/src/main/res/drawable-land-xxxhdpi/splash.png
convert -size 2732x2732 canvas:'#ffffff' "$SOURCE_ICON" -resize 800x800 -gravity center -composite android/app/src/main/res/drawable/splash.png

echo "Writing XML splash drawable (Android 12+ SplashScreen API)..."
# Android 12+ uses a SplashScreen API that reads a layer-list XML drawable.
# Without this, only the background colour shows — the icon is invisible.
mkdir -p android/app/src/main/res/drawable-v31
cat > android/app/src/main/res/drawable-v31/splash.xml << 'EOF'
<?xml version="1.0" encoding="utf-8"?>
<!-- Android 12+ SplashScreen API compatible splash drawable.
     The SplashScreen API ignores PNG splash images and instead renders
     the windowSplashScreenAnimatedIcon value from the theme.
     This layer-list is used by older Capacitor SplashScreen plugin versions
     as a fallback for the splash window background. -->
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <!-- Full-screen white background -->
    <item>
        <color android:color="#ffffff"/>
    </item>
    <!-- Centred app icon, scaled to ~38% of screen (matches Android guidelines) -->
    <item
        android:width="200dp"
        android:height="200dp"
        android:gravity="center"
        android:drawable="@mipmap/ic_launcher_foreground"/>
</layer-list>
EOF

echo "Writing Android 12+ SplashScreen theme override..."
mkdir -p android/app/src/main/res/values-v31
cat > android/app/src/main/res/values-v31/styles.xml << 'EOF'
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <!-- Android 12+ SplashScreen: sets the icon shown during startup.
         Without this, Android 12+ shows only a white screen until
         the Capacitor WebView finishes loading. -->
    <style name="AppTheme.SplashScreen" parent="Theme.SplashScreen">
        <item name="windowSplashScreenBackground">#ffffff</item>
        <item name="windowSplashScreenAnimatedIcon">@mipmap/ic_launcher_foreground</item>
        <item name="windowSplashScreenAnimationDuration">500</item>
        <item name="postSplashScreenTheme">@style/AppTheme</item>
    </style>
</resources>
EOF

echo "Done! Icons and splash screens generated."
echo ""
echo "Icon strategy:"
echo "  PNG icons  -> ic_launcher + ic_launcher_round (pre-Android 8)"
echo "  Foreground -> ic_launcher_foreground.png = our logo (Android 8+)"
echo "  Background -> #ffffff purple (Android 8+)"
echo "  XML files  -> mipmap-anydpi-v26 points to our foreground + background"
echo ""
