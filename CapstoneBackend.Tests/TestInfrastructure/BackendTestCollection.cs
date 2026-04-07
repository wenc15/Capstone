using Xunit;

namespace CapstoneBackend.Tests.TestInfrastructure;

[CollectionDefinition("Backend Integration")]
public class BackendTestCollection : ICollectionFixture<CustomWebApplicationFactory>
{
}
