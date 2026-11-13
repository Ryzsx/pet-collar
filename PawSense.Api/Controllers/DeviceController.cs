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
        string deviceId =
            request.DeviceId?.Trim() ?? string.Empty;

        if (string.IsNullOrWhiteSpace(deviceId))
        {
            return BadRequest(new
            {
                success = false,
                message = "Device ID is required."
            });
        }

        // ----------------------------------------------
        // Validate optional activity
        // ----------------------------------------------

        bool hasActivity = request.Activity != null;

        string activity =
            request.Activity?.Trim().ToUpperInvariant()
            ?? string.Empty;

        if (hasActivity &&
            activity != "RESTING" &&
            activity != "WALKING" &&
            activity != "RUNNING")
        {
            return BadRequest(new
            {
                success = false,
                message = "Invalid activity."
            });
        }

        string displayedActivity = activity switch
        {
            "RESTING" => "Resting",
            "WALKING" => "Walking",
            "RUNNING" => "Running",
            _ => activity
        };

        // ----------------------------------------------
        // Validate optional battery reading
        // ----------------------------------------------

        bool hasBattery = request.BatteryPercent.HasValue;

        if (hasBattery)
        {
            double battery = request.BatteryPercent!.Value;

            if (!double.IsFinite(battery) ||
                battery < 0 || battery > 100)
            {
                return BadRequest(new
                {
                    success = false,
                    message = "Battery must be between 0 and 100."
                });
            }
        }

        // ----------------------------------------------
        // Validate optional GPS reading
        // ----------------------------------------------

        bool hasLatitude = request.Latitude.HasValue;
        bool hasLongitude = request.Longitude.HasValue;

        if (hasLatitude != hasLongitude)
        {
            return BadRequest(new
            {
                success = false,
                message = "GPS requires both latitude and longitude."
            });
        }

        bool hasCoordinates = hasLatitude && hasLongitude;

        if (hasCoordinates)
        {
            double latitude = request.Latitude!.Value;
            double longitude = request.Longitude!.Value;

            if (!double.IsFinite(latitude) ||
                !double.IsFinite(longitude) ||
                latitude < -90 || latitude > 90 ||
                longitude < -180 || longitude > 180)
            {
                return BadRequest(new
                {
                    success = false,
                    message = "Invalid GPS coordinates."
                });
            }

            if (request.GpsAvailable == false)
            {
                return BadRequest(new
                {
                    success = false,
                    message = "GPS cannot be unavailable when coordinates are supplied."
                });
            }
        }

        if (request.GpsAvailable == true &&
            !hasCoordinates)
        {
            return BadRequest(new
            {
                success = false,
                message = "A valid GPS fix requires coordinates."
            });
        }

        // Reject packets without any monitoring reading.
        // Heartbeat-only packets use /api/device/heartbeat.

        if (!hasActivity &&
            !hasBattery &&
            !request.GpsAvailable.HasValue &&
            !hasCoordinates)
        {
            return BadRequest(new
            {
                success = false,
                message = "No telemetry readings supplied."
            });
        }

        // ----------------------------------------------
        // Build selective device and pet updates
        // ----------------------------------------------

        Dictionary<string, object> deviceUpdates = new()
        {
            { "deviceId", deviceId },
            { "collarOnline", true },
            { "lastSeen", FieldValue.ServerTimestamp }
        };

        Dictionary<string, object> petUpdates = new()
        {
            { "collarOnline", true },
            { "lastSeen", FieldValue.ServerTimestamp }
        };

        // Confirmed activity
        if (hasActivity)
        {
            deviceUpdates["activity"] = activity;
            deviceUpdates["activityUpdatedAt"] =
                FieldValue.ServerTimestamp;

            petUpdates["activity"] = displayedActivity;
            petUpdates["activityUpdatedAt"] =
                FieldValue.ServerTimestamp;
        }

        // New battery reading only
        if (hasBattery)
        {
            double battery = request.BatteryPercent!.Value;

            deviceUpdates["batteryPercent"] = battery;
            deviceUpdates["batteryUpdatedAt"] =
                FieldValue.ServerTimestamp;

            petUpdates["batteryPercent"] = battery;
            petUpdates["batteryUpdatedAt"] =
                FieldValue.ServerTimestamp;
        }

        // GPS status
        if (request.GpsAvailable.HasValue ||
            hasCoordinates)
        {
            bool gpsAvailable = hasCoordinates;

            deviceUpdates["gpsAvailable"] = gpsAvailable;
            deviceUpdates["gpsStatusUpdatedAt"] =
                FieldValue.ServerTimestamp;

            petUpdates["gpsAvailable"] = gpsAvailable;
            petUpdates["gpsStatusUpdatedAt"] =
                FieldValue.ServerTimestamp;
        }

        // Latest valid location only
        if (hasCoordinates)
        {
            // Assumed Firestore map format:
            // { latitude: number, longitude: number }
            Dictionary<string, object> coordinates = new()
            {
                { "latitude", request.Latitude!.Value },
                { "longitude", request.Longitude!.Value }
            };

            deviceUpdates["lastKnownCoordinates"] =
                coordinates;

            deviceUpdates["gpsUpdatedAt"] =
                FieldValue.ServerTimestamp;

            petUpdates["lastKnownCoordinates"] =
                coordinates;

            petUpdates["gpsUpdatedAt"] =
                FieldValue.ServerTimestamp;
        }

        DocumentReference deviceRef = _firestore
            .Collection("devices")
            .Document(deviceId);

        try
        {
            // ----------------------------------------------
            // Atomic Firestore synchronization
            // ----------------------------------------------

            string result =
                await _firestore.RunTransactionAsync(
                    async transaction =>
                    {
                        DocumentSnapshot deviceSnapshot =
                            await transaction
                                .GetSnapshotAsync(deviceRef);
                        
                        // Track whether a low battery alert is already active.
                        bool previousLowBatteryAlert =
                            deviceSnapshot.Exists &&
                            deviceSnapshot.TryGetValue<bool>(
                                "lowBatteryAlertActive",
                                out bool alertActive
                            ) &&
                            alertActive;

                        bool isLowBattery =
                            hasBattery &&
                            request.BatteryPercent!.Value < 20;

                        // Only change the alert state when a battery reading arrives.
                        if (hasBattery)
                        {
                            deviceUpdates["lowBatteryAlertActive"] = isLowBattery;
                        }

                        DocumentReference? notificationRef = null;
                        Dictionary<string, object>? notificationData = null;

                        DocumentReference? activityHistoryRef = null;
                        Dictionary<string, object>? activityHistoryData = null;

                        DocumentReference? previousActivityHistoryRef = null;
                        Dictionary<string, object>? previousActivityUpdate = null;

                        bool isPaired =
                            deviceSnapshot.Exists &&
                            deviceSnapshot.TryGetValue<bool>(
                                "paired",
                                out bool paired
                            ) && paired;

                        DocumentReference? petRef = null;

                        if (isPaired)
                        {
                            if (!deviceSnapshot.TryGetValue<string>(
                                    "pairedPetId",
                                    out string? pairedPetId
                                ) ||
                                string.IsNullOrWhiteSpace(pairedPetId))
                            {
                                return "PAIRING_INCOMPLETE";
                            }

                            petRef = _firestore
                                .Collection("pets")
                                .Document(pairedPetId);

                            DocumentSnapshot petSnapshot =
                                await transaction
                                    .GetSnapshotAsync(petRef);

                            if (!petSnapshot.Exists)
                            {
                                return "PET_NOT_FOUND";
                            }

                            if (!petSnapshot.TryGetValue<string>(
                                    "deviceId",
                                    out string? petDeviceId
                                ) ||
                                !string.Equals(
                                    petDeviceId,
                                    deviceId,
                                    StringComparison.Ordinal
                                ))
                            {
                                return "PAIRING_MISMATCH";
                            }

                            // ============================================
                            // RECORD CONFIRMED ACTIVITY CHANGE
                            // ============================================

                            bool activityChanged =
                                hasActivity &&
                                (!deviceSnapshot.TryGetValue<string>(
                                    "activity",
                                    out string? previousActivity
                                ) ||
                                !string.Equals(
                                    previousActivity,
                                    activity,
                                    StringComparison.OrdinalIgnoreCase
                                ));

                            if (activityChanged)
                            {
                                DateTime changedAtUtc = DateTime.UtcNow;

                                CollectionReference historyCollection = petRef
                                    .Collection("activityHistory");

                                DocumentSnapshot? previousHistory = null;

                                // Find the currently active interval.
                                if (petSnapshot.TryGetValue<string>(
                                        "activeActivityHistoryId",
                                        out string? activeId
                                    ) &&
                                    !string.IsNullOrWhiteSpace(activeId))
                                {
                                    previousHistory = await transaction.GetSnapshotAsync(
                                        historyCollection.Document(activeId)
                                    );
                                }
                                else
                                {
                                    // Compatibility with existing Phase 5A test records.
                                    QuerySnapshot openIntervals =
                                        await transaction.GetSnapshotAsync(
                                            historyCollection.WhereEqualTo("endedAt", null)
                                        );

                                    previousHistory = openIntervals.Documents
                                        .Where(d => d.TryGetValue<Timestamp>(
                                            "startedAt", out _))
                                        .OrderByDescending(d =>
                                            d.GetValue<Timestamp>("startedAt").ToDateTime())
                                        .FirstOrDefault();
                                }

                                // Close the previous interval only when it matches
                                // the device's previously confirmed activity.
                                if (previousHistory != null &&
                                    previousHistory.Exists &&
                                    previousHistory.TryGetValue<Timestamp>(
                                        "startedAt", out Timestamp startedAt) &&
                                    previousHistory.TryGetValue<string>(
                                        "activity", out string? historyActivity) &&
                                    deviceSnapshot.TryGetValue<string>(
                                        "activity", out string? previousDeviceActivity) &&
                                    string.Equals(
                                        historyActivity,
                                        previousDeviceActivity,
                                        StringComparison.OrdinalIgnoreCase))
                                {
                                    DateTime startUtc = startedAt.ToDateTime();
                                    DateTime endUtc = changedAtUtc;

                                    bool wasOnline =
                                        deviceSnapshot.TryGetValue<bool>(
                                            "collarOnline", out bool previousOnline
                                        ) && previousOnline;

                                    // Do not count an unverified offline gap.
                                    if (deviceSnapshot.TryGetValue<Timestamp>(
                                            "lastSeen", out Timestamp lastSeen))
                                    {
                                        DateTime lastSeenUtc = lastSeen.ToDateTime();

                                        if (!wasOnline ||
                                            changedAtUtc - lastSeenUtc >
                                                TimeSpan.FromSeconds(180))
                                        {
                                            if (lastSeenUtc < endUtc)
                                                endUtc = lastSeenUtc;
                                        }
                                    }

                                    if (endUtc < startUtc)
                                        endUtc = startUtc;

                                    long durationSeconds = Math.Max(
                                        0L,
                                        (long)Math.Floor((endUtc - startUtc).TotalSeconds)
                                    );

                                    previousActivityHistoryRef = previousHistory.Reference;

                                    previousActivityUpdate = new Dictionary<string, object>
                                    {
                                        ["endedAt"] = Timestamp.FromDateTime(endUtc),
                                        ["durationSeconds"] = durationSeconds,
                                        ["endedReason"] = endUtc < changedAtUtc
                                            ? "connection_gap"
                                            : "activity_change"
                                    };
                                }

                                // Start a new interval for the confirmed activity.
                                activityHistoryRef = historyCollection.Document();

                                activityHistoryData = new Dictionary<string, object>
                                {
                                    ["activity"] = displayedActivity,
                                    ["startedAt"] = Timestamp.FromDateTime(changedAtUtc),
                                    ["endedAt"] = null!,
                                    ["durationSeconds"] = null!,
                                    ["source"] = "api_telemetry",
                                    ["createdAt"] = FieldValue.ServerTimestamp
                                };

                                // Remember the current interval for the next transition.
                                petUpdates["activeActivityHistoryId"] =
                                    activityHistoryRef.Id;
                            }

                            // ============================================
                            // LOW BATTERY NOTIFICATION
                            // ============================================

                            if (isLowBattery &&
                                !previousLowBatteryAlert &&
                                petSnapshot.TryGetValue<string>(
                                    "userId",
                                    out string? userId
                                ) &&
                                !string.IsNullOrWhiteSpace(userId))
                            {
                                DocumentReference userRef = _firestore
                                    .Collection("users")
                                    .Document(userId);

                                DocumentSnapshot userSnapshot =
                                    await transaction.GetSnapshotAsync(userRef);

                                bool alertsEnabled =
                                    userSnapshot.Exists &&
                                    userSnapshot.TryGetValue<bool>(
                                        "notificationPreferences.lowBatteryAlerts",
                                        out bool enabled
                                    ) &&
                                    enabled;

                                if (alertsEnabled)
                                {
                                    string petName =
                                        petSnapshot.TryGetValue<string>(
                                            "name",
                                            out string? name
                                        ) &&
                                        !string.IsNullOrWhiteSpace(name)
                                            ? name
                                            : "Your pet";

                                    notificationRef = userRef
                                        .Collection("notifications")
                                        .Document();

                                    notificationData = new Dictionary<string, object>
                                    {
                                        ["petId"] = petSnapshot.Id,
                                        ["petName"] = petName,
                                        ["deviceId"] = deviceId,

                                        ["type"] = "low_battery",
                                        ["category"] = "collar",

                                        ["title"] = "Low Battery Alert",
                                        ["message"] =
                                            $"{petName}'s collar battery has dropped to " +
                                            $"{request.BatteryPercent!.Value:0.#}%. " +
                                            "Please charge the device.",

                                        ["isRead"] = false,
                                        ["eventAt"] = FieldValue.ServerTimestamp,
                                        ["createdAt"] = FieldValue.ServerTimestamp,
                                        ["readAt"] = null!
                                    };
                                }
                            }
                        }

                        // All reads complete before writes.
                        // MergeAll preserves unrelated fields.

                        transaction.Set(
                            deviceRef,
                            deviceUpdates,
                            SetOptions.MergeAll
                        );

                        if (petRef != null)
                        {
                            transaction.Update(
                                petRef,
                                petUpdates
                            );
                        }

                        // Save notification in the same Firestore transaction.
                        if (notificationRef != null && notificationData != null)
                        {
                            transaction.Create(
                                notificationRef,
                                notificationData
                            );
                        }

                        // Close the previously confirmed activity interval.
                        if (previousActivityHistoryRef != null &&
                            previousActivityUpdate != null)
                        {
                            transaction.Update(
                                previousActivityHistoryRef,
                                previousActivityUpdate
                            );
                        }

                        // Save the new confirmed activity interval.
                        if (activityHistoryRef != null && activityHistoryData != null)
                        {
                            transaction.Create(
                                activityHistoryRef,
                                activityHistoryData
                            );
                        }
                        return isPaired
                            ? "SYNCED"
                            : "DEVICE_ONLY";
                    }
                );

            if (result == "PET_NOT_FOUND")
            {
                return NotFound(new
                {
                    success = false,
                    code = result,
                    message = "Paired pet not found."
                });
            }

            if (result == "PAIRING_INCOMPLETE" ||
                result == "PAIRING_MISMATCH")
            {
                return Conflict(new
                {
                    success = false,
                    code = result,
                    message = "Device and pet pairing mismatch."
                });
            }

            Console.WriteLine(
                $"PawSense telemetry saved | " +
                $"Device: {deviceId} | " +
                $"Activity: {(hasActivity ? activity : "UNCHANGED")} | " +
                $"Battery: {(hasBattery ? "UPDATED" : "UNCHANGED")} | " +
                $"GPS: {(hasCoordinates ? "FIX UPDATED" : request.GpsAvailable == false ? "UNAVAILABLE" : "UNCHANGED")} | " +
                $"Mirror: {result}"
            );

            return Ok(new
            {
                success = true,
                deviceId,
                mirroredToPet = result == "SYNCED",
                activityUpdated = hasActivity,
                batteryUpdated = hasBattery,
                gpsLocationUpdated = hasCoordinates,
                message = "Telemetry saved successfully."
            });
        }
        catch (Exception error)
        {
            Console.WriteLine(
                $"PawSense telemetry failed | " +
                $"Device: {deviceId} | " +
                $"Error: {error.Message}"
            );

            return StatusCode(
                StatusCodes.Status500InternalServerError,
                new
                {
                    success = false,
                    code = "TELEMETRY_SAVE_FAILED",
                    message = "Unable to save telemetry."
                }
            );
        }
    }

    // =========================================================
    // DEVICE HEARTBEAT
    // =========================================================

    [HttpPost("heartbeat")]
    public async Task<IActionResult> ReceiveHeartbeat(
        [FromBody] DeviceHeartbeatRequest request)
    {
        string deviceId =
            request.DeviceId?.Trim() ?? string.Empty;

        if (string.IsNullOrWhiteSpace(deviceId))
        {
            return BadRequest(new
            {
                success = false,
                code = "DEVICE_ID_REQUIRED",
                message = "Device ID is required."
            });
        }

        DocumentReference deviceRef = _firestore
            .Collection("devices")
            .Document(deviceId);

        try
        {
            string result = await _firestore.RunTransactionAsync(
                async transaction =>
                {
                    DocumentSnapshot device =
                        await transaction.GetSnapshotAsync(deviceRef);

                    if (!device.Exists)
                    {
                        return "DEVICE_NOT_FOUND";
                    }

                    bool isPaired =
                        device.TryGetValue<bool>(
                            "paired",
                            out bool paired
                        ) && paired;

                    // Identify a real offline-to-online transition.
                    bool wasOffline =
                        device.TryGetValue<bool>(
                            "collarOnline",
                            out bool previousOnline
                        ) && !previousOnline;

                    // Prevent a first-ever heartbeat from being treated
                    // as a reconnection.
                    bool hasPreviousHeartbeat =
                        device.TryGetValue<Timestamp>(
                            "lastSeen",
                            out _
                        );

                    DocumentReference? petRef = null;
                    DocumentReference? notificationRef = null;
                    Dictionary<string, object>? notificationData = null;

                    if (isPaired)
                    {
                        if (!device.TryGetValue<string>(
                                "pairedPetId",
                                out string? pairedPetId
                            ) ||
                            string.IsNullOrWhiteSpace(pairedPetId))
                        {
                            return "PAIRING_INCOMPLETE";
                        }

                        petRef = _firestore
                            .Collection("pets")
                            .Document(pairedPetId);

                        DocumentSnapshot pet =
                            await transaction.GetSnapshotAsync(petRef);

                        if (!pet.Exists)
                        {
                            return "PET_NOT_FOUND";
                        }

                        if (!pet.TryGetValue<string>(
                                "deviceId",
                                out string? petDeviceId
                            ) ||
                            !string.Equals(
                                petDeviceId,
                                deviceId,
                                StringComparison.Ordinal
                            ))
                        {
                            return "PAIRING_MISMATCH";
                        }

                        // ============================================
                        // COLLAR ONLINE NOTIFICATION
                        // ============================================

                        if (wasOffline && hasPreviousHeartbeat &&
                            pet.TryGetValue<string>(
                                "userId",
                                out string? userId
                            ) &&
                            !string.IsNullOrWhiteSpace(userId))
                        {
                            DocumentReference userRef = _firestore
                                .Collection("users")
                                .Document(userId);

                            DocumentSnapshot userSnapshot =
                                await transaction.GetSnapshotAsync(userRef);

                            bool alertsEnabled =
                                userSnapshot.Exists &&
                                userSnapshot.TryGetValue<bool>(
                                    "notificationPreferences.collarOfflineAlerts",
                                    out bool enabled
                                ) &&
                                enabled;

                            if (alertsEnabled)
                            {
                                string petName =
                                    pet.TryGetValue<string>(
                                        "name",
                                        out string? name
                                    ) &&
                                    !string.IsNullOrWhiteSpace(name)
                                        ? name
                                        : "Your pet";

                                notificationRef = userRef
                                    .Collection("notifications")
                                    .Document();

                                notificationData = new Dictionary<string, object>
                                {
                                    ["petId"] = pet.Id,
                                    ["petName"] = petName,
                                    ["deviceId"] = deviceId,

                                    ["type"] = "collar_online",
                                    ["category"] = "collar",

                                    ["title"] = "Collar Online",
                                    ["message"] =
                                        $"{petName}'s collar connection has been restored.",

                                    ["isRead"] = false,
                                    ["eventAt"] = FieldValue.ServerTimestamp,
                                    ["createdAt"] = FieldValue.ServerTimestamp,
                                    ["readAt"] = null!
                                };
                            }
                        }
                    }

                    // Update device connection status
                    transaction.Update(
                        deviceRef,
                        new Dictionary<string, object>
                        {
                            { "collarOnline", true },
                            { "lastSeen", FieldValue.ServerTimestamp }
                        }
                    );

                    // Mirror to the paired pet
                    if (petRef != null)
                    {
                        transaction.Update(
                            petRef,
                            new Dictionary<string, object>
                            {
                                { "collarOnline", true },
                                { "lastSeen", FieldValue.ServerTimestamp }
                            }
                        );
                    }

                    // Create notification only on an actual
                    // offline-to-online transition.
                    if (notificationRef != null && notificationData != null)
                    {
                        transaction.Create(
                            notificationRef,
                            notificationData
                        );
                    }

                    return isPaired ? "SYNCED" : "DEVICE_ONLY";
                }
            );

            if (result == "DEVICE_NOT_FOUND" ||
                result == "PET_NOT_FOUND")
            {
                return NotFound(new
                {
                    success = false,
                    code = result,
                    message = "Device or paired pet was not found."
                });
            }

            if (result == "PAIRING_INCOMPLETE" ||
                result == "PAIRING_MISMATCH")
            {
                return Conflict(new
                {
                    success = false,
                    code = result,
                    message = "Device and pet pairing records do not match."
                });
            }

            Console.WriteLine(
                $"PawSense heartbeat saved | " +
                $"Device: {deviceId} | Mirror: {result}"
            );

            return Ok(new
            {
                success = true,
                deviceId,
                mirroredToPet = result == "SYNCED",
                message = "Heartbeat received. Connection status updated."
            });
        }
        catch (Exception error)
        {
            Console.WriteLine(
                $"PawSense heartbeat failed | " +
                $"Device: {deviceId} | Error: {error.Message}"
            );

            return StatusCode(
                StatusCodes.Status500InternalServerError,
                new
                {
                    success = false,
                    code = "HEARTBEAT_SAVE_FAILED",
                    message = "Unable to save heartbeat."
                }
            );
        }
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

// ============================================
// ACTIVATE 30-DAY SUBSCRIPTION ON FIRST PAIRING
// ============================================

// Preserve existing subscription dates.
// Unpairing and re-pairing must not restart validity.

if (!deviceSnapshot.ContainsField("subscription"))
{
    DateTime activatedAtUtc = DateTime.UtcNow;
    DateTime expiresAtUtc = activatedAtUtc.AddDays(30);

    deviceUpdates["subscription"] =
        new Dictionary<string, object>
        {
            {
                "activatedAt",
                Timestamp.FromDateTime(activatedAtUtc)
            },
            {
                "expiresAt",
                Timestamp.FromDateTime(expiresAtUtc)
            }
        };
}
    

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