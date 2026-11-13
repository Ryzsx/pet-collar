    using Google.Cloud.Firestore;

    namespace PawSense.Api.Services;

    public sealed class CollarOfflineMonitor : BackgroundService
    {
        // Check Firestore every 30 seconds
        private static readonly TimeSpan CheckInterval =
            TimeSpan.FromSeconds(30);

        // Mark collar offline after more than 180 seconds
        private static readonly TimeSpan OfflineAfter =
            TimeSpan.FromSeconds(180);

        private readonly FirestoreDb _firestore;
        private readonly ILogger<CollarOfflineMonitor> _logger;

        public CollarOfflineMonitor(
            FirestoreDb firestore,
            ILogger<CollarOfflineMonitor> logger)
        {
            _firestore = firestore;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(
            CancellationToken stoppingToken)
        {
            _logger.LogInformation(
                "PawSense offline monitor started."
            );

            using PeriodicTimer timer = new(CheckInterval);

            try
            {
                // Check on startup
                await CheckSafelyAsync(stoppingToken);

                // Then check every 30 seconds
                while (await timer.WaitForNextTickAsync(stoppingToken))
                {
                    await CheckSafelyAsync(stoppingToken);
                }
            }
            catch (OperationCanceledException)
                when (stoppingToken.IsCancellationRequested)
            {
                // Normal application shutdown
            }
        }

        private async Task CheckSafelyAsync(
            CancellationToken cancellationToken)
        {
            try
            {
                await CheckOfflineCollarsAsync(cancellationToken);
            }
            catch (OperationCanceledException)
                when (cancellationToken.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception error)
            {
                _logger.LogError(
                    error,
                    "PawSense offline monitoring failed."
                );
            }
        }

        private async Task CheckOfflineCollarsAsync(
            CancellationToken cancellationToken)
        {
            // Find currently online collars
            QuerySnapshot onlineDevices = await _firestore
                .Collection("devices")
                .WhereEqualTo("collarOnline", true)
                .GetSnapshotAsync(cancellationToken);

            foreach (DocumentSnapshot candidate in onlineDevices.Documents)
            {
                cancellationToken.ThrowIfCancellationRequested();

                try
                {
                    // Use a transaction to prevent a new heartbeat
                    // from being overwritten by an older offline check.
                    string result = await _firestore.RunTransactionAsync(
                        async transaction =>
                        {
                            DocumentSnapshot device =
                                await transaction.GetSnapshotAsync(
                                    candidate.Reference
                                );

                            if (!device.Exists)
                            {
                                return "SKIP";
                            }

                            if (!device.TryGetValue<bool>(
                                    "collarOnline",
                                    out bool isOnline
                                ) || !isOnline)
                            {
                                return "SKIP";
                            }

                            // Read the most recent contact timestamp
                            if (!device.TryGetValue<Timestamp>(
                                    "lastSeen",
                                    out Timestamp lastSeen
                                ))
                            {
                                return "MISSING_LASTSEEN";
                            }

                            TimeSpan silence =
                                DateTime.UtcNow - lastSeen.ToDateTime();

                            // Still within the online timeout
                            if (silence <= OfflineAfter)
                            {
                                return "STILL_ONLINE";
                            }

                            bool isPaired =
                                device.TryGetValue<bool>(
                                    "paired",
                                    out bool paired
                                ) && paired;

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
                                        candidate.Id,
                                        StringComparison.Ordinal
                                    ))
                                {
                                    return "PAIRING_MISMATCH";
                                }
                                // ============================================
                                // CHECK COLLAR OFFLINE NOTIFICATION PREFERENCE
                                // ============================================

                                if (pet.TryGetValue<string>(
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
                                            ["petId"] = pairedPetId,
                                            ["petName"] = petName,
                                            ["deviceId"] = candidate.Id,

                                            ["type"] = "collar_offline",
                                            ["category"] = "collar",

                                            ["title"] = "Collar Offline",
                                            ["message"] =
                                                $"{petName}'s collar has stopped sending heartbeat updates.",

                                            ["isRead"] = false,
                                            ["eventAt"] = Timestamp.GetCurrentTimestamp(),
                                            ["createdAt"] = FieldValue.ServerTimestamp,
                                            ["readAt"] = null!
                                        };
                                    }
                                }
                            }

                            // Set the device offline
                            transaction.Update(
                                candidate.Reference,
                                new Dictionary<string, object>
                                {
                                    { "collarOnline", false }
                                }
                            );

                            // Set the paired pet offline
                            if (petRef != null)
                            {
                                transaction.Update(
                                    petRef,
                                    new Dictionary<string, object>
                                    {
                                        { "collarOnline", false }
                                    }
                                );
                            }

                            // Create the notification in the same transaction.
                            if (notificationRef != null && notificationData != null)
                            {
                                transaction.Create(
                                    notificationRef,
                                    notificationData
                                );
                            }

                            return isPaired
                                ? "PAIRED_OFFLINE"
                                : "DEVICE_OFFLINE";
                        },
                        cancellationToken: cancellationToken
                    );

                    if (result == "PAIRED_OFFLINE" ||
                        result == "DEVICE_OFFLINE")
                    {
                        _logger.LogInformation(
                            "PawSense collar OFFLINE | Device: {DeviceId}",
                            candidate.Id
                        );
                    }
                    else if (result == "MISSING_LASTSEEN" ||
                            result == "PAIRING_INCOMPLETE" ||
                            result == "PET_NOT_FOUND" ||
                            result == "PAIRING_MISMATCH")
                    {
                        _logger.LogWarning(
                            "Offline check skipped | Device: {DeviceId} | Reason: {Reason}",
                            candidate.Id,
                            result
                        );
                    }
                }
                catch (OperationCanceledException)
                    when (cancellationToken.IsCancellationRequested)
                {
                    throw;
                }
                catch (Exception error)
                {
                    _logger.LogError(
                        error,
                        "Offline check failed for {DeviceId}",
                        candidate.Id
                    );
                }
            }
        }
    }
