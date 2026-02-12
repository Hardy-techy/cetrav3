# 🚀 DeLend Deployment Guide - Step by Step

**Time Required:** 15-20 minutes  
**Difficulty:** Easy

---

## 📋 Prerequisites

Before starting, make sure you have:
- [ ] GitHub account ([Sign up here](https://github.com/signup))
- [ ] Vercel account ([Sign up here](https://vercel.com/signup))
- [ ] Git installed on Windows

---

## STEP 1: Install Git (If Not Installed)

### Check if Git is installed:
```powershell
git --version
```

### If you see an error, install Git:
1. Download Git: https://git-scm.com/download/win
2. Run the installer
3. Use default settings (just keep clicking "Next")
4. Restart your terminal/PowerShell

---

## STEP 2: Initialize Git Repository

Open PowerShell in your project folder:

```powershell
# Navigate to your project
cd c:\Users\harik\Downloads\DeLend-main\DeLend-main

# Initialize git
git init

# Add all files
git add .

# Create first commit
git commit -m "Initial commit: DeLend dApp"
```

**Expected Output:**
```
Initialized empty Git repository...
[main (root-commit) abc1234] Initial commit: DeLend dApp
 89 files changed, 12345 insertions(+)
```

---

## STEP 3: Create GitHub Repository

### Option A: Using GitHub Website (Easier)

1. **Go to:** https://github.com/new

2. **Fill in:**
   - Repository name: `DeLend`
   - Description: `Decentralized Lending & Borrowing dApp on PushChain`
   - Visibility: **Public** (or Private if you prefer)
   - **IMPORTANT:** ❌ DO NOT check "Add README" (we already have one)

3. **Click:** "Create repository"

4. **Copy the commands** shown on the next page (they look like this):
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/DeLend.git
   git branch -M main
   git push -u origin main
   ```

5. **Run those commands** in your PowerShell

---

### Option B: Using GitHub CLI (Advanced)

```powershell
# Install GitHub CLI first: https://cli.github.com/

# Login to GitHub
gh auth login

# Create and push repository
gh repo create DeLend --public --source=. --remote=origin --push
```

---

## STEP 4: Verify GitHub Upload

1. Go to: `https://github.com/YOUR_USERNAME/DeLend`
2. You should see all your files there! ✅

---

## STEP 5: Deploy to Vercel

### 5.1: Connect GitHub to Vercel

1. **Go to:** https://vercel.com/new

2. **Click:** "Import Git Repository"

3. **Select:** Your GitHub account

4. **Find and Import:** Your `DeLend` repository

---

### 5.2: Configure Project

Vercel will auto-detect Next.js. Just verify:

- **Framework Preset:** Next.js ✅ (auto-detected)
- **Root Directory:** `./` ✅
- **Build Command:** `npm run build` ✅
- **Output Directory:** `.next` ✅

**Click:** "Deploy" (but WAIT! Add environment variables first)

---

### 5.3: Add Environment Variables

**BEFORE clicking Deploy**, click "Environment Variables" and add these:

| Name | Value |
|------|-------|
| `NEXT_PUBLIC_LENDING_CONTRACT_ADDRESS` | `0x0bDc974Da607FA01a0becAd9C7Ea8F6cBDA3C4Eb` |
| `NEXT_PUBLIC_NETWORK_ID` | `1301` |
| `NEXT_PUBLIC_CHAIN_ID` | `1301` |
| `NEXT_PUBLIC_PUSH_RPC_URL` | `/api/rpc` |
| `PRIVATE_RPC_URL` | `https://rpc.cetra.app` |
| `NEXT_PUBLIC_PUSH_NETWORK` | `testnet` |

**How to add:**
1. Click "+ Add Another"
2. Enter Name
3. Enter Value
4. Repeat for all 6 variables

---

### 5.4: Deploy!

**Now click:** "Deploy"

Vercel will:
1. Clone your code from GitHub
2. Install dependencies (`npm install`)
3. Build your app (`npm run build`)
4. Deploy to production

**Wait 2-3 minutes...** ⏳

---

## STEP 6: Verify Deployment

### 6.1: Check Build Status

You'll see a build log. Look for:
```
✓ Compiled successfully
✓ Linting and checking validity of types
✓ Creating an optimized production build
✓ Collecting page data
✓ Generating static pages
✓ Finalizing page optimization

Build Completed
```

### 6.2: Visit Your Live Site

Vercel will give you a URL like:
```
https://delend-abc123.vercel.app
```

**Click it!** Your dApp should be live! 🎉

---

## STEP 7: Test Your Deployment

Visit these URLs to verify everything works:

1. **Homepage:** `https://your-app.vercel.app/`
2. **Dashboard:** `https://your-app.vercel.app/dashboard`
3. **Markets:** `https://your-app.vercel.app/market`
4. **API:** `https://your-app.vercel.app/api/rpc` (should show error - that's OK, it means it's working)

**Test:**
- [ ] Wallet connection works
- [ ] Dashboard loads
- [ ] Markets page loads
- [ ] No console errors

---

## 🎉 SUCCESS!

Your DeLend dApp is now live on the internet!

### Your URLs:
- **Live Site:** `https://your-app.vercel.app`
- **GitHub Repo:** `https://github.com/YOUR_USERNAME/DeLend`
- **Vercel Dashboard:** `https://vercel.com/dashboard`

---

## 🔧 Troubleshooting

### Build Failed?

**Error:** `Module not found`
**Fix:**
```powershell
# In your local project
npm install
git add package-lock.json
git commit -m "fix: update dependencies"
git push
```
Vercel will auto-redeploy.

---

### Environment Variables Not Working?

1. Go to Vercel Dashboard
2. Click your project
3. Settings → Environment Variables
4. Verify all 6 variables are there
5. Click "Redeploy" button

---

### API Route Returns 404?

Make sure `pages/api/rpc.js` exists and was pushed to GitHub.

---

## 📝 Next Steps

1. **Custom Domain** (Optional)
   - Go to Vercel → Settings → Domains
   - Add your domain (e.g., `delend.app`)

2. **Share Your dApp**
   - Copy your Vercel URL
   - Share with users/testers

3. **Monitor Usage**
   - Vercel Dashboard → Analytics
   - See visitor stats

4. **Update Your Code**
   ```powershell
   # Make changes locally
   git add .
   git commit -m "your changes"
   git push
   # Vercel auto-deploys! 🚀
   ```

---

## 🆘 Need Help?

- **Vercel Docs:** https://vercel.com/docs
- **Next.js Docs:** https://nextjs.org/docs
- **GitHub Docs:** https://docs.github.com

---

**Congratulations! You've deployed your first dApp!** 🎊
