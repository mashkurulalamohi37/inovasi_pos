#!/usr/bin/env sh
# Build a deployable tarball of the repo for SCP to a server (MobaXterm or otherwise).
# See docs/DEPLOYMENT.md for the full deploy process this feeds into.
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
OUTPUT="${OUTPUT:-${REPO_ROOT}/pulse-pos-deploy.tar.gz}"
INCLUDE_UPLOADS="${INCLUDE_UPLOADS:-false}"

cd "${REPO_ROOT}"

EXCLUDES="
--exclude=node_modules
--exclude=backend/venv
--exclude=.git
--exclude=.env
--exclude=backend/.env
--exclude=backend/pulse_local.db
--exclude=dist
--exclude=dist-ssr
--exclude=.output
--exclude=.tanstack
--exclude=.nitro
--exclude=.vinxi
--exclude=backups
--exclude=backups-offhost
--exclude=nginx/certs
--exclude=nginx/logs
--exclude=test-results
--exclude=playwright-report
--exclude=*.log
--exclude=pulse-pos-deploy.tar.gz
"

if [ "${INCLUDE_UPLOADS}" != "true" ]; then
  EXCLUDES="${EXCLUDES}
--exclude=uploads
--exclude=backend/uploads
"
  echo "Excluding uploads/ and backend/uploads/ (set INCLUDE_UPLOADS=true to include them)"
fi

# shellcheck disable=SC2086
tar ${EXCLUDES} -czf "${OUTPUT}" .

echo "Archive written to ${OUTPUT}"
ls -lh "${OUTPUT}"
echo
echo "Next: scp \"${OUTPUT}\" <user>@<server-ip>:/tmp/"
