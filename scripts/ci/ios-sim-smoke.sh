#!/usr/bin/env bash
# iOS Simulator build + launch smoke test (round 8, A12).
# Every failure fails the job: xcodebuild's exit code is kept (pipefail), the app bundle must
# exist, and the app process must still be alive after the wait. Nothing is masked with `|| true`
# except the optional log export at the end.
#   scripts/ci/ios-sim-smoke.sh build   – unsigned simulator build
#   scripts/ci/ios-sim-smoke.sh run     – boot, install, launch, screenshot, alive check
set -euo pipefail

REPORTS="${REPORTS:-reports}"
DD="${DERIVED_DATA:-build/dd}"
APP="$DD/Build/Products/Debug-iphonesimulator/App.app"
BUNDLE_ID="${BUNDLE_ID:-com.mitzvotplus.app}"
WAIT="${WAIT_SECONDS:-20}"
mkdir -p "$REPORTS"

case "${1:-}" in
  build)
    xcodebuild \
      -project ios/App/App.xcodeproj \
      -scheme App \
      -configuration Debug \
      -sdk iphonesimulator \
      -destination 'generic/platform=iOS Simulator' \
      -derivedDataPath "$DD" \
      CODE_SIGNING_ALLOWED=NO \
      build 2>&1 | tee "$REPORTS/xcodebuild.log"
    # pipefail above: a failing xcodebuild stops here with its own exit code.
    if [[ ! -d "$APP" ]]; then
      echo "::error::App.app not produced at $APP"
      exit 1
    fi
    echo "Build OK: $APP"
    ;;
  run)
    UDID="$(xcrun simctl list devices available -j \
      | jq -r '[.devices | to_entries[] | select(.key | test("iOS")) | .value[] | select(.name | test("^iPhone"))] | last | .udid')"
    if [[ -z "$UDID" || "$UDID" == "null" ]]; then
      echo "::error::No available iPhone simulator"
      exit 1
    fi
    echo "Simulator: $UDID"
    xcrun simctl boot "$UDID"
    xcrun simctl bootstatus "$UDID" -b
    xcrun simctl install "$UDID" "$APP"
    xcrun simctl launch "$UDID" "$BUNDLE_ID" | tee "$REPORTS/launch.txt"
    sleep "$WAIT"
    xcrun simctl io "$UDID" screenshot "$REPORTS/ios-sim-launch.png"
    if ! xcrun simctl spawn "$UDID" launchctl list | grep -q "$BUNDLE_ID"; then
      echo "::error::App process not running after ${WAIT}s (crashed on start?)"
      xcrun simctl spawn "$UDID" log show --last 2m --predicate 'process == "App"' --style compact \
        > "$REPORTS/sim-app-log.txt" 2>&1 || true
      exit 1
    fi
    echo "App process alive after ${WAIT}s" | tee -a "$REPORTS/launch.txt"
    xcrun simctl spawn "$UDID" log show --last 2m --predicate 'process == "App"' --style compact \
      > "$REPORTS/sim-app-log.txt" 2>&1 || true
    ;;
  *)
    echo "usage: $0 build|run" >&2
    exit 2
    ;;
esac
