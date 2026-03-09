# GitHub Actions - Automatic APK Build Guide

This guide shows you how to use GitHub Actions to automatically build your Android APK in the cloud - no need to install Android Studio or SDKs on your computer!

## 🎯 What is GitHub Actions?

GitHub Actions is a free service from GitHub that automatically builds your app whenever you push code. It's like having a build server in the cloud!

### Benefits:
- ✅ **No local setup needed** - No Android Studio, no SDKs
- ✅ **Automatic builds** - Push code, get APK
- ✅ **Free for public repos** - Unlimited builds
- ✅ **Fast** - Builds in 5-7 minutes
- ✅ **Version history** - Keep all your APKs

## 📋 Prerequisites

1. **GitHub Account** (free)
   - Sign up at https://github.com

2. **Git installed** (optional, can use GitHub web interface)
   - Download from https://git-scm.com

That's it! No Android tools needed.

## 🚀 Setup (One-Time)

### Step 1: Create GitHub Repository

1. Go to https://github.com/new
2. Fill in:
   - **Repository name**: `a.c.t-pos`
   - **Description**: Cash Register and Sales Management App
   - **Visibility**: Public (for free Actions) or Private (2000 free minutes/month)
3. Click "Create repository"

### Step 2: Push Your Code

#### Option A: Using Git Command Line

```bash
cd a.c.t-pos

# Initialize git
git init

# Add all files
git add .

# Make first commit
git commit -m "Initial commit - A.C.T POS app"

# Connect to GitHub
git remote add origin https://github.com/YOUR_USERNAME/a.c.t-pos.git

# Push code
git push -u origin main
```

#### Option B: Using GitHub Desktop (Easier)

1. Download GitHub Desktop: https://desktop.github.com
2. File → Add Local Repository
3. Select your `a.c.t-pos` folder
4. Click "Publish repository"
5. Choose public/private and click "Publish"

#### Option C: Using GitHub Web Interface

1. Go to your repository on GitHub
2. Click "uploading an existing file"
3. Drag and drop your entire `a.c.t-pos` folder
4. Click "Commit changes"

### Step 3: Verify Workflow File

Make sure `.github/workflows/android.yml` exists in your repository:

```
a.c.t-pos/
  └── .github/
      └── workflows/
          └── android.yml  ← This file triggers automatic builds
```

## 🔨 Building Your APK

### Method 1: Automatic Build (On Every Push)

**The workflow automatically runs when you:**
- Push code to `main` or `master` branch
- Create a pull request

Just push your code and wait!

```bash
git add .
git commit -m "Update app"
git push
```

### Method 2: Manual Build (Trigger Anytime)

You can manually trigger a build without pushing code:

1. Go to your repository on GitHub
2. Click **"Actions"** tab at the top
3. Click **"Build Android APK"** on the left
4. Click **"Run workflow"** button (right side)
5. Click **"Run workflow"** in the dropdown
6. Wait 5-7 minutes

## 📥 Downloading Your APK

### After Build Completes:

1. **Go to Actions tab**
   - URL: `https://github.com/YOUR_USERNAME/a.c.t-pos/actions`

2. **Click on the latest workflow run**
   - You'll see a green checkmark ✅ if successful
   - Red X ❌ if failed (check logs)

3. **Scroll down to "Artifacts"**
   - You'll see two files:
     - `a.c.t-pos-latest` - Main APK (always latest)
     - `a.c.t-pos-YYYYMMDD-abc123` - Dated APK with commit hash

4. **Click to download**
   - Downloads as a ZIP file
   - Extract the ZIP to get the APK
   - Install on your Android device

## 📱 Installing the APK

1. **Transfer APK to your phone**
   - Email it to yourself
   - Upload to Google Drive
   - Direct USB transfer

2. **On your Android device:**
   - Open the APK file
   - Allow installation from unknown sources if prompted
   - Tap "Install"
   - Done! ✅

## 🏷️ Creating Releases (Optional)

For important versions, create a release:

### Step 1: Create a Tag

```bash
# Create and push a tag
git tag v1.0.0
git push origin v1.0.0
```

Or on GitHub:
1. Go to "Releases" → "Create a new release"
2. Click "Choose a tag" → Type `v1.0.0` → "Create new tag"
3. Fill in title: "Version 1.0.0"
4. Click "Publish release"

### Step 2: Download from Releases

- The APK is automatically attached to the release
- Anyone can download without logging in
- Permanent link you can share

## 🔍 Monitoring Builds

### Check Build Status

