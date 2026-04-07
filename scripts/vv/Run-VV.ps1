param(
    [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")),
    [string]$BackendProject = "src/CapstoneBackend.csproj",
    [string]$BaseUrl = "http://127.0.0.1:5124",
    [int]$PerfCount = 200,
    [switch]$RunExtended = $true,
    [switch]$UseIsolatedAppData = $true,
    [switch]$AllowNoBackendTests
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRootPath = [string](Resolve-Path $RepoRoot)
$evidenceRoot = Join-Path $repoRootPath "evidence"
$manualApiDir = Join-Path $evidenceRoot "manual-api"
$perfDir = Join-Path $evidenceRoot "perf"
$tmpDir = Join-Path $repoRootPath ".tmp"
$runtimeLog = Join-Path $evidenceRoot "backend-runtime.log"
$runtimeErr = Join-Path $evidenceRoot "backend-runtime.err.log"
$testsLog = Join-Path $evidenceRoot "backend-tests.log"
$reportJson = Join-Path $evidenceRoot "vv-report.json"
$reportMd = Join-Path $evidenceRoot "vv-report.md"
$perfCsv = Join-Path $perfDir "perf-metrics.csv"
$perfSummary = Join-Path $perfDir "perf-summary.md"
$uiLatencyJson = Join-Path $perfDir "ui-latency.json"
$timerDriftJson = Join-Path $perfDir "timer-drift.json"
$resourceUsageJson = Join-Path $perfDir "resource-usage.json"
$uiDir = Join-Path $repoRootPath "ui"

New-Item -ItemType Directory -Force -Path $evidenceRoot | Out-Null
New-Item -ItemType Directory -Force -Path $manualApiDir | Out-Null
New-Item -ItemType Directory -Force -Path $perfDir | Out-Null
New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null

$checks = New-Object System.Collections.Generic.List[object]
$hadFailure = $false
$backendProc = $null
$oldAppData = $env:APPDATA
$uiDepsReady = $false

function Add-Check {
    param(
        [string]$Name,
        [string]$Status,
        [string]$Details
    )

    $checks.Add([pscustomobject]@{
        name = $Name
        status = $Status
        details = $Details
        time = (Get-Date).ToString("s")
    }) | Out-Null

    $prefix = if ($Status -eq "PASS") { "[PASS]" } elseif ($Status -eq "SKIP") { "[SKIP]" } else { "[FAIL]" }
    Write-Host "$prefix $Name - $Details"
}

function Assert-True {
    param(
        [bool]$Condition,
        [string]$Message
    )

    if (-not $Condition) {
        throw $Message
    }
}

function Save-JsonArtifact {
    param(
        [string]$Path,
        $Object
    )

    $json = $Object | ConvertTo-Json -Depth 20
    Set-Content -Path $Path -Value $json -Encoding UTF8
}

function Get-ErrorResponseBody {
    param($Exception)

    if ($null -eq $Exception -or $null -eq $Exception.Response) {
        return ""
    }

    try {
        $reader = New-Object System.IO.StreamReader($Exception.Response.GetResponseStream())
        $body = $reader.ReadToEnd()
        $reader.Close()
        return $body
    }
    catch {
        return ""
    }
}

function Invoke-Api {
    param(
        [string]$Method,
        [string]$Path,
        $Body = $null,
        [switch]$BodyAsArray,
        [int]$TimeoutSec = 30
    )

    $uri = "$BaseUrl$Path"
    $content = ""
    $statusCode = 0

    try {
        if ($null -ne $Body) {
            if ($BodyAsArray) {
                $raw = $Body | ConvertTo-Json -Depth 20
                $trimmedRaw = $raw.Trim()
                if ($trimmedRaw.StartsWith("[")) {
                    $requestBody = $raw
                }
                else {
                    $requestBody = "[" + $raw + "]"
                }
            }
            else {
                $requestBody = $Body | ConvertTo-Json -Depth 20
            }
            $response = Invoke-WebRequest -Uri $uri -Method $Method -Body $requestBody -ContentType "application/json" -UseBasicParsing -TimeoutSec $TimeoutSec
        }
        else {
            $response = Invoke-WebRequest -Uri $uri -Method $Method -UseBasicParsing -TimeoutSec $TimeoutSec
        }

        $statusCode = [int]$response.StatusCode
        $content = [string]$response.Content
    }
    catch {
        $content = Get-ErrorResponseBody $_.Exception
        if ($null -ne $_.Exception.Response) {
            $statusCode = [int]$_.Exception.Response.StatusCode
        }
        else {
            throw
        }
    }

    $json = $null
    $trimmed = $content.Trim()
    if ($trimmed.StartsWith("{") -or $trimmed.StartsWith("[")) {
        try {
            $json = $content | ConvertFrom-Json
        }
        catch {
            $json = $null
        }
    }

    return [pscustomobject]@{
        Uri = $uri
        StatusCode = $statusCode
        Content = $content
        Json = $json
    }
}

function Wait-BackendReady {
    param(
        [System.Diagnostics.Process]$Process,
        [int]$MaxSeconds = 60
    )

    $deadline = (Get-Date).AddSeconds($MaxSeconds)
    while ((Get-Date) -lt $deadline) {
        if ($null -ne $Process -and $Process.HasExited) {
            throw "Backend process exited before readiness check passed. Inspect $runtimeErr"
        }

        try {
            $ping = Invoke-Api -Method "GET" -Path "/api/profile" -TimeoutSec 5
            if ($ping.StatusCode -eq 200) {
                return
            }
        }
        catch {
        }

        Start-Sleep -Milliseconds 500
    }

    throw "Backend did not become ready within $MaxSeconds seconds."
}

function Run-Check {
    param(
        [string]$Name,
        [scriptblock]$Action
    )

    try {
        & $Action
        Add-Check -Name $Name -Status "PASS" -Details "ok"
    }
    catch [System.OperationCanceledException] {
        Add-Check -Name $Name -Status "SKIP" -Details $_.Exception.Message
    }
    catch {
        $script:hadFailure = $true
        Add-Check -Name $Name -Status "FAIL" -Details $_.Exception.Message
    }
}

function Percentile {
    param(
        [double[]]$Values,
        [double]$P
    )

    Assert-True ($Values.Count -gt 0) "Cannot compute percentile on empty data."
    $sorted = $Values | Sort-Object
    $index = [int][Math]::Floor(($sorted.Count - 1) * $P)
    return [Math]::Round($sorted[$index], 3)
}

function Measure-Endpoint {
    param(
        [string]$Path,
        [int]$Count
    )

    $latencies = New-Object System.Collections.Generic.List[double]

    for ($i = 0; $i -lt $Count; $i++) {
        $sw = [System.Diagnostics.Stopwatch]::StartNew()
        $resp = Invoke-Api -Method "GET" -Path $Path -TimeoutSec 20
        $sw.Stop()

        if ($resp.StatusCode -ne 200) {
            throw "$Path returned HTTP $($resp.StatusCode) during perf run."
        }

        $latencies.Add($sw.Elapsed.TotalMilliseconds) | Out-Null
    }

    return [pscustomobject]@{
        Path = $Path
        Count = $Count
        P50 = Percentile -Values $latencies.ToArray() -P 0.50
        P95 = Percentile -Values $latencies.ToArray() -P 0.95
    }
}

function Ensure-UiTestDependencies {
    if ($script:uiDepsReady) {
        return
    }

    Assert-True (Test-Path $uiDir) "UI directory not found: $uiDir"

    Push-Location $uiDir
    try {
        if (-not (Test-Path (Join-Path $uiDir "node_modules"))) {
            & npm install
            if ($LASTEXITCODE -ne 0) {
                throw "npm install failed in ui directory."
            }
        }

        & npx playwright install chromium
        if ($LASTEXITCODE -ne 0) {
            throw "Playwright browser install failed."
        }
    }
    finally {
        Pop-Location
    }

    $script:uiDepsReady = $true
}

function Get-BackendWorkerProcess {
    param([System.Diagnostics.Process]$ParentProcess)

    if ($null -eq $ParentProcess) {
        return $null
    }

    try {
        $children = @(Get-CimInstance Win32_Process -Filter ("ParentProcessId=" + $ParentProcess.Id))
        foreach ($child in $children) {
            if ($child.Name -like "dotnet*") {
                return Get-Process -Id $child.ProcessId -ErrorAction SilentlyContinue
            }
        }

        $backendHint = [IO.Path]::GetFileNameWithoutExtension($BackendProject)
        $dotnets = @(Get-CimInstance Win32_Process -Filter "Name='dotnet.exe'")
        foreach ($proc in $dotnets) {
            $cmd = [string]($proc.CommandLine)
            if ($cmd -like "*$backendHint*" -or $cmd -like "*CapstoneBackend*") {
                return Get-Process -Id $proc.ProcessId -ErrorAction SilentlyContinue
            }
        }
    }
    catch {
    }

    return Get-Process -Id $ParentProcess.Id -ErrorAction SilentlyContinue
}

function Stop-StaleBackendProcesses {
    $killed = @()
    try {
        $candidates = @(Get-CimInstance Win32_Process |
            Where-Object {
                $_.Name -ieq "CapstoneBackend.exe" -or
                ($_.Name -ieq "dotnet.exe" -and [string]$_.CommandLine -like "*CapstoneBackend*")
            })

        foreach ($proc in $candidates) {
            if ($backendProc -and $proc.ProcessId -eq $backendProc.Id) {
                continue
            }

            try {
                Stop-Process -Id $proc.ProcessId -Force -ErrorAction Stop
                $killed += $proc.ProcessId
            }
            catch {
            }
        }
    }
    catch {
    }

    return $killed
}

function Measure-TimerDrift {
    param(
        [int]$DurationSeconds = 40,
        [int]$SampleSeconds = 20
    )

    $body = @{
        durationSeconds = $DurationSeconds
        allowedProcesses = @("powershell.exe", "Code.exe", "chrome.exe")
        allowedWebsites = @()
        graceSeconds = 30
    }

    $start = Invoke-Api -Method "POST" -Path "/api/focus/start" -Body $body
    Assert-True ($start.StatusCode -eq 200) "Timer drift run failed to start focus session."

    $samples = @()
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        for ($i = 0; $i -lt $SampleSeconds; $i++) {
            Start-Sleep -Seconds 1
            $status = Invoke-Api -Method "GET" -Path "/api/focus/status"
            Assert-True ($status.StatusCode -eq 200) "Status failed during timer drift measurement."

            $elapsed = [Math]::Floor($sw.Elapsed.TotalSeconds)
            $expectedRemaining = [Math]::Max(0, $DurationSeconds - $elapsed)
            $reportedRemaining = [int]$status.Json.remainingSeconds
            $drift = $reportedRemaining - $expectedRemaining

            $samples += [pscustomobject]@{
                t = $elapsed
                expectedRemainingSeconds = $expectedRemaining
                reportedRemainingSeconds = $reportedRemaining
                driftSeconds = $drift
            }
        }
    }
    finally {
        Invoke-Api -Method "POST" -Path "/api/focus/stop" | Out-Null
    }

    $absDrifts = $samples | ForEach-Object { [Math]::Abs([int]$_.driftSeconds) }
    $maxAbsDrift = ($absDrifts | Measure-Object -Maximum).Maximum
    $avgAbsDrift = [Math]::Round((($absDrifts | Measure-Object -Average).Average), 3)

    return [pscustomobject]@{
        capturedAt = (Get-Date).ToString("o")
        sampleCount = $samples.Count
        maxAbsDriftSeconds = $maxAbsDrift
        avgAbsDriftSeconds = $avgAbsDrift
        targetMaxAbsDriftSeconds = 2
        result = if ($maxAbsDrift -le 2) { "PASS" } else { "FAIL" }
        samples = $samples
    }
}

function Measure-BackendResourceUsage {
    param(
        [System.Diagnostics.Process]$ParentProcess,
        [int]$SampleSeconds = 20,
        [int]$PollIntervalMs = 500
    )

    $target = Get-BackendWorkerProcess -ParentProcess $ParentProcess
    Assert-True ($null -ne $target) "Unable to resolve backend process for resource sampling."

    $logicalCpu = [Environment]::ProcessorCount
    $samples = @()

    $prevCpu = $target.TotalProcessorTime.TotalSeconds
    $prevStamp = Get-Date

    for ($i = 0; $i -lt $SampleSeconds; $i++) {
        Start-Sleep -Seconds 1
        1..([Math]::Max(1, [int](1000 / $PollIntervalMs))) | ForEach-Object {
            Invoke-Api -Method "GET" -Path "/api/focus/status" | Out-Null
            Start-Sleep -Milliseconds $PollIntervalMs
        }

        $target.Refresh()
        $nowCpu = $target.TotalProcessorTime.TotalSeconds
        $nowStamp = Get-Date

        $cpuDelta = $nowCpu - $prevCpu
        $timeDelta = ($nowStamp - $prevStamp).TotalSeconds
        $cpuPct = if ($timeDelta -gt 0) { [Math]::Max(0, [Math]::Round(($cpuDelta / ($timeDelta * $logicalCpu)) * 100, 3)) } else { 0 }
        $memMb = [Math]::Round($target.WorkingSet64 / 1MB, 3)

        $samples += [pscustomobject]@{
            timestamp = $nowStamp.ToString("o")
            cpuPercent = $cpuPct
            memoryMb = $memMb
        }

        $prevCpu = $nowCpu
        $prevStamp = $nowStamp
    }

    $avgCpu = [Math]::Round((($samples | Measure-Object -Property cpuPercent -Average).Average), 3)
    $peakCpu = [Math]::Round((($samples | Measure-Object -Property cpuPercent -Maximum).Maximum), 3)
    $peakMem = [Math]::Round((($samples | Measure-Object -Property memoryMb -Maximum).Maximum), 3)

    return [pscustomobject]@{
        capturedAt = (Get-Date).ToString("o")
        sampleCount = $samples.Count
        avgCpuPercent = $avgCpu
        peakCpuPercent = $peakCpu
        peakMemoryMb = $peakMem
        targets = [pscustomobject]@{
            avgCpuPercent = 5
            peakCpuPercent = 20
            peakMemoryMb = 300
        }
        result = if ($avgCpu -le 5 -and $peakCpu -le 20 -and $peakMem -le 300) { "PASS" } else { "FAIL" }
        samples = $samples
    }
}

function Backup-FileState {
    param([string]$Path)

    if (-not (Test-Path $Path)) {
        return [pscustomobject]@{ exists = $false; bytes = $null }
    }

    return [pscustomobject]@{
        exists = $true
        bytes = [System.IO.File]::ReadAllBytes($Path)
    }
}

function Restore-FileState {
    param(
        [string]$Path,
        $Snapshot
    )

    if ($Snapshot.exists) {
        [System.IO.File]::WriteAllBytes($Path, $Snapshot.bytes)
    }
    else {
        if (Test-Path $Path) {
            Remove-Item -Path $Path -Force
        }
    }
}

try {
    if ($UseIsolatedAppData) {
        $isolatedAppData = Join-Path $tmpDir "vv-appdata"
        New-Item -ItemType Directory -Force -Path $isolatedAppData | Out-Null
        $env:APPDATA = $isolatedAppData
        Write-Host "Using isolated APPDATA: $isolatedAppData"
    }

    $backendProjectPath = Join-Path $repoRootPath $BackendProject
    Assert-True (Test-Path $backendProjectPath) "Backend project not found: $backendProjectPath"

    $killedBeforeTests = @(Stop-StaleBackendProcesses)
    if ($killedBeforeTests.Count -gt 0) {
        Write-Host ("Stopped stale backend processes before tests: " + ($killedBeforeTests -join ", "))
    }

    Run-Check "Automated tests discovery and execution" {
        $testProjects = @(Get-ChildItem -Path $repoRootPath -Recurse -Filter "*.csproj" |
            Where-Object { $_.Name -match "Test" -or $_.Name -match "Tests" })

        if ($testProjects.Count -eq 0) {
            if ($AllowNoBackendTests) {
                throw [System.OperationCanceledException]::new("No backend test project found.")
            }

            throw "No backend test project found. Add -AllowNoBackendTests to continue without this gate."
        }

        Set-Content -Path $testsLog -Value "" -Encoding UTF8

        foreach ($proj in $testProjects) {
            Add-Content -Path $testsLog -Value ("===== LIST TESTS: " + $proj.FullName)
            & dotnet test $proj.FullName --list-tests 2>&1 | Tee-Object -FilePath $testsLog -Append | Out-Null
            if ($LASTEXITCODE -ne 0) {
                throw "dotnet test --list-tests failed for $($proj.FullName)"
            }

            Add-Content -Path $testsLog -Value ("===== RUN TESTS: " + $proj.FullName)
            & dotnet test $proj.FullName --logger "console;verbosity=detailed" 2>&1 | Tee-Object -FilePath $testsLog -Append | Out-Null
            if ($LASTEXITCODE -ne 0) {
                throw "dotnet test execution failed for $($proj.FullName)"
            }
        }
    }

    Set-Content -Path $runtimeLog -Value "" -Encoding UTF8
    Set-Content -Path $runtimeErr -Value "" -Encoding UTF8

    $killedBeforeRun = @(Stop-StaleBackendProcesses)
    if ($killedBeforeRun.Count -gt 0) {
        Write-Host ("Stopped stale backend processes before run: " + ($killedBeforeRun -join ", "))
    }

    $runCmd = "dotnet run --project `"$backendProjectPath`" --no-launch-profile --urls $BaseUrl"
    $backendProc = Start-Process -FilePath "powershell" -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $runCmd -WorkingDirectory $repoRootPath -RedirectStandardOutput $runtimeLog -RedirectStandardError $runtimeErr -PassThru

    Wait-BackendReady -Process $backendProc -MaxSeconds 90

    Run-Check "Core API chain: start/status/stop" {
        $startBody = @{
            durationSeconds = 20
            allowedProcesses = @("powershell.exe", "Code.exe", "chrome.exe")
            allowedWebsites = @("github.com")
            graceSeconds = 10
        }

        $startResp = Invoke-Api -Method "POST" -Path "/api/focus/start" -Body $startBody
        Assert-True ($startResp.StatusCode -eq 200) "Expected 200 for /api/focus/start, got $($startResp.StatusCode)"
        Assert-True ($null -ne $startResp.Json) "Start response JSON is empty."
        Assert-True ([bool]$startResp.Json.isRunning) "Expected isRunning=true after start."

        Save-JsonArtifact -Path (Join-Path $manualApiDir "01-focus-start.json") -Object $startResp.Json

        Start-Sleep -Seconds 2
        $status1 = Invoke-Api -Method "GET" -Path "/api/focus/status"
        Assert-True ($status1.StatusCode -eq 200) "Expected 200 for first status call."
        $remaining1 = [int]$status1.Json.remainingSeconds
        Save-JsonArtifact -Path (Join-Path $manualApiDir "02-focus-status-1.json") -Object $status1.Json

        Start-Sleep -Seconds 2
        $status2 = Invoke-Api -Method "GET" -Path "/api/focus/status"
        Assert-True ($status2.StatusCode -eq 200) "Expected 200 for second status call."
        $remaining2 = [int]$status2.Json.remainingSeconds
        Assert-True ($remaining2 -lt $remaining1) "Expected countdown to decrease ($remaining1 -> $remaining2)."
        Save-JsonArtifact -Path (Join-Path $manualApiDir "03-focus-status-2.json") -Object $status2.Json

        $stopResp = Invoke-Api -Method "POST" -Path "/api/focus/stop"
        Assert-True ($stopResp.StatusCode -eq 200) "Expected 200 for /api/focus/stop."

        $idle = Invoke-Api -Method "GET" -Path "/api/focus/status"
        Assert-True ($idle.StatusCode -eq 200) "Expected 200 after stop."
        Assert-True (-not [bool]$idle.Json.isRunning) "Expected isRunning=false after stop."
        Save-JsonArtifact -Path (Join-Path $manualApiDir "04-focus-idle-status.json") -Object $idle.Json
    }

    Run-Check "Core API chain: profile and history" {
        $profile = Invoke-Api -Method "GET" -Path "/api/profile"
        Assert-True ($profile.StatusCode -eq 200) "Expected 200 for /api/profile."
        Assert-True ($null -ne $profile.Json) "Profile JSON is empty."
        Assert-True ([int64]$profile.Json.totalFocusSeconds -ge 0) "Profile totalFocusSeconds must be non-negative."
        Assert-True ([int]$profile.Json.totalSessions -ge 0) "Profile totalSessions must be non-negative."
        Save-JsonArtifact -Path (Join-Path $manualApiDir "05-profile.json") -Object $profile.Json

        $history = Invoke-Api -Method "GET" -Path "/api/focus/history"
        Assert-True ($history.StatusCode -eq 200) "Expected 200 for /api/focus/history."
        Assert-True ($null -ne $history.Json) "History JSON is empty."
        Assert-True ($null -ne $history.Json.items) "History response must contain items."
        Save-JsonArtifact -Path (Join-Path $manualApiDir "06-focus-history.json") -Object $history.Json
    }

    Run-Check "Core API chain: whitelist CRUD" {
        $name = "vv-preset-" + [Guid]::NewGuid().ToString("N").Substring(0, 8)
        $saveBody = @{
            name = $name
            allowedProcesses = @("powershell.exe", "Code.exe")
            allowedWebsites = @("github.com")
        }

        $save = Invoke-Api -Method "POST" -Path "/api/whitelistpresets" -Body $saveBody
        Assert-True ($save.StatusCode -eq 200) "Expected 200 for save whitelist preset."
        Assert-True ($null -ne $save.Json.id -and $save.Json.id.Length -gt 0) "Saved preset must contain id."
        $presetId = [string]$save.Json.id
        Save-JsonArtifact -Path (Join-Path $manualApiDir "07-whitelist-save.json") -Object $save.Json

        $list = Invoke-Api -Method "GET" -Path "/api/whitelistpresets"
        Assert-True ($list.StatusCode -eq 200) "Expected 200 for list whitelist presets."
        $found = $false
        foreach ($p in $list.Json) {
            if ([string]$p.id -eq $presetId) {
                $found = $true
                break
            }
        }
        Assert-True $found "Saved preset id not found in list response."
        Save-JsonArtifact -Path (Join-Path $manualApiDir "08-whitelist-list.json") -Object $list.Json

        $del = Invoke-Api -Method "DELETE" -Path ("/api/whitelistpresets/" + $presetId)
        Assert-True ($del.StatusCode -eq 204) "Expected 204 for delete whitelist preset."
    }

    Run-Check "Core API chain: usage ingest and today summary" {
        $clear = Invoke-Api -Method "POST" -Path "/api/usage/clear"
        Assert-True ($clear.StatusCode -eq 200) "Expected 200 for /api/usage/clear."

        $now = [DateTime]::UtcNow
        $usageBody = @(
            @{
                url = "https://github.com/team31/repo"
                domain = "github.com"
                title = "GitHub"
                icon = ""
                startTime = $now.AddMinutes(-1).ToString("o")
                endTime = $now.ToString("o")
                duration = 60
                userId = "local"
            }
        )

        $post = Invoke-Api -Method "POST" -Path "/api/usage" -Body $usageBody -BodyAsArray
        Assert-True ($post.StatusCode -eq 200) "Expected 200 for /api/usage POST."

        $today = Invoke-Api -Method "GET" -Path "/api/usage/today"
        Assert-True ($today.StatusCode -eq 200) "Expected 200 for /api/usage/today."
        Assert-True ($null -ne $today.Json) "Today usage JSON is empty."
        Save-JsonArtifact -Path (Join-Path $manualApiDir "09-usage-today.json") -Object $today.Json
    }

    Run-Check "Exception path: duplicate start returns 409" {
        $body = @{
            durationSeconds = 30
            allowedProcesses = @("powershell.exe")
            allowedWebsites = @()
            graceSeconds = 10
        }

        $s1 = Invoke-Api -Method "POST" -Path "/api/focus/start" -Body $body
        Assert-True ($s1.StatusCode -eq 200) "First start should be 200."

        $s2 = Invoke-Api -Method "POST" -Path "/api/focus/start" -Body $body
        Assert-True ($s2.StatusCode -eq 409) "Second start should return 409, got $($s2.StatusCode)."
        Save-JsonArtifact -Path (Join-Path $manualApiDir "10-ex-duplicate-start.json") -Object @{ status = $s2.StatusCode; body = $s2.Content }

        Invoke-Api -Method "POST" -Path "/api/focus/stop" | Out-Null
    }

    Run-Check "Exception path: invalid payload returns 400" {
        $invalid = @{
            durationSeconds = 0
            allowedProcesses = @("powershell.exe")
            allowedWebsites = @()
            graceSeconds = 10
        }

        $resp = Invoke-Api -Method "POST" -Path "/api/focus/start" -Body $invalid
        Assert-True ($resp.StatusCode -eq 400) "Invalid start payload should return 400."
        Save-JsonArtifact -Path (Join-Path $manualApiDir "11-ex-invalid-start.json") -Object @{ status = $resp.StatusCode; body = $resp.Content }
    }

    Run-Check "Exception path: delete non-existing preset returns 404" {
        $id = [Guid]::NewGuid().ToString("N")
        $resp = Invoke-Api -Method "DELETE" -Path ("/api/whitelistpresets/" + $id)
        Assert-True ($resp.StatusCode -eq 404) "Delete non-existing preset should return 404."
        Save-JsonArtifact -Path (Join-Path $manualApiDir "12-ex-delete-missing-preset.json") -Object @{ status = $resp.StatusCode; id = $id }
    }

    Run-Check "Performance: three API endpoints" {
        $results = @()
        $targets = @{
            "/api/focus/status" = 50
            "/api/focus/history" = 100
            "/api/usage/today" = 150
        }

        foreach ($endpoint in @("/api/focus/status", "/api/focus/history", "/api/usage/today")) {
            $m = Measure-Endpoint -Path $endpoint -Count $PerfCount
            $target = [int]$targets[$endpoint]
            $result = if ($m.P95 -le $target) { "PASS" } else { "FAIL" }

            $results += [pscustomobject]@{
                date = (Get-Date).ToString("yyyy-MM-dd")
                endpoint = $endpoint
                count = $m.Count
                p50_ms = $m.P50
                p95_ms = $m.P95
                target_p95_ms = $target
                result = $result
                notes = "localhost"
            }
        }

        $results | Export-Csv -Path $perfCsv -NoTypeInformation -Encoding UTF8

        $summaryLines = @()
        $summaryLines += "# Performance Summary (Version 0)"
        $summaryLines += ""
        $summaryLines += "| Endpoint | Target p95 | Measured p95 | Result | Notes |"
        $summaryLines += "|---|---:|---:|---|---|"
        foreach ($row in $results) {
            $summaryLines += "| $($row.endpoint) | <= $($row.target_p95_ms) ms | $($row.p95_ms) ms | $($row.result) | $($row.notes) |"
        }
        $summaryLines += ""
        $summaryLines += "## Mitigation Plan (if any target fails)"
        $summaryLines += "- Endpoint:"
        $summaryLines += "- Observed issue:"
        $summaryLines += "- Suspected root cause:"
        $summaryLines += "- Planned fix:"
        $summaryLines += "- ETA:"

        Set-Content -Path $perfSummary -Value $summaryLines -Encoding UTF8

        $failedPerf = @($results | Where-Object { $_.result -eq "FAIL" })
        if ($failedPerf.Count -gt 0) {
            throw "One or more endpoints failed p95 target. See $perfCsv"
        }
    }

    Run-Check "Performance: timer drift" {
        $drift = Measure-TimerDrift -DurationSeconds 40 -SampleSeconds 20
        $drift | ConvertTo-Json -Depth 10 | Set-Content -Path $timerDriftJson -Encoding UTF8
        Assert-True ($drift.result -eq "PASS") "Timer drift exceeds threshold. See $timerDriftJson"
    }

    Run-Check "Performance: backend CPU and memory" {
        $resource = Measure-BackendResourceUsage -ParentProcess $backendProc -SampleSeconds 20 -PollIntervalMs 500
        $resource | ConvertTo-Json -Depth 10 | Set-Content -Path $resourceUsageJson -Encoding UTF8
        Assert-True ($resource.result -eq "PASS") "Backend resource usage exceeds target. See $resourceUsageJson"
    }

    if ($RunExtended) {
        Run-Check "Extended: missing profile file fallback" {
            $growinDir = Join-Path $env:APPDATA "Growin"
            New-Item -ItemType Directory -Force -Path $growinDir | Out-Null
            $profilePath = Join-Path $growinDir "user_profile.json"

            $snapshot = Backup-FileState -Path $profilePath
            try {
                if (Test-Path $profilePath) {
                    Remove-Item -Path $profilePath -Force
                }

                $resp = Invoke-Api -Method "GET" -Path "/api/profile"
                Assert-True ($resp.StatusCode -eq 200) "Profile should return 200 when file is missing."
                Assert-True ([int]$resp.Json.totalSessions -ge 0) "Fallback profile must be valid."
            }
            finally {
                Restore-FileState -Path $profilePath -Snapshot $snapshot
            }
        }

        Run-Check "Extended: corrupted whitelist file fallback" {
            $growinDir = Join-Path $env:APPDATA "Growin"
            New-Item -ItemType Directory -Force -Path $growinDir | Out-Null
            $presetsPath = Join-Path $growinDir "whitelist_presets.json"

            $snapshot = Backup-FileState -Path $presetsPath
            try {
                Set-Content -Path $presetsPath -Value "{invalid-json" -Encoding UTF8
                $resp = Invoke-Api -Method "GET" -Path "/api/whitelistpresets"
                Assert-True ($resp.StatusCode -eq 200) "Whitelist list should return 200 for corrupted file fallback."
            }
            finally {
                Restore-FileState -Path $presetsPath -Snapshot $snapshot
            }
        }

        Run-Check "Extended: violation to failed full path" {
            $body = @{
                durationSeconds = 30
                allowedProcesses = @("nonexistent-allowed.exe")
                allowedWebsites = @()
                graceSeconds = 3
            }

            $start = Invoke-Api -Method "POST" -Path "/api/focus/start" -Body $body
            Assert-True ($start.StatusCode -eq 200) "Start should return 200."

            $deadline = (Get-Date).AddSeconds(10)
            $seenViolating = $false
            $seenFailed = $false
            while ((Get-Date) -lt $deadline) {
                $status = Invoke-Api -Method "GET" -Path "/api/focus/status"
                if ($status.StatusCode -ne 200) {
                    throw "Status request failed during violation path."
                }

                if ([bool]$status.Json.isViolating) { $seenViolating = $true }
                if ([bool]$status.Json.isFailed) {
                    $seenFailed = $true
                    break
                }

                Start-Sleep -Milliseconds 500
            }

            Assert-True $seenViolating "Expected to observe isViolating=true at least once."
            Assert-True $seenFailed "Expected session to fail after grace threshold."
        }

        Run-Check "Extended: usage boundaries (empty and duplicates)" {
            $clear = Invoke-Api -Method "POST" -Path "/api/usage/clear"
            Assert-True ($clear.StatusCode -eq 200) "Usage clear must return 200."

            $empty = Invoke-Api -Method "GET" -Path "/api/usage/today"
            Assert-True ($empty.StatusCode -eq 200) "Usage today must return 200 for empty DB."
            Assert-True ($empty.Json.Count -eq 0) "Expected empty list for empty DB."

            $now = [DateTime]::UtcNow
            $payload = @(
                @{
                    url = "https://example.com/a"
                    domain = "example.com"
                    title = "Example"
                    icon = ""
                    startTime = $now.AddSeconds(-20).ToString("o")
                    endTime = $now.AddSeconds(-10).ToString("o")
                    duration = 10
                    userId = "local"
                }
            )

            $post1 = Invoke-Api -Method "POST" -Path "/api/usage" -Body $payload -BodyAsArray
            $post2 = Invoke-Api -Method "POST" -Path "/api/usage" -Body $payload -BodyAsArray
            Assert-True ($post1.StatusCode -eq 200 -and $post2.StatusCode -eq 200) "Duplicate usage posts should return 200."

            $today = Invoke-Api -Method "GET" -Path "/api/usage/today"
            Assert-True ($today.StatusCode -eq 200) "Usage today must return 200 after duplicate posts."

            $row = $null
            foreach ($item in $today.Json) {
                if ([string]$item.domain -eq "example.com") {
                    $row = $item
                    break
                }
            }

            Assert-True ($null -ne $row) "Expected example.com row in usage summary."
            Assert-True ([int]$row.totalSeconds -ge 20) "Expected duplicate events to contribute cumulative seconds."
        }
    }

    Run-Check "Frontend unit tests (Vitest)" {
        Ensure-UiTestDependencies
        Push-Location $uiDir
        try {
            & npm run test:unit
            if ($LASTEXITCODE -ne 0) {
                throw "Vitest unit tests failed."
            }
        }
        finally {
            Pop-Location
        }
    }

    Run-Check "Frontend E2E smoke tests (Playwright)" {
        Ensure-UiTestDependencies
        Push-Location $uiDir
        try {
            & npm run test:e2e
            if ($LASTEXITCODE -ne 0) {
                throw "Playwright E2E tests failed."
            }
        }
        finally {
            Pop-Location
        }
    }

    Run-Check "Performance: UI update latency" {
        Ensure-UiTestDependencies
        Push-Location $uiDir
        try {
            & npm run vv:ui-latency
            if ($LASTEXITCODE -ne 0) {
                throw "UI latency measurement script failed."
            }
        }
        finally {
            Pop-Location
        }

        Assert-True (Test-Path $uiLatencyJson) "UI latency artifact missing: $uiLatencyJson"
        $uiLatency = Get-Content -Raw $uiLatencyJson | ConvertFrom-Json
        Assert-True ($uiLatency.result -eq "PASS") "UI latency target failed. See $uiLatencyJson"
    }

    if (Test-Path $perfSummary) {
        $extra = @()
        if (Test-Path $uiLatencyJson) {
            $ui = Get-Content -Raw $uiLatencyJson | ConvertFrom-Json
            $extra += ""
            $extra += "## UI Update Latency"
            $extra += "- p50: $($ui.p50Ms) ms"
            $extra += "- p95: $($ui.p95Ms) ms"
            $extra += "- target: <= $($ui.targetMs) ms"
            $extra += "- result: $($ui.result)"
        }

        if (Test-Path $timerDriftJson) {
            $drift = Get-Content -Raw $timerDriftJson | ConvertFrom-Json
            $extra += ""
            $extra += "## Timer Drift"
            $extra += "- max absolute drift: $($drift.maxAbsDriftSeconds) s"
            $extra += "- average absolute drift: $($drift.avgAbsDriftSeconds) s"
            $extra += "- target: <= $($drift.targetMaxAbsDriftSeconds) s"
            $extra += "- result: $($drift.result)"
        }

        if (Test-Path $resourceUsageJson) {
            $res = Get-Content -Raw $resourceUsageJson | ConvertFrom-Json
            $extra += ""
            $extra += "## Backend Resource Usage"
            $extra += "- average CPU: $($res.avgCpuPercent)% (target < $($res.targets.avgCpuPercent)%)"
            $extra += "- peak CPU: $($res.peakCpuPercent)% (target < $($res.targets.peakCpuPercent)%)"
            $extra += "- peak memory: $($res.peakMemoryMb) MB (target <= $($res.targets.peakMemoryMb) MB)"
            $extra += "- result: $($res.result)"
        }

        if ($extra.Count -gt 0) {
            Add-Content -Path $perfSummary -Value $extra
        }
    }
}
finally {
    if ($null -ne $backendProc -and -not $backendProc.HasExited) {
        try {
            Stop-Process -Id $backendProc.Id -Force
        }
        catch {
        }
    }

    $env:APPDATA = $oldAppData
}

$checks | ConvertTo-Json -Depth 10 | Set-Content -Path $reportJson -Encoding UTF8

$md = @()
$md += "# V&V Automation Report"
$md += ""
$md += "Generated: $(Get-Date -Format s)"
$md += ""
$md += "| Check | Status | Details |"
$md += "|---|---|---|"
foreach ($c in $checks) {
    $md += "| $($c.name) | $($c.status) | $($c.details.Replace("|", "/")) |"
}
$md += ""
$md += "Artifacts:"
$md += "- $testsLog"
$md += "- $manualApiDir"
$md += "- $perfCsv"
$md += "- $perfSummary"
$md += "- $uiLatencyJson"
$md += "- $timerDriftJson"
$md += "- $resourceUsageJson"
$md += "- $runtimeLog"
$md += "- $runtimeErr"
Set-Content -Path $reportMd -Value $md -Encoding UTF8

if ($hadFailure) {
    Write-Host ""
    Write-Host "V&V automation completed with failures. See $reportMd"
    exit 1
}

Write-Host ""
Write-Host "V&V automation completed successfully. See $reportMd"
exit 0
