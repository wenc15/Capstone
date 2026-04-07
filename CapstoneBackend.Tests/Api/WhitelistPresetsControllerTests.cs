// 2026/4/7 authored by Zhecheng Xu
// Purpose: Verifies whitelist preset CRUD behavior and corrupted-file fallback.

using System.Net;
using System.Net.Http.Json;
using CapstoneBackend.Tests.TestInfrastructure;
using FluentAssertions;
using Xunit;

namespace CapstoneBackend.Tests.Api;

public class WhitelistPresetsControllerTests : IDisposable
{
    private readonly CustomWebApplicationFactory _factory;
    private readonly HttpClient _client;

    public WhitelistPresetsControllerTests()
    {
        _ = TestEnvironment.AppDataRoot;
        TestEnvironment.ResetStorage();
        _factory = new CustomWebApplicationFactory();
        _client = _factory.CreateClient();
    }

    [Fact]
    public async Task CreateListDeletePreset_WorksEndToEnd()
    {
        var createBody = new
        {
            name = "vv-test-preset",
            allowedProcesses = new[] { "chrome.exe", "Code.exe" },
            allowedWebsites = new[] { "github.com" }
        };

        var createResp = await _client.PostAsJsonAsync("/api/whitelistpresets", createBody);
        createResp.StatusCode.Should().Be(HttpStatusCode.OK);
        var created = await createResp.Content.ReadFromJsonAsync<WhitelistPresetDto>();
        created.Should().NotBeNull();
        created!.Id.Should().NotBeNullOrWhiteSpace();

        var listResp = await _client.GetAsync("/api/whitelistpresets");
        listResp.StatusCode.Should().Be(HttpStatusCode.OK);
        var list = await listResp.Content.ReadFromJsonAsync<List<WhitelistPresetDto>>();
        list.Should().NotBeNull();
        list!.Any(x => x.Id == created.Id).Should().BeTrue();

        var deleteResp = await _client.DeleteAsync($"/api/whitelistpresets/{created.Id}");
        deleteResp.StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task DeleteNonExistingPreset_ReturnsNotFound()
    {
        var missingId = Guid.NewGuid().ToString("N");

        var resp = await _client.DeleteAsync($"/api/whitelistpresets/{missingId}");
        resp.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task CorruptedPresetFile_ReturnsEmptyListWithout500()
    {
        var path = Path.Combine(TestEnvironment.GrowinDataDirectory, "whitelist_presets.json");
        File.WriteAllText(path, "{invalid");

        var resp = await _client.GetAsync("/api/whitelistpresets");
        resp.StatusCode.Should().Be(HttpStatusCode.OK);

        var list = await resp.Content.ReadFromJsonAsync<List<WhitelistPresetDto>>();
        list.Should().NotBeNull();
        list!.Should().BeEmpty();
    }

    public void Dispose()
    {
        _client.Dispose();
        _factory.Dispose();
    }
}
