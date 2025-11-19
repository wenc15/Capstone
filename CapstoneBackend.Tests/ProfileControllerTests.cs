using System.Net.Http;
using System.Net.Http.Json;
using System.Net;
using CapstoneBackend.Models;
using FluentAssertions;
using Xunit;

public class ProfileControllerTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly HttpClient _client;

    public ProfileControllerTests(CustomWebApplicationFactory factory)
    {
        _client = factory.CreateClient();
    }

    [Fact]
    public async void Get_profile_should_return_valid_json()
    {
        var resp = await _client.GetAsync("/api/profile");
        resp.StatusCode.Should().Be(HttpStatusCode.OK);

        var profile = await resp.Content.ReadFromJsonAsync<UserProfile>();
        profile.Should().NotBeNull();
        profile!.TotalSessions.Should().BeGreaterOrEqualTo(0);
        profile.TotalFocusSeconds.Should().BeGreaterOrEqualTo(0);
    }
}
