#!/bin/zsh
# Analyse several form clips one at a time (keeps CPU sensible), then merge the metrics.
# Usage: ./run_all.sh <clip>:<view> [<clip>:<view> ...] [--render] [--stills]
#   views: side-right, side-left, back, front
#   e.g.   ./run_all.sh ~/clips/back.mov:back ~/clips/side.mov:side-right --render
# The direction of travel is auto-detected from the feet; metrics.json records whether it matched the label.
set -e
cd "$(dirname "$0")"
mkdir -p tmp
specs=() flags=()
for a in "$@"; do [[ "$a" == --* ]] && flags+=("$a") || specs+=("$a"); done
for spec in "${specs[@]}"; do
  clip=${spec%:*}; view=${spec##*:}; name=${clip:t:r}
  nice -n 10 .venv/bin/python analyse.py "$clip" --view "$view" "${flags[@]}" > "tmp/$name.log" 2>&1
  echo "done $name ($view)"
done
.venv/bin/python merge_metrics.py
