# GitHub Setup & Source Control Guide
## Beginner-Friendly Step-by-Step Instructions

### Table of Contents
1. [Prerequisites](#prerequisites)
2. [Step 1: Create GitHub Account](#step-1-create-github-account)
3. [Step 2: Install Git](#step-2-install-git)
4. [Step 3: Configure Git](#step-3-configure-git)
5. [Step 4: Create Repository](#step-4-create-repository)
6. [Step 5: Upload Project](#step-5-upload-project)
7. [Step 6: Verify Upload](#step-6-verify-upload)
8. [Common Commands Reference](#common-commands-reference)
9. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before you start, make sure you have:
- ✅ A computer with macOS, Windows, or Linux
- ✅ Internet connection
- ✅ This project folder ready (`/Users/yagmurbesher/Documents/sources/OBC-IFCViewer`)
- ✅ About 15 minutes of time

---

## Step 1: Create GitHub Account

### What is GitHub?
GitHub is a cloud storage service for code projects. It keeps your code safe, lets you track changes, and collaborate with others.

### How to Create Account:

1. **Open your web browser** and go to [https://github.com](https://github.com)

2. **Click "Sign up"** (top right corner)

3. **Fill in the form:**
   - Enter your email address
   - Create a password (make it strong!)
   - Choose a username (e.g., `your-name` or `yagmur-besher`)
   - Choose whether you want email updates (optional)

4. **Verify your email:**
   - GitHub sends you an email
   - Click the verification link in the email
   - Complete the setup wizard

5. **Your GitHub account is ready!** ✅

---

## Step 2: Install Git

### What is Git?
Git is the software that tracks changes in your code. GitHub uses Git.

### Check if Git is Already Installed:

**On macOS:**
1. Open Terminal (Applications → Utilities → Terminal)
2. Type: `git --version`
3. Press Enter

If you see a version number (like `git version 2.39.0`), **Git is already installed** ✅

### If Git is NOT Installed:

**On macOS (easiest method):**
1. Open Terminal
2. Copy and paste this command:
   ```bash
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   ```
3. Wait for it to finish, then type:
   ```bash
   brew install git
   ```

**On Windows:**
1. Download from: [https://git-scm.com/download/win](https://git-scm.com/download/win)
2. Run the installer
3. Click "Next" for most prompts (defaults are fine)

**On Linux:**
```bash
sudo apt-get install git    # Ubuntu/Debian
# or
sudo yum install git        # Fedora/CentOS
```

---

## Step 3: Configure Git

### Tell Git Who You Are:

Git needs to know your name and email. Open Terminal and run these two commands:

```bash
git config --global user.name "Your Name"
```

Replace `"Your Name"` with your actual name (e.g., `"Yagmur Besher"`)

Then:

```bash
git config --global user.email "your-email@example.com"
```

Replace with the same email you used for GitHub.

### Verify It Worked:

```bash
git config --global --list
```

You should see your name and email in the output. ✅

---

## Step 4: Create Repository

### What is a Repository?
A "repository" (or "repo") is your project's home on GitHub. It stores all your files and their history.

### Create on GitHub:

1. **Log in to GitHub** at [https://github.com](https://github.com)

2. **Click the "+" icon** (top right, next to your profile photo)

3. **Select "New repository"**

4. **Fill in the form:**
   - **Repository name:** `OBC-IFCViewer` (must match your folder name)
   - **Description:** `An advanced IFC viewer built with OBC (Open BIM Components)` (optional but helpful)
   - **Public or Private?**
     - Choose **"Public"** if you want others to see your code
     - Choose **"Private"** if you want it only for you
   - **Initialize repository options:**
     - ✅ Check "Add a README file"
     - ✅ Check "Add .gitignore" → Select **"Node"** (since you use npm)
     - ✅ Check "Choose a license" → Select **"MIT License"** (popular for open source)

5. **Click "Create repository"** ✅

### You now have an empty repository on GitHub!

---

## Step 5: Upload Project

This is the main part. Follow these steps carefully in Terminal.

### Step 5a: Navigate to Your Project Folder

```bash
cd /Users/yagmurbesher/Documents/sources/OBC-IFCViewer
```

### Step 5b: Initialize Git Locally

This tells Git to start tracking your project:

```bash
git init
```

### Step 5c: Add All Your Files

This prepares all files to be uploaded:

```bash
git add .
```

The `.` means "all files in this folder and subfolders"

### Step 5d: Create Your First Commit

A "commit" is like taking a snapshot. It saves all your files with a message:

```bash
git commit -m "Initial commit: Complete OBC IFC Viewer with Floor Plan feature"
```

**What's `-m`?** It means "message". Always add a message describing what you're committing.

### Step 5e: Connect to GitHub

This tells your local Git where to upload files (replace `YOUR-USERNAME` with your actual GitHub username):

```bash
git remote add origin https://github.com/YOUR-USERNAME/OBC-IFCViewer.git
```

**Example:**
```bash
git remote add origin https://github.com/yagmur-besher/OBC-IFCViewer.git
```

### Step 5f: Upload to GitHub

```bash
git branch -M main
```

This renames your main branch to `main` (GitHub standard).

Then:

```bash
git push -u origin main
```

This uploads your files to GitHub. 🚀

**What happens:**
- You might be asked to authenticate
- On macOS, a browser window may open to log in
- After login, your files upload automatically
- Wait for the process to finish

---

## Step 6: Verify Upload

### Check on GitHub Website:

1. Go to [https://github.com/YOUR-USERNAME/OBC-IFCViewer](https://github.com/YOUR-USERNAME/OBC-IFCViewer)
2. You should see:
   - ✅ All your folders and files listed
   - ✅ Your README.md file displayed
   - ✅ Your initial commit message

**Congratulations! Your project is on GitHub!** 🎉

---

## Common Commands Reference

### Daily Operations:

**Check status (what changed?):**
```bash
git status
```

**Add files you changed:**
```bash
git add .                    # Add all files
git add src/file.ts          # Add specific file
```

**Save your changes (commit):**
```bash
git commit -m "Your message here"`
```

**Upload to GitHub:**
```bash
git push
```

**Download latest changes from GitHub:**
```bash
git pull
```

**See commit history:**
```bash
git log
```

---

## Workflow Example

Here's a realistic example of saving your work:

```bash
# 1. Make some changes to your code...
# (edit files in VS Code)

# 2. Check what changed
git status

# 3. Add your changes
git add .

# 4. Save with a message
git commit -m "Fixed floor plan camera controls"

# 5. Upload to GitHub
git push
```

That's it! Your changes are now backed up on GitHub. ✅

---

## Troubleshooting

### Problem: "git: command not found"
**Solution:** Git is not installed. Go back to [Step 2](#step-2-install-git)

### Problem: "Repository already exists"
**Solution:** You already ran `git init` in this folder. Just skip that step.

### Problem: "fatal: 'origin' does not appear to be a 'git' repository"
**Solution:** You didn't run `git init` first. Run it now:
```bash
git init
git remote add origin https://github.com/YOUR-USERNAME/OBC-IFCViewer.git
```

### Problem: "Permission denied" during git push
**Solution:** GitHub needs to authenticate you. Use Personal Access Token instead:
1. Go to GitHub Settings → Developer settings → Personal access tokens
2. Click "Generate new token"
3. Give it `repo` permissions
4. Copy the token
5. When prompted for password during `git push`, paste this token

### Problem: ".gitignore not working" (node_modules uploaded)
**Solution:** 
```bash
git rm -r --cached node_modules
git add .gitignore
git commit -m "Remove node_modules from tracking"
git push
```

---

## Advanced Tips (Optional)

### Create a Branch (for experimental features):
```bash
git branch feature/new-feature
git checkout feature/new-feature
```

### Go Back to Main:
```bash
git checkout main
```

### See All Branches:
```bash
git branch -a
```

### Delete a Branch:
```bash
git branch -d feature/new-feature
```

---

## What's Next?

### After First Upload:

1. **Regular Saving:** Every time you make changes:
   ```bash
   git add .
   git commit -m "Describe your changes"
   git push
   ```

2. **Backup:** Your code is now automatically backed up on GitHub ✅

3. **Collaboration:** You can invite others to work on your project

4. **Version Control:** You can see all changes ever made to your project

5. **Deployment:** You can deploy directly from GitHub to hosting services

---

## Quick Summary Checklist

- [ ] Created GitHub account
- [ ] Installed Git
- [ ] Configured Git (name & email)
- [ ] Created repository on GitHub
- [ ] Ran `git init` in your project folder
- [ ] Ran `git add .`
- [ ] Ran `git commit -m "message"`
- [ ] Ran `git remote add origin https://github.com/USERNAME/OBC-IFCViewer.git`
- [ ] Ran `git branch -M main`
- [ ] Ran `git push -u origin main`
- [ ] Verified files on GitHub website
- [ ] Ready to use daily workflow!

---

## Need More Help?

- GitHub's official guide: [https://docs.github.com/en/get-started](https://docs.github.com/en/get-started)
- Git tutorial: [https://git-scm.com/book/en/v2](https://git-scm.com/book/en/v2)
- Interactive Git practice: [https://learngitbranching.js.org/](https://learngitbranching.js.org/)

---

**Remember:** GitHub is your friend! It protects your code and makes collaboration easy. Start using it today! 🚀
