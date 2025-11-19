// CapstoneBackend.Tests/WhitelistPresetsControllerTests.cs

using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Net.Http.Json;
using System.Threading.Tasks;
using CapstoneBackend.Models;
using FluentAssertions;
using Xunit;

public class WhitelistPresetsControllerTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly HttpClient _client;

    public WhitelistPresetsControllerTests(CustomWebApplicationFactory factory)
    {
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task Create_list_delete_preset_should_roundtrip()
    {
        // 1. 初始列表
        var listBefore =
            await _client.GetFromJsonAsync<List<WhitelistPreset>>("/api/whitelistpresets")
            ?? new List<WhitelistPreset>();

        int beforeCount = listBefore.Count;

        // 2. 创建一个新的预设（等价于 focus-api.rest 里的 POST）
        var req = new SaveWhitelistPresetRequest
        {
            Name             = "Study - Chrome + VSCode",
            AllowedProcesses = new List<string> { "chrome.exe", "Code.exe" },
            AllowedWebsites  = new List<string> { "https://leetcode.com", "github.com" }
        };

        var createResp = await _client.PostAsJsonAsync("/api/whitelistpresets", req);
        createResp.StatusCode.Should().Be(HttpStatusCode.OK);

        var created = await createResp.Content.ReadFromJsonAsync<WhitelistPreset>();
        created.Should().NotBeNull();
        created!.Id.Should().NotBeNullOrEmpty();
        created.Name.Should().Be("Study - Chrome + VSCode");

        // 3. 再查一次，数量应该 +1
        var listAfterCreate =
            await _client.GetFromJsonAsync<List<WhitelistPreset>>("/api/whitelistpresets")
            ?? new List<WhitelistPreset>();

        listAfterCreate.Count.Should().Be(beforeCount + 1);
        listAfterCreate.Should().Contain(p => p.Id == created.Id);

        // 4. 删除刚刚创建的这个预设
        var deleteResp = await _client.DeleteAsync($"/api/whitelistpresets/{created.Id}");
        deleteResp.StatusCode.Should().Be(HttpStatusCode.NoContent);

        // 5. 再次获取列表，数量应该回到原值
        var listAfterDelete =
            await _client.GetFromJsonAsync<List<WhitelistPreset>>("/api/whitelistpresets")
            ?? new List<WhitelistPreset>();

        listAfterDelete.Count.Should().Be(beforeCount);
        listAfterDelete.Should().NotContain(p => p.Id == created.Id);
    }

    [Fact]
    public async Task Delete_non_existing_preset_should_return_not_found()
    {
        var resp = await _client.DeleteAsync("/api/whitelistpresets/not-exist-id");
        resp.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}
