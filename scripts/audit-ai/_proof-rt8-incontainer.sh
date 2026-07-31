#!/usr/bin/env bash
# In-container proof for REPORT-TRUTH #8. Railway's variable API showing a value is NOT proof the RUNNING container
# has it — a var set with --skip-deploys reaches the API immediately and the container only at next start. Three
# things must agree, read from inside the container:
#   1. the deployed commit == main HEAD
#   2. the seam is present in the deployed bundle (not just in the repo)
#   3. the flag is 'true' in the process environment the worker actually reads
set -uo pipefail
MAIN_SHA="$(git rev-parse HEAD | cut -c1-8)"
echo "local main HEAD: ${MAIN_SHA}"
railway ssh --service audit-worker -- sh -lc '
  echo "in-container sha : $(cat .git/HEAD 2>/dev/null | cut -c1-8 || echo "${RAILWAY_GIT_COMMIT_SHA:-unknown}" | cut -c1-8)"
  echo "seam in bundle   : $(grep -c AUDIT_FORCE_GROUNDING src/lib/audit-executor-v3.ts 2>/dev/null || echo 0) occurrence(s)"
  echo "module present   : $(test -f src/lib/audit-force-grounding.ts && echo yes || echo NO)"
  echo "flag is_true     : $([ "${AUDIT_FORCE_GROUNDING:-}" = "true" ] && echo 1 || echo 0)"
  echo "absence is_true  : $([ "${AUDIT_ABSENCE_RECONCILE:-}" = "true" ] && echo 1 || echo 0)"
'
