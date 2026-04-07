# Growin V&V Runbook (Version 0)

## 1) Scope
This runbook verifies implemented P0 functionality only:
- Focus lifecycle: start/status/stop
- Local persistence for profile, whitelist presets, and session history (JSON)
- Website usage ingestion and daily aggregation (SQLite/EF Core)

Out of scope for executed V0 verification:
- P1-P4 features (gacha/pet/music, achievements, dashboards, social features)

## 2) Environment
- OS: Windows 10/11
- .NET SDK: 8.x
- Backend base URL: `http://127.0.0.1:5124`
- Tools: xUnit, FluentAssertions, WebApplicationFactory, Swagger UI, VS Code REST Client

## 2.1 One-command execution
Run the full V&V pipeline (backend tests, API checks, frontend tests, and performance checks):
```powershell
powershell -ExecutionPolicy Bypass -File "scripts/vv/Run-VV.ps1"
```

## 3) Automated Backend Tests

### 3.1 Test discovery
```powershell
dotnet test <TEST_SOLUTION_OR_PROJECT> --list-tests
```

### 3.2 Test execution
```powershell
dotnet test <TEST_SOLUTION_OR_PROJECT> --logger "console;verbosity=detailed" | Tee-Object -FilePath evidence/backend-tests.log
```

### 3.3 Pass criteria
- All P0-relevant backend tests pass
- No failing tests in required coverage areas
- Test log includes discovered tests and final summary

## 4) Manual API Acceptance (Swagger / REST Client)

Start backend:
```powershell
cd src
dotnet run
```

Use `src/focus-api.rest` to execute core requests and collect evidence.

Required request sequence:
1. `POST /api/focus/start`
2. `GET /api/focus/status` (call multiple times to verify countdown)
3. `POST /api/focus/stop`
4. `GET /api/profile`
5. `GET /api/focus/history`
6. `GET /api/whitelistpresets`
7. `POST /api/whitelistpresets`
8. `DELETE /api/whitelistpresets/{id}`
9. `POST /api/usage` + `GET /api/usage/today` (if implemented)

Evidence naming examples:
- `evidence/manual-api/01-focus-start.png`
- `evidence/manual-api/02-focus-status-1.png`
- `evidence/manual-api/03-focus-stop.png`
- `evidence/manual-api/04-profile.png`

## 5) Performance Measurement

Targets:
- `GET /api/focus/status`: p95 <= 50 ms
- `GET /api/focus/history`: p95 <= 100 ms
- `GET /api/usage/today`: p95 <= 150 ms

Method:
- For each endpoint, run 200 localhost requests
- Record p50 and p95 latency in `evidence/perf/perf-metrics.csv`

Additional automated performance checks:
- UI update latency target: p95 <= 200 ms (artifact: `evidence/perf/ui-latency.json`)
- Timer drift target: max absolute drift <= 2 seconds (artifact: `evidence/perf/timer-drift.json`)
- Backend resource targets during active polling:
  - average CPU < 5%
  - peak CPU < 20%
  - peak memory <= 300 MB
  (artifact: `evidence/perf/resource-usage.json`)

PowerShell example:
```powershell
$endpoint = "http://localhost:5024/api/focus/status"
$times = 1..200 | ForEach-Object {
  (Measure-Command { Invoke-RestMethod $endpoint -Method Get | Out-Null }).TotalMilliseconds
}
$sorted = $times | Sort-Object
$p50 = $sorted[[int]($sorted.Count * 0.5)]
$p95 = $sorted[[int]($sorted.Count * 0.95)]
"endpoint=$endpoint,p50_ms=$p50,p95_ms=$p95,count=200"
```

## 6) Pass/Fail Rule for Version 0
Version 0 is considered verified when all conditions are met:
1. Automated backend tests pass
2. Manual API acceptance passes for implemented P0 endpoints
3. Performance targets are met, or measured values are reported with mitigation actions

If a target is missed, report:
- Observed issue
- Suspected root cause
- Mitigation plan
- Expected completion date

## 7) Submission Checklist
- `evidence/backend-tests.log`
- `evidence/manual-api/*` screenshots or response exports
- `evidence/perf/perf-metrics.csv`
- `evidence/perf/perf-summary.md`
- `evidence/perf/ui-latency.json`
- `evidence/perf/timer-drift.json`
- `evidence/perf/resource-usage.json`
- `evidence/trace/*` for Playwright artifacts
