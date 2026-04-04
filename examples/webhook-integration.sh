#!/usr/bin/env bash
# webhook-integration.sh — Example: send events to SERVICE via webhook
#
# Usage:
#   1. Start SERVICE:  service start
#   2. Create a webhook integration:
#      service integration add webhook --name deploy-webhook
#   3. Note the integration ID from the output
#   4. Send events:
#      ./webhook-integration.sh <integration-id> "Deploy Complete" "v2.1.0 deployed"

set -euo pipefail

INTEGRATION_ID="${1:?Usage: $0 <integration-id> <title> [body]}"
TITLE="${2:?Usage: $0 <integration-id> <title> [body]}"
BODY="${3:-}"
ADMIN_URL="${SERVICE_ADMIN_URL:-http://localhost:3334}"

curl -s -X POST "${ADMIN_URL}/webhooks/${INTEGRATION_ID}" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg title "$TITLE" --arg body "$BODY" '{title: $title, body: $body}')" \
  | jq .

echo "✓ Webhook event sent to SERVICE"
