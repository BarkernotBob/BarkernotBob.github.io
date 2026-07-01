# Raycast: Code Search commands

Two Raycast script commands for searching code from Raycast's search bar.

| Command | What it does | Speed / limits |
| --- | --- | --- |
| **Search Local Code** (`search-local-code.sh`) | Searches the file contents of repos you've cloned to your Mac, using `ripgrep`. | Fastest, offline, no rate limits. |
| **Search GitHub Code** (`search-github-code.sh`) | Searches code across all your GitHub repos (including ones not cloned locally) via `gh search code`. | Needs internet + `gh` sign-in; GitHub rate-limits searches. |

## One-time setup

### 1. Install the tools these commands need

Open the Terminal app and paste these (press Return after each):

```
brew install ripgrep   # for Search Local Code
brew install gh        # for Search GitHub Code
gh auth login          # sign in to GitHub (only needed for the GitHub command)
```

If you don't have `brew`, install it first from https://brew.sh.

### 2. Point Raycast at this folder

1. Open Raycast, type **Script Commands**, and pick **Add Script Directory** (or open Raycast Settings → Extensions → Script Commands → the **+** at the bottom).
2. Choose this `raycast` folder.

That's it — the two commands now show up when you type their names in Raycast.

## Using them

- Type **Search Local Code**, press Return, type your search term. Optional second box: a file filter like `*.ts` or `*.md`.
- Type **Search GitHub Code**, press Return, type your search term. Optional second box: a different GitHub owner to search.

## Changing the defaults

Both scripts have a short **Configuration** section near the top you can edit:

- **Search Local Code** looks for your repos folder automatically (`~/code`, `~/Code`, `~/GitHub`, `~/Developer`, `~/dev`, `~/repos`). To force a specific folder, either edit `REPOS_DIR` in the script or set an environment variable `RAYCAST_REPOS_DIR` on the command in Raycast (open the command in Script Commands and add it there).
- **Search GitHub Code** defaults to the `BarkernotBob` owner. Change `DEFAULT_OWNER` in the script, set `RAYCAST_GH_OWNER`, or just type an owner in the second box.
