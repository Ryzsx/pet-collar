
namespace PawSense.Api.Models;

public class DeviceTelemetryRequest
{
    public string DeviceId { get; set; } = string.Empty;

    // Optional: send only when activity is confirmed
    public string? Activity { get; set; }

    // Optional: actual battery reading
    public double? BatteryPercent { get; set; }

    // Optional: GPS availability / valid fix status
    public bool? GpsAvailable { get; set; }

    // Optional: valid GPS coordinates
    public double? Latitude { get; set; }
    public double? Longitude { get; set; }
}
