// 2026/4/7 authored by Zhecheng Xu
// Purpose: Verifies profile endpoint responses and profile JSON fallback behavior.

using System.Net;
using System.Net.Http.Json;
using CapstoneBackend.Tests.TestInfrastructure;
using FluentAssertions;
using Xunit;

namespace CapstoneBackend.Tests.Api;

public class ProfileControllerTests : IDisposable
{
    private readonly CustomWebApplicationFactory _factory;
    private readonly HttpClient _client;

    public ProfileControllerTests()
    {
        _ = TestEnvironment.AppDataRoot;
        TestEnvironment.ResetStorage();
        _factory = new CustomWebApplicationFactory();
        _client = _factory.CreateClient();
    }

    [Fact]
    public async Task GetProfile_ReturnsValidJsonWithSafeDefaults()
    {
        var resp = await _client.GetAsync("/api/profile");
        resp.StatusCode.Should().Be(HttpStatusCode.OK);

        var profile = await resp.Content.ReadFromJsonAsync<UserProfileDto>();
        profile.Should().NotBeNull();

        profile!.TotalFocusSeconds.Should().BeGreaterThanOrEqualTo(0);
        profile.TotalSessions.Should().BeGreaterThanOrEqualTo(0);
        profile.SuccessfulSessions.Should().BeGreaterThanOrEqualTo(0);
        profile.FailedSessions.Should().BeGreaterThanOrEqualTo(0);
        profile.CanceledSessions.Should().BeGreaterThanOrEqualTo(0);
    }

    [Fact]
    public async Task CorruptedProfileFile_FallsBackWithoutServerError()
    {
        var profilePath = Path.Combine(TestEnvironment.GrowinDataDirectory, "user_profile.json");
        File.WriteAllText(profilePath, "{ invalid-json");

        var resp = await _client.GetAsync("/api/profile");
        resp.StatusCode.Should().Be(HttpStatusCode.OK);

        var profile = await resp.Content.ReadFromJsonAsync<UserProfileDto>();
        profile.Should().NotBeNull();
        profile!.TotalFocusSeconds.Should().BeGreaterThanOrEqualTo(0);
    }

    [Fact]
    public async Task SchemaEvolution_MissingFields_DoesNotCrash()
    {
        var profilePath = Path.Combine(TestEnvironment.GrowinDataDirectory, "user_profile.json");
        File.WriteAllText(profilePath, "{\"totalFocusSeconds\":12}");

        var resp = await _client.GetAsync("/api/profile");
        resp.StatusCode.Should().Be(HttpStatusCode.OK);

        var profile = await resp.Content.ReadFromJsonAsync<UserProfileDto>();
        profile.Should().NotBeNull();
        profile!.TotalFocusSeconds.Should().Be(12);
    }

    public void Dispose()
    {
        _client.Dispose();
        _factory.Dispose();
    }
}
