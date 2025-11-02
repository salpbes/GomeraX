# VS Code Built-in Source Control Guide
## How to Use Git in VS Code (Beginner-Friendly)

---

## Table of Contents

1. [What is VS Code Source Control?](#what-is-vs-code-source-control)
2. [Prerequisites](#prerequisites)
3. [Opening Source Control Panel](#opening-source-control-panel)
4. [Initial Setup](#initial-setup)
5. [Daily Workflow with VS Code](#daily-workflow-with-vs-code)
6. [Understanding the UI](#understanding-the-ui)
7. [Common Tasks](#common-tasks)
8. [Advanced Features](#advanced-features)
9. [Troubleshooting](#troubleshooting)

---

## What is VS Code Source Control?

VS Code has **Git built-in**. You don't need to open Terminal to manage your code!

### Benefits of using VS Code's Source Control:

✅ Visual interface (see changes with colors)
✅ No need to remember terminal commands
✅ See file changes before committing
✅ Manage branches easily
✅ View commit history with one click
✅ Collaborate with team members

---

## Prerequisites

Before using VS Code's source control:

1. **Git must be installed** on your computer
   - Run in Terminal: `git --version`
   - If not installed, see `GITHUB_SETUP_GUIDE.md`

2. **Have this project open in VS Code**
   - File → Open Folder
   - Navigate to: `/Users/yagmurbesher/Documents/sources/OBC-IFCViewer`
   - Click "Open"

3. **GitHub account created** (if uploading to cloud)
   - Create at: https://github.com

---

## Opening Source Control Panel

### Method 1: Using the Sidebar Icon (Easiest)

1. Look at the **left sidebar** in VS Code
2. Find the **"Source Control" icon** (looks like a branch: `⎇`)
3. **Click it**

### Method 2: Using Keyboard Shortcut

**Mac:** `Ctrl + Shift + G`
**Windows/Linux:** `Ctrl + Shift + G`

### Method 3: Using Command Palette

1. Press `Cmd + Shift + P` (Mac) or `Ctrl + Shift + P` (Windows/Linux)
2. Type: `Git: Open Repository`
3. Press Enter

**You should see the Source Control panel appear!** ✅

---

## Initial Setup

### First Time Using Git in This Project

When you first open Source Control, you might see:

```
Source Control
No source control providers registered.
```

### Initialize Git Repository

1. **In the Source Control panel**, click **"Initialize Repository"**
   - Or click the folder icon with a Git symbol

2. VS Code will run `git init` automatically

3. You should now see:
   - A list of files with dots next to them (means they're new/changed)
   - An input field at the top (for commit messages)
   - Buttons below (Commit, Discard, etc.)

**Done! Your project is now tracked by Git.** ✅

---

## Daily Workflow with VS Code

### Scenario: You Made Changes to Your Code

Let's say you edited `src/modules/FloorPlanModule.ts`

#### Step 1: See Your Changes

1. **Open Source Control panel** (click the branch icon on left)

2. You see your file listed under **"Changes"**
   - It shows: `src/modules/FloorPlanModule.ts`
   - A dot or indicator shows it's modified

#### Step 2: Review What Changed

1. **Click on the filename** in the Source Control panel

2. VS Code shows a **"Diff View"** with:
   - **Left side (Red):** Original code
   - **Right side (Green):** Your new changes

3. Review your changes to make sure they're correct

#### Step 3: Stage Your Changes

"Staging" means marking files to be committed.

**Option A: Stage all files**
1. Click the **"+"** icon next to "Changes"
2. All files move to **"Staged Changes"** section

**Option B: Stage specific files**
1. Click the **"+"** icon next to individual filenames
2. Only that file moves to "Staged Changes"

#### Step 4: Write Commit Message

1. Click in the **message input field** (top of Source Control panel)
   - It says "Message (Ctrl+Enter to commit)"

2. Type your message:
   ```
   Fixed floor plan camera controls
   ```

3. **Good commit messages:**
   - Start with action verb: "Fixed", "Added", "Updated", "Refactored"
   - Be specific: "Fixed camera rotation" (good) vs "Stuff" (bad)
   - Keep it short: Under 50 characters

#### Step 5: Commit

1. Click the **"Commit" button** (checkmark icon)
   - Or press: `Ctrl + Enter` (Mac: `Cmd + Enter`)

2. You should see:
   - Files disappear from "Changes"
   - Message appears in commit history
   - Success message in bottom corner

**Your changes are saved locally!** ✅

#### Step 6: Push to GitHub (Upload)

1. Click the **"..."** (three dots menu) at the top right of Source Control
   - Or look for a "Push" button

2. Select **"Push"**

3. Wait for upload to complete

**Your code is now on GitHub!** 🚀

---

## Understanding the UI

### Source Control Panel Layout

```
Source Control
├─ Message Input Field (type commit message here)
│
├─ Changes (red, modified files not yet staged)
│  ├─ src/modules/FloorPlanModule.ts    [+ button]
│  └─ src/main.ts                        [+ button]
│
├─ Staged Changes (green, ready to commit)
│  ├─ package.json                       [- button]
│  └─ README.md                          [- button]
│
├─ Commit Button                         [✓]
├─ Discard All Changes Button            [↻]
└─ ... (More Options Menu)
```

### What Each Button Does

| Icon | Name | What It Does |
|------|------|------------|
| **+** | Stage | Move file to "Staged Changes" (ready to commit) |
| **-** | Unstage | Move file back to "Changes" (undo staging) |
| **↻** | Discard | Delete changes (⚠️ WARNING: Can't undo!) |
| **✓** | Commit | Save all staged changes |
| **...** | More | Additional options (Push, Pull, Branch, etc.) |

---

## Common Tasks

### Task 1: Commit Your First Changes

**The complete workflow in VS Code:**

1. Make changes to files in your project
2. Open Source Control (`Ctrl + Shift + G`)
3. Review changes by clicking filenames
4. Click **+** to stage files (or use stage all button)
5. Type message: `Initial commit: Added new features`
6. Click **Commit** button
7. Click **...** → **Push** to upload to GitHub

### Task 2: Upload to GitHub for First Time

**After making your first commit:**

1. Click **...** (three dots) menu
2. Select **"Publish to GitHub"**
3. VS Code opens browser for GitHub login
4. Choose: Public or Private repository
5. Click authorize
6. Your files upload automatically! 🎉

### Task 3: See File Differences

1. In Source Control panel, click any filename
2. VS Code opens **Diff View**:
   - **Left (Red):** What it was
   - **Right (Green):** What it is now
3. Close by clicking the X tab

### Task 4: Undo a Commit

**If you committed but made a mistake:**

1. Click **...** menu
2. Select **"Undo Last Commit"**
3. Files go back to "Changes" (your code is safe!)

### Task 5: Discard Changes

**If you want to DELETE changes (be careful!):**

1. Click **↻** button next to the file you want to discard
2. Or click **...** → **"Discard All Changes"**
3. **WARNING:** This can't be undone! Make sure you don't need those changes.

### Task 6: Switch Branches

**To work on a different version of code:**

1. At bottom left of VS Code, you see your branch name (usually "main")
2. Click on it
3. Select **"Create New Branch"** or **"Checkout Existing Branch"**
4. Type branch name: `feature/new-feature`
5. Start coding!

### Task 7: Merge Branches

**When your feature is ready:**

1. Click branch name at bottom
2. Select **"Merge Branch..."**
3. Choose which branch to merge into current
4. Done! ✅

---

## Advanced Features

### 1. View Commit History

**See all your past commits:**

1. In Source Control, click **"Commit History"** or look for a clock icon
2. Or: Click **...** → **"Show Log"**
3. See all commits with:
   - Message
   - Author
   - Date
   - What files changed

### 2. Clone a Repository

**Download someone else's project from GitHub:**

1. Press `Cmd + Shift + P` (Mac) or `Ctrl + Shift + P`
2. Type: `Git: Clone`
3. Paste GitHub URL
4. Choose where to save
5. VS Code opens the project!

### 3. Create a .gitignore

**Files to NOT upload to GitHub:**

1. Right-click in the explorer
2. Create file: `.gitignore`
3. Add lines for files to ignore:
   ```
   node_modules/
   dist/
   .env
   .DS_Store
   ```

### 4. Stash Changes

**Save your work without committing:**

1. Click **...** menu
2. Select **"Stash"** or **"Stash (Include Untracked)"**
3. Your changes are saved temporarily
4. Later, click **...** → **"Stash Pop"** to restore them

### 5. Rebase

**Organize commits before pushing:**

1. Click **...** menu
2. Select **"Rebase"**
3. Choose base branch
4. Done!

---

## Troubleshooting

### Problem: Source Control panel is empty

**Solution:** You haven't initialized Git yet
1. Click "Initialize Repository"
2. If still empty, run in Terminal:
   ```bash
   cd /Users/yagmurbesher/Documents/sources/OBC-IFCViewer
   git init
   ```

### Problem: "No changes show in Source Control"

**Possible causes:**

1. **You haven't edited any files** ✅ That's normal!
2. **Files match `.gitignore`** - They won't show
3. **VS Code needs restart** - Close and reopen VS Code

**Solution:** Edit any file and save it. It should appear in Source Control.

### Problem: "Git: command not found" error

**Solution:** Git is not installed
1. See `GITHUB_SETUP_GUIDE.md` for installation steps
2. Restart VS Code after installing

### Problem: Can't push to GitHub (authentication error)

**Solution Option 1: Use Personal Access Token**

1. On GitHub: Settings → Developer Settings → Personal Access Tokens
2. Generate new token with `repo` permissions
3. Copy the token
4. In VS Code, when prompted for password: paste the token

**Solution Option 2: Set up SSH**

1. In Terminal:
   ```bash
   ssh-keygen -t ed25519 -C "your-email@example.com"
   ```
2. Add public key to GitHub: Settings → SSH Keys
3. Use SSH URL instead: `git@github.com:USERNAME/OBC-IFCViewer.git`

### Problem: "File conflicts" message

**This happens when multiple people edit same file:**

1. Click the conflicted file
2. VS Code shows both versions
3. Click "Accept Current Change" or "Accept Incoming Change"
4. Stage and commit the fix

### Problem: Accidentally committed sensitive data

**Solution:**

1. Click **...** → **"Revert Commit"**
2. Edit the file to remove sensitive data
3. Commit again
4. Push

---

## Keyboard Shortcuts

### Git-Related Shortcuts in VS Code

| Mac | Windows/Linux | Action |
|-----|---------------|--------|
| `Cmd + Shift + G` | `Ctrl + Shift + G` | Open Source Control |
| `Cmd + Shift + P` | `Ctrl + Shift + P` | Open Command Palette |
| `Cmd + Enter` | `Ctrl + Enter` | Commit (when in message input) |
| `Cmd + Shift + A` | `Ctrl + Shift + A` | Stage all changes |

---

## Complete Example Workflow

### Scenario: You fixed a bug and want to upload it

```
1. Make changes to src/modules/FloorPlanModule.ts
   └─ Save the file (Cmd + S)

2. Open Source Control (Ctrl + Shift + G)
   └─ You see the file listed under "Changes"

3. Click on the filename to review
   └─ You see red (old) and green (new) code

4. Click + button to stage
   └─ File moves to "Staged Changes"

5. Click in message field
   └─ Type: "Fixed: Floor plan camera rotation now smooth"

6. Click Commit button
   └─ File disappears from Changes
   └─ You see success message

7. Click ... menu → Push
   └─ Your changes upload to GitHub
   └─ You see progress indicator

8. Done! ✅
   └─ Your teammates can now see your fix on GitHub
```

---

## VS Code Extensions for Git

### Optional Enhancements

**GitLens** (Popular extension)
- Shows who changed each line and when
- Better commit history view
- Right-click files for more Git options
- Install from Extensions tab

**Git Blame** 
- See who changed each line

**Git Graph**
- Visual commit history
- See branches and merges easily

**To install:**
1. Click Extensions icon (square icon on left sidebar)
2. Search for extension name
3. Click Install

---

## Comparing Terminal vs VS Code

### Terminal Commands

```bash
git add .
git commit -m "Fixed bug"
git push
```

### VS Code GUI (Easier for beginners!)

1. Click + to stage
2. Type message
3. Click Commit
4. Click Push

**VS Code is simpler and more visual!** ✅

---

## Daily Tips

### Best Practices

✅ **Commit frequently** - After each small feature (not huge chunks)
✅ **Write good messages** - Be specific about what you changed
✅ **Pull before push** - Make sure you have latest code
✅ **Review before commit** - Check the Diff view first
✅ **Use branches** - For experimental features

### Quick Daily Routine

1. **Start day:** Pull latest changes (`...` → Pull)
2. **While coding:** Save files (Cmd + S)
3. **Before lunch:** Commit your work
4. **End of day:** Push to GitHub

---

## Next Steps

1. **Initialize this project:** Follow "Initial Setup" section
2. **Make a small change:** Edit a comment somewhere
3. **Commit through VS Code:** Follow the workflow above
4. **Push to GitHub:** Use the ... menu

That's it! You're now using professional version control! 🎉

---

## Resources

- VS Code Git Integration: https://code.visualstudio.com/docs/sourcecontrol/overview
- Git Basics: https://git-scm.com/book/en/v2/Getting-Started-Git-Basics
- GitHub Guides: https://guides.github.com

---

**Remember:** VS Code's source control panel is just a visual way to use Git. Everything you do here could also be done in Terminal, but VS Code makes it easier to see and understand!

Good luck with your project! 🚀
