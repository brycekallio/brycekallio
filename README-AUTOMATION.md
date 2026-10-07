# How the projects table stays current

`README.md`'s projects table is generated. The block between
`<!-- PROJECTS:START -->` and `<!-- PROJECTS:END -->` is overwritten on every run, so
**edit `projects.yml`, never the table**.

```
projects.yml  ──►  scripts/render-projects.mjs  ──►  README.md (marked block)
                            │
                            └─ GitHub API: last push date + public/private
```

What comes from where:

| Column | Source |
| --- | --- |
| Project, What it is, Can you use it? | `projects.yml` — you write these once |
| Last push | GitHub API, refreshed daily |
| Whether `[code]` is linked | GitHub API `private` flag, not the manifest |

Visibility is read live on purpose: a `[code]` link to a private repo 404s for every
visitor, and flipping a repo public shouldn't require remembering to edit a manifest.

## Running it

```bash
node scripts/render-projects.mjs            # render
node scripts/render-projects.mjs --check    # exit 1 if stale, for CI
GITHUB_TOKEN=$(gh auth token) node scripts/render-projects.mjs   # include private repos
```

Without a token, private repos return 404 and are treated as private — the row still
renders, just without a date or code link.

**`--check` is only meaningful with the same token as the last render.** The rendered
output differs depending on whether private repos resolved, so a tokenless `--check`
against a README rendered with a token will always say "stale". Either always pass the
token, or don't wire `--check` into a pre-commit hook.

## Adding a project

Append to `projects.yml` and push. The workflow re-renders on any change to that file.

```yaml
- name: Thing
  repo: brycekallio/thing      # or null if there's no repo
  try: https://thing.app       # or null if there's nothing to try
  sentence: >-
    One sentence, present tense, what it does for whoever reads this.
  access: open                 # open | request | personal
  order: 7
```

`access` is the "can somebody actually use this" signal:

- `open` — anyone can sign up and use it
- `request` — it runs, but you have to ask
- `personal` — built for me, not meant for anyone else

## When it runs

| Trigger | When | Setup needed |
| --- | --- | --- |
| `push` | `projects.yml` or the renderer changes | none |
| `schedule` | daily at 11:00 UTC | none |
| `workflow_dispatch` | you click Run workflow | none |
| `repository_dispatch` | a project repo pushes | one secret per repo |

The daily schedule is what makes this work with **zero changes to your other repos** —
dates go stale by at most a day. Set up the dispatch below only if you want the profile
to update within seconds of pushing a project.

### Secret for private repos

`scripts/render-projects.mjs` needs to read push dates from `arbitr`, `ctrl`, and any
other private repo. The workflow's built-in `GITHUB_TOKEN` is scoped to this repo only,
so add a PAT:

1. Create a fine-grained PAT with **Contents: Read** on the repos you want dated.
2. Add it to this repo as the secret `PROJECTS_TOKEN`.

Skip it and private rows simply render without a date.

### Optional: instant updates from a project repo

In the project repo, add `.github/workflows/notify-profile.yml`:

```yaml
name: Notify profile
on:
  push:
    branches: [main]
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -fsS -X POST \
            -H "Authorization: Bearer ${{ secrets.PROFILE_DISPATCH_TOKEN }}" \
            -H "Accept: application/vnd.github+json" \
            https://api.github.com/repos/brycekallio/brycekallio/dispatches \
            -d '{"event_type":"project-updated"}'
```

`PROFILE_DISPATCH_TOKEN` is a PAT with **Contents: Read and write** on
`brycekallio/brycekallio`. One secret per project repo.
