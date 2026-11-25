#!/bin/zsh
# three-users.sh <label> <pack> <memory cap> [extra mtplx flags…]: three people at once on one model (OLA-442).
# Run on the Studio as admin. Starts one MTPLX server, then three OpenCode runs at the same moment,
# each on its own brief (the weather page, the game, the council minutes), and prints each run's time.
# Needs ~/mtplx-test/{task.txt,game-task.txt,docs-in/task.txt,docs-in/minutes.tgz}.
export PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin
t=~/mtplx-test; cd $t
label=${1:?label}; pack=${2:?pack}; cap=${3:?cap}; shift 3
for n in weather game docs; do rm -rf page-3$label-$n page-3$label-$n.log; mkdir -p page-3$label-$n/work; done
tar -C page-3$label-docs/work -xzf docs-in/minutes.tgz
./serve.sh $pack medium --memory-limit $cap "$@" || exit 1
date "+start %H:%M:%S"; s=$(date +%s)
./run-page.sh 3$label-weather $t/task.txt > page-3$label-weather.log 2>&1 &
./run-page.sh 3$label-game $t/game-task.txt > page-3$label-game.log 2>&1 &
./run-page.sh 3$label-docs $t/docs-in/task.txt > page-3$label-docs.log 2>&1 &
wait
echo "all three done after $(( $(date +%s) - s )) s"
for n in weather game docs; do
  echo "$n: $(head -1 page-3$label-$n.log), memory refusals $(cat page-3$label-$n/err-*.txt | grep -a -c 'insufficient memory'), files: $(ls page-3$label-$n/work | grep -v -e minutes -e opencode.jsonc | tr '\n' ' ')"
done
cp serve-$pack.log serve-3$label.log