1. **Actions tab** shows all builds
2. **Green checkmark** = Success ✅
3. **Yellow circle** = Building 🔄
4. **Red X** = Failed ❌

### View Build Logs

Click on any workflow run to see:
- Each step's output
- Any errors
- Build time
- APK size

### Build Takes About:
- **5-7 minutes** for first build
- **3-5 minutes** for subsequent builds (cached)

## ⚠️ Troubleshooting

### Build Failed?

1. **Click on the failed workflow**
2. **Click on "build" job**
3. **Expand the failed step** (red X)
4. **Read the error message**

Common issues:

#### "npm ci failed"
- **Problem**: Dependencies issue
- **Solution**: Check `package.json` is valid JSON

#### "gradlew assembleDebug failed"
- **Problem**: Android build error
- **Solution**: Check if you modified Android files incorrectly

#### "Workflow file not found"
- **Problem**: `.github/workflows/android.yml` missing
- **Solution**: Make sure the file exists and is committed

### No Artifacts Showing?

- Wait for build to complete (green checkmark)
- Refresh the page
- Artifacts expire after 90 days

### Can't Download APK?

- Make sure you're logged into GitHub
- Try different browser
- Check your internet connection

## 💰 GitHub Actions Limits

### Free Tier (Public Repos):
- ✅ **Unlimited builds**
- ✅ **Unlimited minutes**
- ✅ **Unlimited storage**

### Free Tier (Private Repos):
- ✅ **2,000 minutes/month**
- ✅ **500 MB storage**
- Each build uses ~5-7 minutes
- = About 300+ builds/month

### If You Exceed:
- Builds stop until next month
- Or upgrade to paid plan ($4/month for 3000 minutes)

## 🎨 Customizing the Workflow

### Change App Name in APK

Edit `android.yml`, line with `Rename APK`:

```yaml
cp android/app/build/outputs/apk/debug/app-debug.apk \
   apk-output/MY-CUSTOM-NAME-latest.apk
```

### Build Only on Specific Branch

Edit `android.yml`:

```yaml
on:
  push:
    branches: [ production ]  # Only build on 'production' branch
```

### Add Automatic Testing

Add before "Build debug APK":

```yaml
- name: Run tests
  run: npm test
```

### Enable Build Notifications

GitHub can email you on build success/failure:

1. Settings → Notifications
2. Check "Actions"
3. Choose email or web notifications

## 📊 Advanced: Build Status Badge

Add a build status badge to your README:

```markdown
![Build Status](https://github.com/YOUR_USERNAME/a.c.t-pos/actions/workflows/android.yml/badge.svg)
```

Shows: ![Build Passing](https://img.shields.io/badge/build-passing-brightgreen)

## 🔐 Security Notes

### The workflow file:
- ✅ Uses official GitHub actions
- ✅ No secrets needed for debug builds
- ✅ Runs in isolated environment
- ✅ Safe to use

### For production builds:
- Store keystore in GitHub Secrets
- Never commit passwords to git
- Use encrypted secrets for API keys

## 📚 Useful GitHub Actions Commands

```bash
# View workflow runs
gh run list --workflow=android.yml

# Watch a build in real-time
gh run watch

# Download latest artifact
gh run download

# Re-run failed build
gh run rerun
```

(Requires GitHub CLI: https://cli.github.com)

## 🎯 Quick Reference

| Action | Command/Steps |
|--------|--------------|
| Push code | `git push` |
| Manual build | Actions tab → Run workflow |
| Download APK | Actions → Latest run → Artifacts |
| Create release | Releases → New release → Create tag |
| View logs | Actions → Click run → build |
| Check status | Actions tab (green ✅ / red ❌) |

## 🆘 Getting Help

If you have issues:

1. **Check the logs** in Actions tab
2. **Google the error message**
3. **Check GitHub Actions status**: https://www.githubstatus.com
4. **Review this guide** for common solutions

## ✨ Tips

1. **Keep artifacts organized**
   - Delete old builds to save space
   - Actions → Select workflow → Delete

2. **Use descriptive commit messages**
   - Easy to track which build is which
   - Example: "Fix payment button bug"

3. **Create releases for milestones**
   - v1.0.0 for first production
   - v1.1.0 for new features
   - v1.0.1 for bug fixes

4. **Enable branch protection**
   - Settings → Branches → Add rule
   - Require builds to pass before merging

---

**That's it!** You now have a professional CI/CD pipeline. Every time you push code, GitHub automatically builds your APK. No local Android setup needed! 🚀
