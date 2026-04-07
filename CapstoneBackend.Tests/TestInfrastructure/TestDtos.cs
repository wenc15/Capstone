namespace CapstoneBackend.Tests.TestInfrastructure;

public class FocusStatusDto
{
    public bool IsRunning { get; set; }
    public int RemainingSeconds { get; set; }
    public bool IsFailed { get; set; }
    public bool IsViolating { get; set; }
    public int ViolationSeconds { get; set; }
    public string? FailReason { get; set; }
}

public class UserProfileDto
{
    public long TotalFocusSeconds { get; set; }
    public int TotalSessions { get; set; }
    public int SuccessfulSessions { get; set; }
    public int FailedSessions { get; set; }
    public int CanceledSessions { get; set; }
}

public class WhitelistPresetDto
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
}

public class SessionHistoryRecordDto
{
    public long Ts { get; set; }
    public int Minutes { get; set; }
    public string Outcome { get; set; } = string.Empty;
}

public class SessionHistoryRecordsResponseDto
{
    public List<SessionHistoryRecordDto> Items { get; set; } = new();
}
