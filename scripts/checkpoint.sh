#!/usr/bin/env bash
#
# Working-tree checkpoints.
#
# A checkpoint is a full snapshot of the working tree — tracked, untracked and
# the handful of git-ignored local files listed in EXTRA_PATHS — stored as a
# commit object under refs/checkpoints/. It is not a commit on any branch: the
# index is untouched, HEAD is untouched, nothing is staged, and `git log` on
# main does not change. Taking one is therefore always safe, which is the whole
# point: the safety net has to be cheaper than the thing it protects against.
#
# Why not `git stash`? A stash moves work out of the tree. This has to leave the
# tree exactly as it was — you take a checkpoint *and keep working*. Stashes are
# also a stack that anything can pop; a ref namespace is not.
#
#   ./scripts/checkpoint.sh save ["label"]   snapshot now
#   ./scripts/checkpoint.sh list             newest first
#   ./scripts/checkpoint.sh diff [ref]       what changed since it
#   ./scripts/checkpoint.sh show [ref]       files in it
#   ./scripts/checkpoint.sh restore [ref]    put the tree back (saves first)
#   ./scripts/checkpoint.sh prune [keep]     drop all but the newest `keep`
#
# `ref` is a checkpoint name (20260812-134501), `last`, or `-2` for the second
# newest. It defaults to `last`.
#
# Restore recovers *files*, not the staged/unstaged split — git's index is a
# working position, not a thing worth preserving across an undo.
#
# Checkpoints live only in this clone. `git push` does not send them (it pushes
# refs/heads); `git push --mirror` would, so do not use it.

set -euo pipefail

REF_NS="refs/checkpoints"
KEEP_DEFAULT=60
ZERO="0000000000000000000000000000000000000000"

cd "$(git rev-parse --show-toplevel)"

die() { printf '✘ %s\n' "$*" >&2; exit 1; }

# Files git ignores but a snapshot must still contain. .gitignore exists to keep
# things out of the *published* history; it is not a statement that the file is
# disposable, and CLAUDE.md is exactly the file an agent is asked to edit.
#
# `docs/internal` is named as a directory rather than as the six files it used
# to list. That list had already gone stale once — it still said `docs/agents`
# after the journals moved, so a checkpoint quietly stopped capturing them —
# and a directory cannot go stale when a seventh file is added.
extra_paths() {
  cat <<'EOF'
CLAUDE.md
AGENTS.md
GEMINI.md
docs/internal
.github/copilot-instructions.md
.github/instructions
.vscode
.claude
EOF
  local f
  f="$(git rev-parse --git-path info/checkpoint-extra)"
  [ -f "$f" ] && sed -e 's/#.*//' -e '/^[[:space:]]*$/d' "$f" || true
}

newest_ref() {
  git for-each-ref --sort=-refname --count=1 --format='%(refname)' "$REF_NS" 2>/dev/null
}

resolve() {
  local q="${1:-last}" n ref
  case "$q" in
    last|latest) ref="$(newest_ref)" ;;
    -[0-9]*)
      n="${q#-}"
      ref="$(git for-each-ref --sort=-refname --count="$n" --format='%(refname)' "$REF_NS" | tail -1)"
      ;;
    refs/*) ref="$q" ;;
    *) ref="$REF_NS/$q" ;;
  esac
  [ -n "$ref" ] || die "no checkpoints yet — run: ./scripts/checkpoint.sh save"
  git rev-parse -q --verify "$ref^{commit}" >/dev/null || die "no such checkpoint: $q"
  printf '%s\n' "$ref"
}

save() {
  local label="${1:-manual}" tmp tree parent last name commit i

  # A copy of the real index seeds the temp one purely for its stat cache — the
  # snapshot is built by `git add -A` on top, so the result does not depend on
  # what happened to be staged. Without the copy every save re-hashes every PNG.
  tmp="$(mktemp "${TMPDIR:-/tmp}/pricetab-ckpt.XXXXXX")"
  trap 'rm -f "$tmp"' RETURN
  cp "$(git rev-parse --git-path index)" "$tmp" 2>/dev/null || :

  tree="$(
    export GIT_INDEX_FILE="$tmp"
    git add -A
    while IFS= read -r p; do
      [ -e "$p" ] && git add -f -- "$p" || true
    done < <(extra_paths)
    git write-tree
  )"

  last="$(newest_ref)"
  if [ -n "$last" ] && [ "$(git rev-parse "$last^{tree}")" = "$tree" ]; then
    printf '· identical to %s — no new checkpoint\n' "${last#$REF_NS/}"
    return 0
  fi

  parent="$(git rev-parse -q --verify HEAD || true)"
  if [ -n "$parent" ]; then
    commit="$(git commit-tree "$tree" -p "$parent" -m "checkpoint: $label")"
  else
    commit="$(git commit-tree "$tree" -m "checkpoint: $label")"
  fi

  name="$(date +%Y%m%d-%H%M%S)"; i=2
  while git rev-parse -q --verify "$REF_NS/$name" >/dev/null; do name="$(date +%Y%m%d-%H%M%S)-$i"; i=$((i + 1)); done
  git update-ref "$REF_NS/$name" "$commit"

  printf '✔ checkpoint %s  (%s)\n' "$name" "$label"
  printf '  %s\n' "$(git diff --shortstat HEAD "$commit" | sed 's/^ *//' || true)"
}

