#!/bin/zsh
# serve.sh <pack> [effort] [extra mtplx flags…]: one Inkling pack on MTPLX at 127.0.0.1:8000 (OLA-440).
# Run on the Studio as admin. <pack> is Bare-Speed, Optimized-Speed or Optimized-Quality.
# Stops an MTPLX server this script started before; never touches Ola's model job.
export PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin
t=~/mtplx-test; mkdir -p $t; cd $t
pack=${1:?pack}; effort=${2:-medium}; shift; shift 2>/dev/null
[ -s $t/api-key ] || { umask 077; openssl rand -hex 24 > $t/api-key; }
# stop the server this script started: ask it, then end whatever of ours still listens, and wait for the port
mtplx stop --port 8000 --api-key-file $t/api-key >/dev/null 2>&1
for i in $(seq 1 20); do
  pid=$(lsof -nP -tiTCP:8000 -sTCP:LISTEN 2>/dev/null | head -1); [ -z "$pid" ] && break
  [ $i -gt 3 ] && kill $pid 2>/dev/null; sleep 2
done
[ -n "$(lsof -nP -tiTCP:8000 -sTCP:LISTEN 2>/dev/null)" ] && { echo "port 8000 still taken"; exit 1; }
(nohup mtplx serve --model Youssofal/Inkling-2-Mini-MTPLX-$pack --host 127.0.0.1 --port 8000 \
  --api-key-file $t/api-key --reasoning-effort $effort --no-stats-footer --yes "$@" \
  > $t/serve-$pack.log 2>&1 < /dev/null &)
for i in $(seq 1 90); do
  curl -fsS -m 3 -H "Authorization: Bearer $(cat $t/api-key)" http://127.0.0.1:8000/v1/models >/dev/null 2>&1 && { echo "up after $((i*4)) s"; exit 0; }
  sleep 4
done
echo NOT UP; tail -20 $t/serve-$pack.log | grep -v -i "api key"; exit 1
