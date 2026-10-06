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


    // =========================================================
    // DEVICE TELEMETRY
    // =========================================================

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
        // Mirror Safe Live Data To Paired Pet
        // ----------------------------------------------

        DocumentSnapshot updatedDeviceSnapshot =
            await deviceRef.GetSnapshotAsync();


        bool isPaired =
            updatedDeviceSnapshot.TryGetValue<bool>(
                "paired",
                out bool paired
            )
            && paired;


        if (
            isPaired
            &&
            updatedDeviceSnapshot.TryGetValue<string>(
                "pairedPetId",
                out string? pairedPetId
            )
            &&
            !string.IsNullOrWhiteSpace(pairedPetId)
        )
        {
            DocumentReference petRef =
                _firestore
                    .Collection("pets")
                    .Document(pairedPetId);


            string displayedActivity =
                activity switch
                {
                    "RESTING" => "Resting",
                    "WALKING" => "Walking",
                    "RUNNING" => "Running",
                    _ => activity
                };


            Dictionary<string, object> petLiveData =
                new()
                {
                    { "deviceId", request.DeviceId },
                    { "collarOnline", true },
                    { "activity", displayedActivity },
                    { "activityUpdatedAt", FieldValue.ServerTimestamp },
                    { "lastSeen", FieldValue.ServerTimestamp }
                };


            await petRef.SetAsync(
                petLiveData,
                SetOptions.MergeAll
            );
        }


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


    // =========================================================
    // DEVICE PAIRING
    // =========================================================

    [HttpPost("pair")]
    public async Task<IActionResult> PairDevice(
        [FromBody] DevicePairRequest request)
    {
        string deviceId =
            request.DeviceId?.Trim() ?? string.Empty;

        string pairingCode =
            request.PairingCode?.Trim() ?? string.Empty;

        string petId =
            request.PetId?.Trim() ?? string.Empty;

        string userId =
            request.UserId?.Trim() ?? string.Empty;


        // ----------------------------------------------
        // Validate Request
        // ----------------------------------------------

        if (string.IsNullOrWhiteSpace(deviceId))
        {
            return BadRequest(new
            {
                success = false,
                code = "DEVICE_ID_REQUIRED",
                message = "Device ID is required."
            });
        }


        if (string.IsNullOrWhiteSpace(pairingCode))
        {
            return BadRequest(new
            {
                success = false,
                code = "PAIRING_CODE_REQUIRED",
                message = "Pairing code is required."
            });
        }


        if (string.IsNullOrWhiteSpace(petId))
        {
            return BadRequest(new
            {
                success = false,
                code = "PET_ID_REQUIRED",
                message = "Pet ID is required."
            });
        }


        if (string.IsNullOrWhiteSpace(userId))
        {
            return BadRequest(new
            {
                success = false,
                code = "USER_ID_REQUIRED",
                message = "User ID is required."
            });
        }


        DocumentReference deviceRef =
            _firestore
                .Collection("devices")
                .Document(deviceId);


        DocumentReference petRef =
            _firestore
                .Collection("pets")
                .Document(petId);


        try
        {
            PairingResult result =
                await _firestore.RunTransactionAsync(
                    async transaction =>
                    {
                        // --------------------------------------
                        // Read Device
                        // --------------------------------------

                        DocumentSnapshot deviceSnapshot =
                            await transaction
                                .GetSnapshotAsync(deviceRef);


                        if (!deviceSnapshot.Exists)
                        {
                            return new PairingResult(
                                false,
                                "DEVICE_NOT_FOUND",
                                "PawSense collar was not found."
                            );
                        }


                        // --------------------------------------
                        // Verify Pairing Code
                        // --------------------------------------

                        if (
                            !deviceSnapshot.TryGetValue<string>(
                                "pairingCode",
                                out string? storedPairingCode
                            )
                            ||
                            storedPairingCode != pairingCode
                        )
                        {
                            return new PairingResult(
                                false,
                                "INVALID_PAIRING_CODE",
                                "Invalid pairing code."
                            );
                        }


                        // --------------------------------------
                        // Check Existing Pairing
                        // --------------------------------------

                        bool alreadyPaired =
                            deviceSnapshot.TryGetValue<bool>(
                                "paired",
                                out bool paired
                            )
                            && paired;


                        if (alreadyPaired)
                        {
                            return new PairingResult(
                                false,
                                "DEVICE_ALREADY_PAIRED",
                                "This collar is already paired."
                            );
                        }


                        // --------------------------------------
                        // Read Pet
                        // --------------------------------------

                        DocumentSnapshot petSnapshot =
                            await transaction
                                .GetSnapshotAsync(petRef);


                        if (!petSnapshot.Exists)
                        {
                            return new PairingResult(
                                false,
                                "PET_NOT_FOUND",
                                "Pet profile was not found."
                            );
                        }


                        // --------------------------------------
                        // Verify Pet Owner
                        // ----------------------------------------------

                        if (
                            !petSnapshot.TryGetValue<string>(
                                "userId",
                                out string? petUserId
                            )
                            ||
                            petUserId != userId
                        )
                        {
                            return new PairingResult(
                                false,
                                "PET_OWNER_MISMATCH",
                                "The pet does not belong to this user."
                            );
                        }


                        // --------------------------------------
                        // Prevent Replacing Another Collar
                        // ----------------------------------------------

                        if (
                            petSnapshot.TryGetValue<string>(
                                "deviceId",
                                out string? currentDeviceId
                            )
                            &&
                            !string.IsNullOrWhiteSpace(
                                currentDeviceId
                            )
                            &&
                            !string.Equals(
                                currentDeviceId,
                                deviceId,
                                StringComparison.OrdinalIgnoreCase
                            )
                        )
                        {
                            return new PairingResult(
                                false,
                                "PET_ALREADY_HAS_DEVICE",
                                "This pet already has another collar."
                            );
                        }


                        // --------------------------------------
                        // Update Device
                        // ----------------------------------------------

                        Dictionary<string, object> deviceUpdates =
                            new()
                            {
                                { "paired", true },
                                { "pairedPetId", petId },
                                { "pairedUserId", userId },
                                { "pairedAt", FieldValue.ServerTimestamp }
                            };


                        transaction.Update(
                            deviceRef,
                            deviceUpdates
                        );


                        // --------------------------------------
                        // Update Pet
                        // ----------------------------------------------

                        Dictionary<string, object> petUpdates =
                            new()
                            {
                                { "deviceId", deviceId },
                                { "updatedAt", FieldValue.ServerTimestamp }
                            };


                        transaction.Update(
                            petRef,
                            petUpdates
                        );


                        return new PairingResult(
                            true,
                            "PAIRED",
                            "PawSense collar paired successfully."
                        );
                    }
                );


            // ----------------------------------------------
            // Convert Pairing Result to HTTP Response
            // ----------------------------------------------

            switch (result.Code)
            {
                case "DEVICE_NOT_FOUND":
                case "PET_NOT_FOUND":

                    return NotFound(new
                    {
                        success = false,
                        code = result.Code,
                        message = result.Message
                    });


                case "INVALID_PAIRING_CODE":

                    return BadRequest(new
                    {
                        success = false,
                        code = result.Code,
                        message = result.Message
                    });


                case "DEVICE_ALREADY_PAIRED":
                case "PET_ALREADY_HAS_DEVICE":

                    return Conflict(new
                    {
                        success = false,
                        code = result.Code,
                        message = result.Message
                    });


                case "PET_OWNER_MISMATCH":

                    return StatusCode(
                        StatusCodes.Status403Forbidden,
                        new
                        {
                            success = false,
                            code = result.Code,
                            message = result.Message
                        }
                    );
            }


            Console.WriteLine(
                $"PawSense collar paired | " +
                $"Device: {deviceId} | " +
                $"Pet: {petId}"
            );


            return Ok(new
            {
                success = true,
                code = result.Code,
                deviceId,
                petId,
                message = result.Message
            });
        }
        catch (Exception error)
        {
            Console.WriteLine(
                $"Device pairing failed | " +
                $"{error.Message}"
            );


            return StatusCode(
                StatusCodes.Status500InternalServerError,
                new
                {
                    success = false,
                    code = "PAIRING_FAILED",
                    message = "Failed to pair the PawSense collar."
                }
            );
        }
    }


    private sealed record PairingResult(
        bool Success,
        string Code,
        string Message
    );
}