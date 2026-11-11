#!/bin/bash
# PULSE Signals robot - one-shot installer for Ubuntu (runs next to other services, touches nothing else)
set -e
P=/opt/pulse
U=https://raw.githubusercontent.com/omylatomasz-bit/ballistic/pulse-data/server
echo ">>> PULSE install"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq python3-venv python3-pip curl ca-certificates tzdata >/dev/null
mkdir -p $P/tmp/export $P/www $P/logs $P/state
curl -fsSL "$U/bot.tar.gz?t=$(date +%s)" -o $P/tmp/bot.tar.gz
tar -xzf $P/tmp/bot.tar.gz -C $P
curl -fsSL "$U/bot.sha256?t=$(date +%s)" | cut -d' ' -f1 > $P/bot.sha256
if [ ! -f $P/state/data/journal.sqlite ]; then
  curl -fsSL "$U/state.tar.gz?t=$(date +%s)" -o $P/tmp/state.tar.gz
  tar -xzf $P/tmp/state.tar.gz -C $P/state
fi
rm -rf $P/app/data && ln -s $P/state/data $P/app/data
chmod +x $P/bin/*.sh
echo ">>> python packages"
[ -x $P/venv/bin/python ] || python3 -m venv $P/venv
$P/venv/bin/pip install -q --upgrade pip
$P/venv/bin/pip install -q "pandas>=2.2" "numpy>=1.26" "pyyaml>=6" "python-dotenv>=1" "requests>=2.31" "matplotlib>=3.8" "tzdata"
if [ ! -d $P/state/data/cache/prices ] || [ $(ls $P/state/data/cache/prices | wc -l) -lt 400 ]; then
  echo ">>> downloading 12 years of prices (2-5 min)"
  $P/venv/bin/python $P/bin/fetch.py 12y $P/tmp/hist.json.gz
  (cd $P/app && $P/venv/bin/python tools_local.py merge-daily $P/tmp/hist.json.gz)
fi
echo ">>> first export"
(cd $P/app && $P/venv/bin/python -m smartbot export --out $P/tmp/export | tail -1)
cp $P/tmp/export/*.json $P/www/
cat > /etc/systemd/system/pulse-web.service <<U1
[Unit]
Description=PULSE data for the app (port 8880)
After=network-online.target
[Service]
ExecStart=$P/venv/bin/python $P/bin/serve.py
Restart=always
[Install]
WantedBy=multi-user.target
U1
mk() { # name, OnCalendar, script
cat > /etc/systemd/system/pulse-$1.service <<U2
[Unit]
Description=PULSE $1
[Service]
Type=oneshot
ExecStart=$3
U2
cat > /etc/systemd/system/pulse-$1.timer <<U3
[Unit]
Description=PULSE $1 timer
[Timer]
OnCalendar=$2
Persistent=true
[Install]
WantedBy=timers.target
U3
}
mk nightly "Mon..Fri *-*-* 22:45:00 Europe/Prague" "$P/bin/nightly.sh"
mk intraday "Mon..Fri *-*-* 15:45,16:45,17:45,18:45,19:45,20:45,21:45:00 Europe/Prague" "$P/bin/intraday.sh"
mk update "*-*-* *:07,22,37,52:00" "$P/bin/update.sh"
systemctl daemon-reload
systemctl enable --now pulse-web.service pulse-nightly.timer pulse-intraday.timer pulse-update.timer >/dev/null
if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then ufw allow 8880/tcp >/dev/null; fi
sleep 2
if curl -fs http://127.0.0.1:8880/signals.json >/dev/null; then echo ">>> PULSE OK - hotovo"; else echo ">>> PULSE web FAILED"; fi
systemctl list-timers 'pulse-*' --no-pager | head -6
