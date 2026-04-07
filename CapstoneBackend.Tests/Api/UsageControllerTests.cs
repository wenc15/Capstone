// 2026/4/7 authored by Zhecheng Xu
// Purpose: Verifies usage ingestion, daily aggregation, duplicates, and day-boundary behavior.

using System.Net;
using System.Net.Http.Json;
using CapstoneBackend.Tests.TestInfrastructure;
using FluentAssertions;
using Xunit;

namespace CapstoneBackend.Tests.Api;

public class UsageControllerTests : IDisposable
{
    private readonly CustomWebApplicationFactory _factory;
    private readonly HttpClient _client;

    public UsageControllerTests()
    {
        _ = TestEnvironment.AppDataRoot;
        TestEnvironment.ResetStorage();
        _factory = new CustomWebApplicationFactory();
        _client = _factory.CreateClient();
    }

    [Fact]
    public async Task EmptyDatabase_ReturnsEmptyTodayList()
    {
        (await _client.PostAsync("/api/usage/clear", null)).StatusCode.Should().Be(HttpStatusCode.OK);

        var resp = await _client.GetAsync("/api/usage/today");
        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var list = await resp.Content.ReadFromJsonAsync<List<UsageSummaryDto>>();
        list.Should().NotBeNull();
        list!.Should().BeEmpty();
    }

    [Fact]
    public async Task PostKnownItems_TodayGroupsAndSumsByDomain()
    {
        (await _client.PostAsync("/api/usage/clear", null)).StatusCode.Should().Be(HttpStatusCode.OK);

        var now = DateTime.UtcNow;
        var payload = new[]
        {
            new
            {
                url = "https://github.com/a",
                domain = "github.com",
                title = "GitHub",
                icon = "",
                startTime = now.AddMinutes(-3).ToString("o"),
                endTime = now.AddMinutes(-2).ToString("o"),
                duration = 60,
                userId = "local"
            },
            new
            {
                url = "https://github.com/b",
                domain = "github.com",
                title = "GitHub",
                icon = "",
                startTime = now.AddMinutes(-2).ToString("o"),
                endTime = now.AddMinutes(-1).ToString("o"),
                duration = 90,
                userId = "local"
            },
            new
            {
                url = "https://google.com",
                domain = "google.com",
                title = "Google",
                icon = "",
                startTime = now.AddMinutes(-1).ToString("o"),
                endTime = now.ToString("o"),
                duration = 30,
                userId = "local"
            }
        };

        var post = await _client.PostAsJsonAsync("/api/usage", payload);
        post.StatusCode.Should().Be(HttpStatusCode.OK);

        var today = await _client.GetFromJsonAsync<List<UsageSummaryDto>>("/api/usage/today");
        today.Should().NotBeNull();
        var rows = today!;

        var github = rows.Single(x => x.Domain == "github.com");
        github.TotalSeconds.Should().Be(150);

        var google = rows.Single(x => x.Domain == "google.com");
        google.TotalSeconds.Should().Be(30);
    }

    [Fact]
    public async Task DuplicateEvents_AreHandledConsistently_AsCumulative()
    {
        (await _client.PostAsync("/api/usage/clear", null)).StatusCode.Should().Be(HttpStatusCode.OK);

        var now = DateTime.UtcNow;
        var duplicate = new[]
        {
            new
            {
                url = "https://example.com/1",
                domain = "example.com",
                title = "Example",
                icon = "",
                startTime = now.AddMinutes(-1).ToString("o"),
                endTime = now.ToString("o"),
                duration = 20,
                userId = "local"
            }
        };

        (await _client.PostAsJsonAsync("/api/usage", duplicate)).StatusCode.Should().Be(HttpStatusCode.OK);
        (await _client.PostAsJsonAsync("/api/usage", duplicate)).StatusCode.Should().Be(HttpStatusCode.OK);

        var today = await _client.GetFromJsonAsync<List<UsageSummaryDto>>("/api/usage/today");
        today.Should().NotBeNull();
        var row = today!.Single(x => x.Domain == "example.com");
        row.TotalSeconds.Should().Be(40);
    }

    [Fact]
    public async Task DayBoundary_OnlyCountsTodayRows()
    {
        (await _client.PostAsync("/api/usage/clear", null)).StatusCode.Should().Be(HttpStatusCode.OK);

        var now = DateTime.UtcNow;
        var yesterday = now.Date.AddSeconds(-10);
        var today = now.Date.AddMinutes(1);

        var payload = new[]
        {
            new
            {
                url = "https://old.com",
                domain = "old.com",
                title = "Old",
                icon = "",
                startTime = yesterday.ToString("o"),
                endTime = yesterday.AddSeconds(10).ToString("o"),
                duration = 10,
                userId = "local"
            },
            new
            {
                url = "https://today.com",
                domain = "today.com",
                title = "Today",
                icon = "",
                startTime = today.ToString("o"),
                endTime = today.AddSeconds(30).ToString("o"),
                duration = 30,
                userId = "local"
            }
        };

        (await _client.PostAsJsonAsync("/api/usage", payload)).StatusCode.Should().Be(HttpStatusCode.OK);

        var rows = await _client.GetFromJsonAsync<List<UsageSummaryDto>>("/api/usage/today");
        rows.Should().NotBeNull();
        var items = rows!;
        items.Any(x => x.Domain == "old.com").Should().BeFalse();
        items.Any(x => x.Domain == "today.com").Should().BeTrue();
    }

    public void Dispose()
    {
        _client.Dispose();
        _factory.Dispose();
    }

    public class UsageSummaryDto
    {
        public string Domain { get; set; } = string.Empty;
        public int TotalSeconds { get; set; }
    }
}
