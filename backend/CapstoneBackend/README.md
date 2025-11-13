🟦 Capstone Backend（.NET 8 Web API）运行说明

「本次测试内容不代表最终品质，请以正式服为准。」(＾▽＾)

本文件介绍如何在本地运行和测试 后端（专注计时 + 白名单监控）。

🧩 VS Code 推荐扩展（必须安装）
1. .NET Extension Pack

提供 .NET 开发的完整工具集（调试、项目管理等）。

2. C# Dev Kit

微软官方的 C# 扩展，提供智能提示、调试、项目导航。

3. C# Extensions

快速创建 C# 类、接口、控制器、服务等文件。

4. REST Client

用于直接在 VS Code 内测试后端 API（点击 "Send Request" 即可）。

1. 前置要求（必须安装）

请确保电脑已安装：

✅ .NET SDK 8.0（不是 runtime）

下载地址（微软官方）：

https://dotnet.microsoft.com/download/dotnet/8.0

安装后在终端输入：

dotnet --version


如果输出类似：

8.0.x


说明安装成功。

✅（强烈推荐！）VS Code + REST Client 插件用于测试 API。

2. 克隆 & 拉取代码

首次使用（不会真有人不会吧 ^_^）：

git clone <仓库地址>
cd Capstone
git pull


后端目录结构如下：

backend/
  CapstoneBackend/
    Controllers/
    Models/
    Services/
    Utils/
    Program.cs

3. 运行后端 API

进入后端项目目录：

cd backend/CapstoneBackend
dotnet restore   # 只需第一次（其实我没做这一步也没问题）
dotnet run


看到类似输出表示后端启动成功（端口大概率不同，建议检查，出了问题肯定不是code有问题）：

Now listening on: http://localhost:5024
Application started. Press Ctrl+C to shut down.


保持这个终端开着（不要关）。

4. 使用 REST Client 测试后端 API（最推荐）

在 VS Code 中打开文件：

backend/CapstoneBackend/focus-api.rest


文件内容如下（端口保持与你终端输出一致，默认 5024（按照你自己的更改））：

### 开始专注
POST http://localhost:5024/api/focus/start
Content-Type: application/json

{
  "durationSeconds": 300,
  "allowedProcesses": [ "chrome.exe", "notepad.exe" ],
  "graceSeconds": 10
}

###

### 查看状态
GET http://localhost:5024/api/focus/status

###

### 停止专注
POST http://localhost:5024/api/focus/stop
Content-Type: application/json

▶ 测试步骤

在 VS Code 中打开 focus-api.rest

光标移动到第一段 POST http://...start 上方

点击 Send Request

若返回 200 OK 表示专注成功启动

再点 GET /status 查看状态变化

点 POST /stop 可结束专注

5. 后端功能说明
🔹 Start（POST /api/focus/start）

启动一次专注，前端传入：

durationSeconds：专注时长（秒）

allowedProcesses：白名单软件，例如 "chrome.exe"

graceSeconds：违规宽限时间（秒）

示例：

{
  "durationSeconds": 1500,
  "allowedProcesses": ["chrome.exe", "word.exe"],
  "graceSeconds": 10
}

🔹 Status（GET /api/focus/status）

后端每秒监控当前前台窗口进程，返回：

{
  "isRunning": true,
  "remainingSeconds": 1497,
  "isFailed": false,
  "isViolating": false,
  "violationSeconds": 0,
  "currentProcess": "chrome"
}


若长期使用非白名单软件 → 即返回：

isFailed = true

🔹 Stop（POST /api/focus/stop）

主动终止专注。

6. 停止后端

在运行后端的终端里按：

Ctrl + C


或关闭终端窗口即可。

7. 注意事项

请不要提交：

bin/

obj/

它们已在 .gitignore 中被忽略