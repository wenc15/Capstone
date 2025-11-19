# CapstoneBackend.Tests

## 一、项目简介 (Overview)

`CapstoneBackend.Tests` 是 **Focus Enhancement Tool (Growin)** 后端的自动化测试工程，基于：

- .NET 8 (`net8.0`)
- xUnit
- FluentAssertions
- Microsoft.AspNetCore.Mvc.Testing（用于 Web API 集成测试）

本测试项目的目标是：

- 验证本地持久化逻辑（用户统计、本地白名单预设）；
- 验证专注会话业务逻辑（开始 / 结束 / 统计累加）；
- 验证核心后端 API 是否按预期工作（Profile / WhitelistPresets / Focus 等）；
- 为前后端联调和演示提供回归测试保障。

---

## 二、目录结构 (Project Structure)

仓库整体结构示例：

```text
Capstone/
  src/
    CapstoneBackend.csproj          # 后端 Web API 主项目
    ...
    focus-api.rest                  # VS Code REST Client 手工测试脚本
  CapstoneBackend.Tests/
    CapstoneBackend.Tests.csproj    # 本测试项目
    README.md
    AssemblyInfo.cs                 # 关闭测试并行执行 (DisableTestParallelization)
    CustomWebApplicationFactory.cs  # 用于 Web API 集成测试
    LocalDataServiceTests.cs
    FocusSessionServiceTests.cs
    ProfileControllerTests.cs
    WhitelistPresetsControllerTests.cs
```

说明：

- `src/`：生产代码（后端 Web API）；
- `CapstoneBackend.Tests/`：自动化测试工程（xUnit）；
- `focus-api.rest`：使用 VS Code REST Client 的手工 / 半自动接口测试脚本（相当于 Postman Collection 的轻量替代）。

---

## 三、环境要求 (Requirements)

- 已安装 .NET SDK 8.x。可通过命令确认：

```bash
dotnet --list-sdks
```

- 任意编辑器（VS Code / Rider / Visual Studio），建议：
  - VS Code + C# 扩展；
  - VS Code + REST Client（用于运行 `focus-api.rest`，但与本测试项目无直接依赖）。

> 运行 **自动化测试** 不需要单独启动后端，只需在仓库根目录执行 `dotnet test`。  
> 使用 `focus-api.rest` 做手工测试时，需要在 `src/` 下运行 `dotnet run` 启动后端。

---

## 四、如何运行测试 (How to Run Tests)

### 1. 从仓库根目录运行所有测试 (Run all tests from solution root)

在仓库根目录（包含 `src/` 与 `CapstoneBackend.Tests/` 的那一层）执行：

```bash
dotnet test
```

或显式指定解决方案文件：

```bash
dotnet test Capstone.sln
```

这会自动构建：

- `src/CapstoneBackend.csproj`
- `CapstoneBackend.Tests/CapstoneBackend.Tests.csproj`

并运行所有 xUnit 测试。

### 2. 仅运行本测试项目 (Run only this test project)

如果只想运行本项目，可以执行：

```bash
dotnet test CapstoneBackend.Tests/CapstoneBackend.Tests.csproj
```

---

## 五、测试设计与覆盖范围 (Test Design & Coverage)

### 1. LocalDataServiceTests

**模块 / Modules**  
`CapstoneBackend.Services.LocalDataService`、`CapstoneBackend.Utils.LocalStoragePaths` 以及本地 JSON 文件（例如 `%AppData%\Growin\user_profile.json`、`whitelist_presets.json`）。

**主要测试点 / Key checks**

- `GetUserProfile_should_return_non_null_and_non_negative_counts`  
  - `GetUserProfile()` 始终返回非空的 `UserProfile`；  
  - 所有计数字段均为非负数（`>= 0`），兼容首次运行和已有历史数据。

- `Whitelist_preset_crud_should_roundtrip`  
  - 使用唯一名字（例如 `TestPreset-{Guid}`）创建白名单预设；  
  - 保存后预设数量 `+1`，删除后数量回到原值；  
  - 已删除的 `Id` 不再出现在返回列表中；  
  - 验证白名单预设在本地 JSON 文件中的增删改查流程。

### 2. FocusSessionServiceTests

**模块 / Modules**  
`CapstoneBackend.Services.FocusSessionService` 与 `LocalDataService`。

**主要测试点 / Key checks**

- `StartSession_should_set_running_and_remaining_seconds`  
  - 调用 `StartSession()` 后：  
    - `GetStatus().IsRunning == true`；  
    - `IsFailed == false`；  
    - `RemainingSeconds` 在合理范围内（`0 < remaining ≤ plannedSeconds`）。

- `Session_should_record_success_in_user_profile_when_time_elapsed`  
  - 使用较短的 `DurationSeconds` 启动一次会话；  
  - 等待一段时间，让定时器自然结束；  
  - 重新读取 `UserProfile`，断言 `TotalSessions` 和 `SuccessfulSessions` 至少增加 1，`TotalFocusSeconds` 不会减少（`>=` 原值）；  
  - 验证：会话自然结束时，成功结果会被写入用户统计。

### 3. ProfileControllerTests

**模块 / Endpoint**  
`/api/profile` — 用户统计接口。

使用 `CustomWebApplicationFactory : WebApplicationFactory<Program>` 启动内存中的测试服务器，通过 `HttpClient` 实际发送 HTTP 请求。

**主要测试点 / Key checks**

- `Get_profile_should_return_valid_json`  
  - `GET /api/profile` 返回 `200 OK`；  
  - 响应体可反序列化为 `UserProfile`；  
  - 统计字段（总会话数、累计专注时长等）为非负数。

### 4. WhitelistPresetsControllerTests

**模块 / Endpoint**  
`/api/whitelistpresets` — 本地白名单预设管理接口。

**主要测试点 / Key checks**

- `Create_list_delete_preset_should_roundtrip`  
  - `GET /api/whitelistpresets` 获取初始列表；  
  - `POST /api/whitelistpresets` 创建新预设并检查返回内容；  
  - 再次 `GET` 验证数量 `+1` 且包含新建预设；  
  - `DELETE /api/whitelistpresets/{id}` 删除该预设；  
  - 第三次 `GET` 验证数量回到原值且不再包含该 `Id`。

- `Delete_non_existing_preset_should_return_not_found`  
  - 删除不存在的 `Id` 时返回 `404 NotFound`。

---

## 六、与 focus-api.rest 的关系 (Relation to focus-api.rest)

- `CapstoneBackend.Tests` 提供 **自动化测试**（xUnit），可在 CI 或本地通过 `dotnet test` 一键回归。  
- `src/focus-api.rest` 提供 **手工 / 半自动接口测试脚本**，可在 VS Code 中通过 REST Client 插件执行，用于：
  - 手动验证核心业务流程（开始专注 / 查看状态 / 结束专注 / 查看统计）；
  - 测试异常参数、非法值、边界情况；
  - 演示前快速做一次健康检查。

二者配合，可以较完整地覆盖后端功能：

- 自动化测试负责“回归 + 核心逻辑”；
- `focus-api.rest` 负责“调试 + 人工验证 + Demo”。

---
