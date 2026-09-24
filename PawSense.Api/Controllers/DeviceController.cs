using Google.Cloud.Firestore;
using Microsoft.AspNetCore.Mvc;
using PawSense.Api.Models;

namespace PawSense.Api.Controllers;

[ApiController]
[Route("api/device")]
public class DeviceController : ControllerBase
{
    private readonly FirestoreDb _firestore;

    public DeviceController(FirestoreDb firestore)
    {
        _firestore = firestore;
    }


    [HttpPost("telemetry")]
    public async Task<IActionResult> ReceiveTelemetry(
        [FromBody] DeviceTelemetryRequest request)
    {
        // ----------------------------------------------
        // Validate Device ID
        // ----------------------------------------------

        if (string.IsNullOrWhiteSpace(request.DeviceId))
        {
            return BadRequest(new
            {
                success = false,
                message = "Device ID is required."
            });
        }


        // ----------------------------------------------
        // Validate Activity
        // ----------------------------------------------

        if (string.IsNullOrWhiteSpace(request.Activity))
        {
            return BadRequest(new
            {
                success = false,
                message = "Activity is required."
            });
        }


        string activity =
            request.Activity
                .Trim()
                .ToUpperInvariant();


        string[] allowedActivities =
        {
            "RESTING",
            "WALKING",
            "RUNNING"
        };


        if (!allowedActivities.Contains(activity))
        {
            return BadRequest(new
            {
                success = false,
                message = "Invalid activity."
            });
        }


        // ----------------------------------------------
        // Firestore Device Document
        // ----------------------------------------------

        DocumentReference deviceRef =
            _firestore
                .Collection("devices")
                .Document(request.DeviceId);


        Dictionary<string, object> deviceData =
            new()
            {
                { "deviceId", request.DeviceId },
                { "activity", activity },
                { "online", true },
                { "lastSeen", FieldValue.ServerTimestamp }
            };


        await deviceRef.SetAsync(
            deviceData,
            SetOptions.MergeAll
        );


        // ----------------------------------------------
        // Console Debugging
        // ----------------------------------------------

        Console.WriteLine(
            $"PawSense telemetry saved | " +
            $"Device: {request.DeviceId} | " +
            $"Activity: {activity}"
        );


        // ----------------------------------------------
        // API Response
        // ----------------------------------------------

        return Ok(new
        {
            success = true,
            deviceId = request.DeviceId,
            activity,
            message = "Telemetry saved to Firestore."
        });
    }
}