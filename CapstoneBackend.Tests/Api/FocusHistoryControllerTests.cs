// 2026/4/7 authored by Zhecheng Xu
// Purpose: Verifies history endpoint behavior for missing/corrupted files and append semantics.

using System.Net;
using System.Net.Http.Json;
using CapstoneBackend.Tests.TestInfrastructure;
using FluentAssertions;
using Xunit;

namespace CapstoneBackend.Tests.Api;

public class FocusHistoryControllerTests : IDisposable
{
    private readonly CustomWebApplicationFactory _factory;
    private readonly HttpClient _client;

    public FocusHistoryControllerTests()
    {
        _ = TestEnvironment.AppDataRoot;
        TestEnvironment.ResetStorage();
        _factory = new CustomWebApplicationFactory();
        _client = _factory.CreateClient();
    }

    [Fact]
    public async Task MissingHistoryFile_ReturnsEmptyList()
    {
        var resp = await _client.GetAsync("/api/focus/history");
        resp.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await resp.Content.ReadFromJsonAsync<SessionHistoryRecordsResponseDto>();
        body.Should().NotBeNull();
        body!.Items.Should().BeEmpty();
    }

    [Fact]
    public async Task CorruptedHistoryFile_ReturnsEmptyListWithout500()
    {
        var path = Path.Combine(TestEnvironment.GrowinDataDirectory, "session_history.json");
        File.WriteAllText(path, "{ invalid");

        var resp = await _client.GetAsync("/api/focus/history");
        resp.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await resp.Content.ReadFromJsonAsync<SessionHistoryRecordsResponseDto>();
        body.Should().NotBeNull();
        body!.Items.Should().BeEmpty();
    }

    [Fact]
    public async Task StopCalledTwice_AppendsSingleHistoryRecord()
    {
        var before = await _client.GetFromJsonAsync<SessionHistoryRecordsResponseDto>("/api/focus/history");
        var beforeCount = before!.Items.Count;

        var startReq = new
        {
            durationSeconds = 20,
            allowedProcesses = new[] { "powershell.exe", "Code.exe", "chrome.exe" },
            allowedWebsites = Array.Empty<string>(),
            graceSeconds = 10
        };

        (await _client.PostAsJsonAsync("/api/focus/start", startReq)).StatusCode.Should().Be(HttpStatusCode.OK);
        (await _client.PostAsync("/api/focus/stop", null)).StatusCode.Should().Be(HttpStatusCode.OK);
        (await _client.PostAsync("/api/focus/stop", null)).StatusCode.Should().Be(HttpStatusCode.OK);

        var after = await _client.GetFromJsonAsync<SessionHistoryRecordsResponseDto>("/api/focus/history");
        after!.Items.Count.Should().Be(beforeCount + 1);
    }

    public void Dispose()
    {
        _client.Dispose();
        _factory.Dispose();
    }
}
