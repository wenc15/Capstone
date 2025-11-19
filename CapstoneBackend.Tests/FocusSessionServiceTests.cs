using System.Collections.Generic;
using System.Threading;
using CapstoneBackend.Models;
using CapstoneBackend.Services;
using CapstoneBackend.Utils;
using FluentAssertions;
using Xunit;

public class FocusSessionServiceTests
{
    public FocusSessionServiceTests()
    {
        LocalStoragePaths.EnsureBaseDirectory();
    }

    [Fact]
    public void StartSession_should_set_running_and_remaining_seconds()
    {
        var dataService = new LocalDataService();
        var focus       = new FocusSessionService(dataService);

        var request = new StartFocusRequest
        {
            DurationSeconds  = 60,
            GraceSeconds     = 10,
            AllowedProcesses = new List<string> { "Code.exe" }
        };

        focus.StartSession(request);

        Thread.Sleep(50);

        var status = focus.GetStatus();

        status.Should().NotBeNull();
        status.IsRunning.Should().BeTrue();
        status.IsFailed.Should().BeFalse();
        status.RemainingSeconds.Should().BeGreaterThan(0);
        status.RemainingSeconds.Should().BeLessOrEqualTo(60);
    }

    [Fact]
    public void Session_should_record_success_in_user_profile_when_time_elapsed()
    {
        var dataService = new LocalDataService();
        var before      = dataService.GetUserProfile();

        var focus = new FocusSessionService(dataService);

        var request = new StartFocusRequest
        {
            DurationSeconds  = 1,
            GraceSeconds     = 9999,
            AllowedProcesses = new List<string>() // 这里不关心进程白名单
        };

        focus.StartSession(request);

        // 等待足够时间让 Session 自然结束并写入 Profile
        Thread.Sleep(1500);

        var after = dataService.GetUserProfile();

        after.TotalSessions.Should().BeGreaterOrEqualTo(before.TotalSessions + 1);
        after.SuccessfulSessions.Should().BeGreaterOrEqualTo(before.SuccessfulSessions + 1);
        after.TotalFocusSeconds.Should().BeGreaterOrEqualTo(before.TotalFocusSeconds);

    }
}
