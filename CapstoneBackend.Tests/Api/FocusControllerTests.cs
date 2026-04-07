// 2026/4/7 authored by Zhecheng Xu
// Purpose: Verifies focus session lifecycle APIs, status transitions, and error handling.

using System.Net;
using System.Net.Http.Json;
using CapstoneBackend.Tests.TestInfrastructure;
using FluentAssertions;
using Xunit;

namespace CapstoneBackend.Tests.Api;

public class FocusControllerTests : IDisposable
{
    private readonly CustomWebApplicationFactory _factory;
    private readonly HttpClient _client;

    public FocusControllerTests()
    {
        _ = TestEnvironment.AppDataRoot;
        TestEnvironment.ResetStorage();
        _factory = new CustomWebApplicationFactory();
        _client = _factory.CreateClient();
    }

    [Fact]
    public async Task StartSession_SetsRunningAndInitialRemainingTime()
    {
        var request = new
        {
            durationSeconds = 20,
            allowedProcesses = new[] { "powershell.exe", "Code.exe", "chrome.exe" },
            allowedWebsites = new[] { "github.com" },
            graceSeconds = 10
        };

        var startResp = await _client.PostAsJsonAsync("/api/focus/start", request);
        startResp.StatusCode.Should().Be(HttpStatusCode.OK);

        var status = await startResp.Content.ReadFromJsonAsync<FocusStatusDto>();
        status.Should().NotBeNull();
        status!.IsRunning.Should().BeTrue();
        status.RemainingSeconds.Should().BeGreaterThan(0);

        var stopResp = await _client.PostAsync("/api/focus/stop", content: null);
        stopResp.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task CompletedSession_UpdatesProfileTotals()
    {
        var profileBeforeResp = await _client.GetAsync("/api/profile");
        profileBeforeResp.StatusCode.Should().Be(HttpStatusCode.OK);
        var profileBefore = await profileBeforeResp.Content.ReadFromJsonAsync<UserProfileDto>();
        profileBefore.Should().NotBeNull();

        var request = new
        {
            durationSeconds = 2,
            allowedProcesses = new[] { "nonexistent-allowed.exe" },
            allowedWebsites = Array.Empty<string>(),
            graceSeconds = 30
        };

        var startResp = await _client.PostAsJsonAsync("/api/focus/start", request);
        startResp.StatusCode.Should().Be(HttpStatusCode.OK);

        var deadline = DateTimeOffset.UtcNow.AddSeconds(10);
        var stopped = false;
        while (DateTimeOffset.UtcNow < deadline)
        {
            var statusResp = await _client.GetAsync("/api/focus/status");
            statusResp.StatusCode.Should().Be(HttpStatusCode.OK);
            var status = await statusResp.Content.ReadFromJsonAsync<FocusStatusDto>();
            if (status is { IsRunning: false })
            {
                stopped = true;
                break;
            }

            await Task.Delay(250);
        }

        stopped.Should().BeTrue();

        var profileAfterResp = await _client.GetAsync("/api/profile");
        profileAfterResp.StatusCode.Should().Be(HttpStatusCode.OK);
        var profileAfter = await profileAfterResp.Content.ReadFromJsonAsync<UserProfileDto>();
        profileAfter.Should().NotBeNull();

        profileAfter!.TotalSessions.Should().Be(profileBefore!.TotalSessions + 1);
        profileAfter.TotalFocusSeconds.Should().BeGreaterThanOrEqualTo(profileBefore.TotalFocusSeconds);
    }

    [Fact]
    public async Task StartWhileRunning_ReturnsConflict()
    {
        var request = new
        {
            durationSeconds = 20,
            allowedProcesses = new[] { "powershell.exe" },
            allowedWebsites = Array.Empty<string>(),
            graceSeconds = 10
        };

        var first = await _client.PostAsJsonAsync("/api/focus/start", request);
        first.StatusCode.Should().Be(HttpStatusCode.OK);

        var second = await _client.PostAsJsonAsync("/api/focus/start", request);
        second.StatusCode.Should().Be(HttpStatusCode.Conflict);

        await _client.PostAsync("/api/focus/stop", content: null);
    }

    [Fact]
    public async Task InvalidStartPayload_ReturnsBadRequest()
    {
        var request = new
        {
            durationSeconds = 0,
            allowedProcesses = new[] { "powershell.exe" },
            allowedWebsites = Array.Empty<string>(),
            graceSeconds = 10
        };

        var resp = await _client.PostAsJsonAsync("/api/focus/start", request);
        resp.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task StopWhileIdle_ReturnsOk()
    {
        var resp = await _client.PostAsync("/api/focus/stop", content: null);
        resp.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task StatusCountdown_DecreasesWithinTolerance()
    {
        var request = new
        {
            durationSeconds = 15,
            allowedProcesses = new[] { "powershell.exe", "Code.exe", "chrome.exe" },
            allowedWebsites = Array.Empty<string>(),
            graceSeconds = 10
        };

        var start = await _client.PostAsJsonAsync("/api/focus/start", request);
        start.StatusCode.Should().Be(HttpStatusCode.OK);

        var s1 = await (await _client.GetAsync("/api/focus/status")).Content.ReadFromJsonAsync<FocusStatusDto>();
        await Task.Delay(2200);
        var s2 = await (await _client.GetAsync("/api/focus/status")).Content.ReadFromJsonAsync<FocusStatusDto>();

        s1.Should().NotBeNull();
        s2.Should().NotBeNull();
        s2!.RemainingSeconds.Should().BeLessThan(s1!.RemainingSeconds);

        await _client.PostAsync("/api/focus/stop", content: null);
    }

    [Fact]
    public async Task CancelPath_StopSession_AppendsAbortedHistory()
    {
        var historyBefore = await _client.GetFromJsonAsync<SessionHistoryRecordsResponseDto>("/api/focus/history");
        historyBefore.Should().NotBeNull();
        var countBefore = historyBefore!.Items.Count;

        var request = new
        {
            durationSeconds = 30,
            allowedProcesses = new[] { "powershell.exe", "Code.exe", "chrome.exe" },
            allowedWebsites = Array.Empty<string>(),
            graceSeconds = 10
        };

        var start = await _client.PostAsJsonAsync("/api/focus/start", request);
        start.StatusCode.Should().Be(HttpStatusCode.OK);

        var stop = await _client.PostAsync("/api/focus/stop", content: null);
        stop.StatusCode.Should().Be(HttpStatusCode.OK);

        var historyAfter = await _client.GetFromJsonAsync<SessionHistoryRecordsResponseDto>("/api/focus/history");
        historyAfter.Should().NotBeNull();
        historyAfter!.Items.Count.Should().Be(countBefore + 1);
        historyAfter.Items[0].Outcome.Should().Be("aborted");
        historyAfter.Items[0].Ts.Should().BeGreaterThan(0);
        historyAfter.Items[0].Minutes.Should().BeGreaterThanOrEqualTo(0);
    }

    public void Dispose()
    {
        _client.Dispose();
        _factory.Dispose();
    }
}
