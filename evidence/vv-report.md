# V&V Automation Report

Generated: 2026-04-07T17:02:15

| Check | Status | Details |
|---|---|---|
| Automated tests discovery and execution | PASS | ok |
| Core API chain: start/status/stop | PASS | ok |
| Core API chain: profile and history | PASS | ok |
| Core API chain: whitelist CRUD | PASS | ok |
| Core API chain: usage ingest and today summary | PASS | ok |
| Exception path: duplicate start returns 409 | PASS | ok |
| Exception path: invalid payload returns 400 | PASS | ok |
| Exception path: delete non-existing preset returns 404 | PASS | ok |
| Performance: three API endpoints | PASS | ok |
| Performance: timer drift | PASS | ok |
| Performance: backend CPU and memory | PASS | ok |
| Extended: missing profile file fallback | PASS | ok |
| Extended: corrupted whitelist file fallback | PASS | ok |
| Extended: violation to failed full path | PASS | ok |
| Extended: usage boundaries (empty and duplicates) | PASS | ok |
| Frontend unit tests (Vitest) | PASS | ok |
| Frontend E2E smoke tests (Playwright) | PASS | ok |
| Performance: UI update latency | PASS | ok |

Artifacts:
- C:\Users\zhech\Documents\GitHub\Capstone\evidence\backend-tests.log
- C:\Users\zhech\Documents\GitHub\Capstone\evidence\manual-api
- C:\Users\zhech\Documents\GitHub\Capstone\evidence\perf\perf-metrics.csv
- C:\Users\zhech\Documents\GitHub\Capstone\evidence\perf\perf-summary.md
- C:\Users\zhech\Documents\GitHub\Capstone\evidence\perf\ui-latency.json
- C:\Users\zhech\Documents\GitHub\Capstone\evidence\perf\timer-drift.json
- C:\Users\zhech\Documents\GitHub\Capstone\evidence\perf\resource-usage.json
- C:\Users\zhech\Documents\GitHub\Capstone\evidence\backend-runtime.log
- C:\Users\zhech\Documents\GitHub\Capstone\evidence\backend-runtime.err.log
