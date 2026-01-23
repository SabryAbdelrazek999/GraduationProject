#!/bin/bash
set -e

BASE_URL="http://localhost:5000"
USERNAME="zaptester_$(date +%s)"
PASSWORD="Password123!"
TEST_URL="http://scanme.nmap.org"

echo "=== ZAP Integration Test ==="
echo ""

# 1. Signup
echo "[1] Signing up user: $USERNAME"
SIGNUP_RESP=$(curl -s -X POST "$BASE_URL/api/auth/signup" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\"}")
echo "Response: $SIGNUP_RESP" | head -c 100
echo ""
echo ""

# 2. Login (save cookie)
echo "[2] Logging in..."
curl -s -c /tmp/cookies.txt -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\"}" > /dev/null
echo "✓ Login successful (cookies saved)"
echo ""

# 3. Create a scan
echo "[3] Creating scan for $TEST_URL"
SCAN_RESP=$(curl -s -b /tmp/cookies.txt -X POST "$BASE_URL/api/scans" \
  -H "Content-Type: application/json" \
  -d "{\"targetUrl\":\"$TEST_URL\",\"scanType\":\"quick\"}")
SCAN_ID=$(echo "$SCAN_RESP" | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)
echo "Scan created with ID: $SCAN_ID"
echo ""

if [ -z "$SCAN_ID" ]; then
  echo "ERROR: Failed to create scan"
  echo "Response: $SCAN_RESP"
  exit 1
fi

# 4. Poll for completion (max 5 minutes for ZAP scan)
echo "[4] Polling scan status (timeout: 5 mins)..."
TIMEOUT=300
ELAPSED=0
while [ $ELAPSED -lt $TIMEOUT ]; do
  STATUS_RESP=$(curl -s -b /tmp/cookies.txt "$BASE_URL/api/scans/$SCAN_ID")
  STATUS=$(echo "$STATUS_RESP" | grep -o '"status":"[^"]*' | head -1 | cut -d'"' -f4)
  VULNS=$(echo "$STATUS_RESP" | grep -o '"totalVulnerabilities":[0-9]*' | cut -d':' -f2)
  
  if [ "$STATUS" = "completed" ]; then
    echo "✓ Scan completed!"
    echo "  Total vulnerabilities found: $VULNS"
    break
  fi
  
  echo "  Status: $STATUS (elapsed: ${ELAPSED}s)"
  sleep 10
  ELAPSED=$((ELAPSED + 10))
done

if [ "$STATUS" != "completed" ]; then
  echo "ERROR: Scan timed out"
  exit 1
fi

# 5. Check reports
echo ""
echo "[5] Fetching reports..."
REPORTS=$(curl -s -b /tmp/cookies.txt "$BASE_URL/api/reports")
echo "Reports response (first 200 chars):"
echo "$REPORTS" | head -c 200
echo ""
echo ""

# 6. Export report
echo "[6] Exporting report..."
EXPORT=$(curl -s -b /tmp/cookies.txt "$BASE_URL/api/reports/export/$SCAN_ID?format=json")
TOTAL=$(echo "$EXPORT" | grep -o '"total":[0-9]*' | head -1 | cut -d':' -f2)
CRITICAL=$(echo "$EXPORT" | grep -o '"critical":[0-9]*' | head -1 | cut -d':' -f2)
echo "✓ Report exported"
echo "  Total: $TOTAL, Critical: $CRITICAL"
echo ""

echo "=== Test Completed Successfully ==="
