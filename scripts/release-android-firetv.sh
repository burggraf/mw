#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

APP_DIR="/Users/markb/dev/mw/app"
KEYSTORE_FILE="$HOME/mobileworship-release.jks"
KEYSTORE_PROPS="$APP_DIR/src-tauri/gen/android/keystore.properties"
PACKAGE_NAME="com.mobileworship.app5"

echo -e "${GREEN}=== Mobile Worship Fire TV Release Build ===${NC}"

# Check if keystore exists
if [ ! -f "$KEYSTORE_FILE" ]; then
    echo -e "${YELLOW}Keystore not found. Creating one now...${NC}"
    echo "You will be prompted to create a password and enter some details."
    echo ""
    keytool -genkey -v -keystore "$KEYSTORE_FILE" -keyalg RSA -keysize 2048 -validity 10000 -alias mobileworship
    echo ""
    echo -e "${GREEN}Keystore created at: $KEYSTORE_FILE${NC}"
    echo ""
    read -sp "Enter the password you just created (to save in keystore.properties): " KEYSTORE_PASSWORD
    echo ""

    # Update keystore.properties with the password
    cat > "$KEYSTORE_PROPS" << EOF
password=$KEYSTORE_PASSWORD
keyAlias=mobileworship
storeFile=$KEYSTORE_FILE
EOF
    echo -e "${GREEN}Updated keystore.properties${NC}"
fi

# Verify keystore.properties exists and has real password
if [ ! -f "$KEYSTORE_PROPS" ]; then
    echo -e "${RED}Error: keystore.properties not found at $KEYSTORE_PROPS${NC}"
    exit 1
fi

if grep -q "YOUR_PASSWORD_HERE" "$KEYSTORE_PROPS"; then
    echo -e "${RED}Error: Please update the password in $KEYSTORE_PROPS${NC}"
    exit 1
fi

cd "$APP_DIR"

# Build frontend first
echo -e "${YELLOW}Building frontend...${NC}"
pnpm build

# Clean Gradle build cache to prevent stale icon/banner issues
echo -e "${YELLOW}Cleaning Android build cache...${NC}"
cd "$APP_DIR/src-tauri/gen/android" && ./gradlew clean 2>/dev/null || true
cd "$APP_DIR"

# Ensure the correct TV banner is in place BEFORE build
echo -e "${YELLOW}Ensuring correct Fire TV banner...${NC}"
BANNER_SRC="$APP_DIR/src-tauri/icons/android/banner.png"
DRAWABLE_DIR="$APP_DIR/src-tauri/gen/android/app/src/main/res/drawable"
DRAWABLE_XHDPI="$APP_DIR/src-tauri/gen/android/app/src/main/res/drawable-xhdpi"
if [ -f "$BANNER_SRC" ]; then
    cp "$BANNER_SRC" "$DRAWABLE_DIR/tv_banner.png"
    cp "$BANNER_SRC" "$DRAWABLE_DIR/banner.png"
    mkdir -p "$DRAWABLE_XHDPI"
    cp "$BANNER_SRC" "$DRAWABLE_XHDPI/tv_banner.png"
    cp "$BANNER_SRC" "$DRAWABLE_XHDPI/banner.png"
    echo -e "${GREEN}Banner files updated${NC}"
fi

# Ensure correct icons are in place (prevents Tauri from overwriting with default)
echo -e "${YELLOW}Ensuring correct app icons...${NC}"
ICONS_SRC="$APP_DIR/src-tauri/icons/android"
RES_DIR="$APP_DIR/src-tauri/gen/android/app/src/main/res"
for density in mdpi hdpi xhdpi xxhdpi xxxhdpi; do
    if [ -f "$ICONS_SRC/mipmap-$density/ic_launcher.png" ]; then
        cp "$ICONS_SRC/mipmap-$density/ic_launcher.png" "$RES_DIR/mipmap-$density/ic_launcher.png"
    fi