list() {
  local n=0
  while IFS='|' read -r ref subj when; do
    n=$((n + 1))
    printf '%-18s %-14s %s\n' "${ref#$REF_NS/}" "$when" "${subj#checkpoint: }"
  done < <(git for-each-ref --sort=-refname \
    --format='%(refname)|%(contents:subject)|%(committerdate:relative)' "$REF_NS")
  [ "$n" -gt 0 ] || echo "(no checkpoints yet)"
}

restore() {
  local target keep_extra=0 arg="" p
  for a in "$@"; do
    case "$a" in
      --keep-extra) keep_extra=1 ;;
      *) arg="$a" ;;
    esac
  done
  target="$(resolve "$arg")"

  # Restoring is itself an edit, so it gets a checkpoint of its own. Undoing an
  # undo is the case you need most and plan for least.
  save "pre-restore (before ${target#$REF_NS/})"

  git restore --source="$target" --worktree -- .

  if [ "$keep_extra" -eq 0 ]; then
    local inckpt now
    inckpt="$(mktemp)"; now="$(mktemp)"
    trap 'rm -f "$inckpt" "$now"' RETURN
    git ls-tree -r --name-only -z "$target" | tr '\0' '\n' | LC_ALL=C sort > "$inckpt"
    {
      git ls-files -z --cached
      git ls-files -z --others --exclude-standard
    } | tr '\0' '\n' > "$now"
    while IFS= read -r p; do [ -f "$p" ] && printf '%s\n' "$p"; done < <(extra_paths) >> "$now"
    LC_ALL=C sort -u -o "$now" "$now"

    while IFS= read -r p; do
      [ -e "$p" ] || continue
      rm -f -- "$p"
      printf '  removed %s\n' "$p"
    done < <(LC_ALL=C comm -13 "$inckpt" "$now")
  fi

  printf '✔ tree restored to %s\n' "${target#$REF_NS/}"
  printf '  index untouched — check `git status` before committing.\n'
}

prune() {
  local keep="${1:-$KEEP_DEFAULT}" i=0 ref
  while IFS= read -r ref; do
    i=$((i + 1))
    [ "$i" -gt "$keep" ] || continue
    git update-ref -d "$ref"
    printf '  dropped %s\n' "${ref#$REF_NS/}"
  done < <(git for-each-ref --sort=-refname --format='%(refname)' "$REF_NS")
  printf '✔ kept the newest %s\n' "$keep"
}

cmd="${1:-help}"; shift || true
case "$cmd" in
  save)    save "${1:-manual}" ;;
  list|ls) list ;;
  diff)    git --no-pager diff --stat "$(resolve "${1:-last}")" ;;
  show)    git --no-pager show --stat --oneline "$(resolve "${1:-last}")" ;;
  restore) restore "$@" ;;
  prune)   prune "$@" ;;
  *)       sed -n '3,30p' "$0" | sed 's/^# \{0,1\}//' ;;
esac
