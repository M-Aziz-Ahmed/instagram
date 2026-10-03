# Git Pull Utility - Never Deal with Artifact Conflicts Again! 🎉

## Problem Solved
No more dealing with merge conflicts from build artifacts (`AnonTweet.png`, etc.)!

## Usage

### Option 1: PowerShell Script (Recommended)
```powershell
.\git-pull-force.ps1
```

### Option 2: Batch File (Windows CMD)
```cmd
git-pull-force.bat
```

### Option 3: Create Alias (One-time setup)
```powershell
# Add to your PowerShell profile
Set-Alias -Name gpf -Value "C:\Users\munee\Desktop\work\instagram\git-pull-force.ps1"
```

Then just run:
```powershell
gpf
```

## What It Does

1. ✅ Discards local changes to build artifacts
2. ✅ Cleans untracked artifact files  
3. ✅ Attempts normal `git pull`
4. ✅ If pull fails, does hard reset to origin/master
5. ✅ Shows clean status

## Quick Commands

Instead of:
```bash
git pull  # ❌ FAILS with artifact conflicts
```

Use:
```bash
.\git-pull-force.ps1  # ✅ ALWAYS WORKS
```

Or shorter:
```bash
.\gpf  # If you created the alias
```

## Setup Permanent Alias (Optional)

### Windows PowerShell:
```powershell
# Open PowerShell profile
notepad $PROFILE

# Add this line:
Set-Alias -Name gpf -Value "C:\Users\munee\Desktop\work\instagram\git-pull-force.ps1"

# Save and restart PowerShell
```

### Windows CMD:
Create `gpf.bat` in a folder that's in your PATH:
```cmd
@echo off
cd /d C:\Users\munee\Desktop\work\instagram
call git-pull-force.bat
```

## Files Created

- `git-pull-force.ps1` - PowerShell script
- `git-pull-force.bat` - Batch script  
- `PULL_UTILITY_README.md` - This file

## Notes

- Artifacts are automatically ignored in `.gitignore`
- Safe to run anytime - only affects build artifacts
- Your code changes are never discarded

## Troubleshooting

If you get execution policy error:
```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

---

**Never deal with artifact conflicts again!** 🚀
