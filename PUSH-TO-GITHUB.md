# Push this repo to GitHub

The repo is already a git repository with one commit on `main`. Pick either path.

## Path A — GitHub CLI (easiest)

```bash
brew install gh          # if you don't have it
gh auth login            # sign in once, in a browser
cd ~/Desktop/ironmap
gh repo create ironmap --private --source=. --remote=origin --push
```

That creates the repo **and** pushes in one step. Drop `--private` (use `--public`) if
you want it public.

## Path B — manual

1. Create an **empty** repo on github.com named `ironmap` (no README, no .gitignore —
   this repo already has them).
2. Then:

```bash
cd ~/Desktop/ironmap
git remote add origin https://github.com/<YOUR-USERNAME>/ironmap.git
git push -u origin main
```

## After it's up

- CI (`.github/workflows/ci.yml`) runs `npm run verify` on every push — 28 engine
  checks + SQL validation.
- To connect Supabase, see the **Connect Supabase** section in [README.md](README.md).
