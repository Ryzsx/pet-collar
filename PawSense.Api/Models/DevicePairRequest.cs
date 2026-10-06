namespace PawSense.Api.Models;

public class DevicePairRequest
{
    public string DeviceId { get; set; } = string.Empty;

    public string PairingCode { get; set; } = string.Empty;

    public string PetId { get; set; } = string.Empty;

    public string UserId { get; set; } = string.Empty;
}