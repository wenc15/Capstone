using Xunit;

// 全局关闭测试并行执行，避免同时读写 AppData\Growin 下的 json 文件
[assembly: CollectionBehavior(DisableTestParallelization = true)]