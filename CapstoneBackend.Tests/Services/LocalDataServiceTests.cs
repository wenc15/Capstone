// 2026/4/7 authored by Zhecheng Xu
// Purpose: Verifies LocalDataService safe defaults and JSON persistence fallback behavior.

using CapstoneBackend.Models;
using CapstoneBackend.Services;
using CapstoneBackend.Tests.TestInfrastructure;
using CapstoneBackend.Utils;
using FluentAssertions;
using Xunit;

namespace CapstoneBackend.Tests.Services;

public class LocalDataServiceTests
{
    public LocalDataServiceTests()
    {
        _ = TestEnvironment.AppDataRoot;
        TestEnvironment.ResetStorage();
    }

    [Fact]
    public void MissingProfileFile_ReturnsSafeDefaults()
    {
        var service = new LocalDataService();

        if (File.Exists(LocalStoragePaths.UserProfileFilePath))
        {
            File.Delete(LocalStoragePaths.UserProfileFilePath);
        }

        var profile = service.GetUserProfile();

        profile.TotalFocusSeconds.Should().BeGreaterThanOrEqualTo(0);
        profile.TotalSessions.Should().BeGreaterThanOrEqualTo(0);
        profile.SuccessfulSessions.Should().BeGreaterThanOrEqualTo(0);
        profile.FailedSessions.Should().BeGreaterThanOrEqualTo(0);
        profile.CanceledSessions.Should().BeGreaterThanOrEqualTo(0);
    }

    [Fact]
    public void WhitelistPreset_RoundTripPersistence_Works()
    {
        var saveService = new LocalDataService();
        var saveReq = new SaveWhitelistPresetRequest
        {
            Name = "roundtrip-preset",
            AllowedProcesses = new List<string> { "chrome.exe", "Code.exe" },
            AllowedWebsites = new List<string> { "github.com" }
        };

        var saved = saveService.SaveWhitelistPreset(saveReq);

        var readService = new LocalDataService();
        var presets = readService.GetWhitelistPresets();

        presets.Should().ContainSingle(x => x.Id == saved.Id);
        var fetched = presets.Single(x => x.Id == saved.Id);
        fetched.Name.Should().Be("roundtrip-preset");
        fetched.AllowedProcesses.Should().Contain(new[] { "chrome.exe", "Code.exe" });
        fetched.AllowedWebsites.Should().Contain("github.com");
    }

    [Fact]
    public void MissingHistoryFile_ReturnsEmptyList()
    {
        var service = new LocalDataService();

        if (File.Exists(LocalStoragePaths.SessionHistoryFilePath))
        {
            File.Delete(LocalStoragePaths.SessionHistoryFilePath);
        }

        var history = service.GetSessionHistory();
        history.Should().NotBeNull();
        history.Should().BeEmpty();
    }

    [Fact]
    public void MissingPresetsFile_ReturnsEmptyList()
    {
        var service = new LocalDataService();

        if (File.Exists(LocalStoragePaths.WhitelistPresetsFilePath))
        {
            File.Delete(LocalStoragePaths.WhitelistPresetsFilePath);
        }

        var presets = service.GetWhitelistPresets();
        presets.Should().NotBeNull();
        presets.Should().BeEmpty();
    }

    [Fact]
    public void CorruptedHistoryFile_ReturnsFallbackEmptyList()
    {
        var service = new LocalDataService();
        File.WriteAllText(LocalStoragePaths.SessionHistoryFilePath, "{invalid");

        var history = service.GetSessionHistory();
        history.Should().NotBeNull();
        history.Should().BeEmpty();
    }

    [Fact]
    public void CorruptedPresetFile_ReturnsFallbackEmptyList()
    {
        var service = new LocalDataService();
        File.WriteAllText(LocalStoragePaths.WhitelistPresetsFilePath, "{invalid");

        var presets = service.GetWhitelistPresets();
        presets.Should().NotBeNull();
        presets.Should().BeEmpty();
    }
}
