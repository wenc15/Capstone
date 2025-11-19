using System.Collections.Generic;
using CapstoneBackend.Models;
using CapstoneBackend.Services;
using CapstoneBackend.Utils;
using FluentAssertions;
using Xunit;

public class LocalDataServiceTests
{
    public LocalDataServiceTests()
    {
        // 只确保目录存在，不去删真实的 json 文件（避免权限 & 竞争）
        LocalStoragePaths.EnsureBaseDirectory();
    }

    [Fact]
    public void GetUserProfile_should_return_non_null_and_non_negative_counts()
    {
        var svc = new LocalDataService();

        var profile = svc.GetUserProfile();

        profile.Should().NotBeNull();
        profile.TotalSessions     .Should().BeGreaterOrEqualTo(0);
        profile.TotalFocusSeconds .Should().BeGreaterOrEqualTo(0);
        profile.SuccessfulSessions.Should().BeGreaterOrEqualTo(0);
        profile.FailedSessions    .Should().BeGreaterOrEqualTo(0);
        profile.CanceledSessions  .Should().BeGreaterOrEqualTo(0);
    }

    [Fact]
    public void Whitelist_preset_crud_should_roundtrip()
    {
        var svc = new LocalDataService();

        // 先记下当前数量，不要求为空
        var before = svc.GetWhitelistPresets();
        int beforeCount = before.Count;

        var req = new SaveWhitelistPresetRequest
        {
            Name             = "TestPreset-" + Guid.NewGuid().ToString("N"), // 保证名字唯一
            AllowedProcesses = new List<string> { "Code.exe", "chrome.exe" },
            AllowedWebsites  = new List<string> { "leetcode.com", "github.com" }
        };

        var saved = svc.SaveWhitelistPreset(req);

        saved.Id.Should().NotBeNullOrEmpty();
        saved.Name.Should().Be(req.Name);

        var all = svc.GetWhitelistPresets();
        all.Count.Should().Be(beforeCount + 1);
        all.Should().Contain(p => p.Id == saved.Id);

        // 删除
        var removed = svc.DeleteWhitelistPreset(saved.Id);
        removed.Should().BeTrue();

        var afterDelete = svc.GetWhitelistPresets();
        afterDelete.Count.Should().Be(beforeCount);
        afterDelete.Should().NotContain(p => p.Id == saved.Id);
    }
}
