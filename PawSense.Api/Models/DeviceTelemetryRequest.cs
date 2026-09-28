namespace PawSense.Api.Models;

public class DeviceTelemetryRequest
{
    public string DeviceId { get; set; } = string.Empty;

    public string Activity { get; set; } = string.Empty;
}