done
# Also copy to drawable for Fire TV
cp "$ICONS_SRC/mipmap-xhdpi/ic_launcher.png" "$RES_DIR/drawable/ic_launcher.png" 2>/dev/null || true
mkdir -p "$RES_DIR/drawable-xhdpi"
cp "$ICONS_SRC/mipmap-xhdpi/ic_launcher.png" "$RES_DIR/drawable-xhdpi/ic_launcher.png" 2>/dev/null || true
echo -e "${GREEN}Icon files updated${NC}"

# Build Android release for armv7 (Fire TV 4K Max architecture)
echo -e "${YELLOW}Building Android release APK (armv7)...${NC}"
pnpm tauri android build --target armv7

# Find the APK
APK_PATH="$APP_DIR/src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk"

if [ ! -f "$APK_PATH" ]; then
    # Try alternate location
    APK_PATH="$APP_DIR/src-tauri/gen/android/app/build/outputs/apk/arm/release/app-arm-release.apk"
fi

if [ ! -f "$APK_PATH" ]; then
    echo -e "${RED}Error: Could not find release APK${NC}"
    echo "Checking build output directory..."
    find "$APP_DIR/src-tauri/gen/android/app/build/outputs" -name "*.apk" 2>/dev/null || echo "No APKs found"
    exit 1
fi

echo -e "${GREEN}APK built: $APK_PATH${NC}"
APK_SIZE=$(du -h "$APK_PATH" | cut -f1)
echo -e "Size: $APK_SIZE"

# Check if ADB device is connected
echo -e "${YELLOW}Checking for connected devices...${NC}"
if ! adb devices | grep -q "device$"; then
    echo -e "${RED}No ADB device connected.${NC}"
    echo "Make sure your Fire TV is connected via ADB:"
    echo "  1. Enable Developer Options on Fire TV (Settings > My Fire TV > About > click on device name 7 times)"
    echo "  2. Enable ADB Debugging (Settings > My Fire TV > Developer Options > ADB debugging)"
    echo "  3. Connect via: adb connect <fire-tv-ip>:5555"
    exit 1
fi

echo -e "${GREEN}Device found!${NC}"
adb devices

# Clear app cache and data, then uninstall (to fix icon caching issues)
echo -e "${YELLOW}Clearing app cache and uninstalling existing app (if any)...${NC}"
adb shell pm clear "$PACKAGE_NAME" 2>/dev/null || true
adb uninstall "$PACKAGE_NAME" 2>/dev/null || true

# Aggressive Fire TV launcher cache clear (fixes icon/banner caching)
echo -e "${YELLOW}Clearing Fire TV launcher icon cache...${NC}"
adb shell pm clear com.amazon.tv.launcher 2>/dev/null || true
adb shell pm clear com.amazon.firelauncher 2>/dev/null || true
adb shell pm clear com.amazon.hedwig 2>/dev/null || true
adb shell pm clear com.amazon.vizzini 2>/dev/null || true
adb shell am force-stop com.amazon.tv.launcher 2>/dev/null || true

# Install the new APK
echo -e "${YELLOW}Installing APK...${NC}"
adb install "$APK_PATH"

# Force stop and restart launcher to refresh icons
echo -e "${YELLOW}Refreshing Fire TV launcher...${NC}"
adb shell am force-stop com.amazon.tv.launcher 2>/dev/null || true
adb shell am force-stop com.amazon.firelauncher 2>/dev/null || true

# Small delay to let launcher restart
sleep 2

echo -e "${GREEN}=== Installation complete! ===${NC}"
echo ""
echo -e "${YELLOW}NOTE: If the icon still shows incorrectly, try:${NC}"
echo "  1. Restart your Fire TV: adb reboot"
echo "  2. Wait 1-2 minutes after reboot for icons to refresh"
echo ""
echo "To launch the app on Fire TV:"
echo "  adb shell am start -n $PACKAGE_NAME/.MainActivity"
