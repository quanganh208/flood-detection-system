package com.example.colorphone.data.remote.dto

import com.example.colorphone.domain.models.DeviceModel
import com.example.colorphone.domain.models.RainStatus
import com.example.colorphone.domain.models.WaterStatus
import com.squareup.moshi.JsonClass
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

@JsonClass(generateAdapter = true)
data class DevicesResponse(
    val devices: List<Device>,

    val stats: Stats,

    val serverTime: String
)

fun Device.toDomainModel(): DeviceModel {
    // --- 1. Map String Status back to Enum for UI safety ---
    // We use a try-catch to provide a default value in case the API sends a bad string.
    val mappedWaterStatus = try {
        WaterStatus.valueOf(waterStatus.uppercase())
    } catch (e: Exception) {
        WaterStatus.DANGER // Default to a safe status
    }

    val mappedRainStatus = try {
        RainStatus.valueOf(rainStatus.uppercase())
    } catch (e: Exception) {
        RainStatus.DRY // Default to DRY
    }

    // --- 2. Format the Timestamp for UI ---
    val displayTime = lastUpdate?.let { timestamp ->
        // Assuming the timestamp is in ISO 8601 format (e.g., "2025-12-07T07:57:01.041Z")
        // Use a library like Joda-Time or java.time for production, but this is a placeholder:
        val formatter = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
        formatter.timeZone = TimeZone.getTimeZone("UTC")
        try {
            val date = formatter.parse(timestamp)
            // Replace with actual relative time formatting logic (e.g., '3 minutes ago')
            SimpleDateFormat("MMM dd, h:mm a", Locale.getDefault()).format(date!!)
        } catch (e: Exception) {
            "N/A"
        }
    } ?: "N/A"


    return DeviceModel(
        id = id,
        name = name,
        isOnline = isOnline,
        waterStatus = mappedWaterStatus,
        rainStatus = mappedRainStatus,
        // Combine Lat/Lng into a Pair if both are present
        coordinate = if (lat != null && lng != null) Pair(lat, lng) else null,
        waterLevel = waterLevel,
        lastUpdateDisplay = displayTime,
        alertCount = alertCount
    )
}

fun DevicesResponse.toDomainList(): List<DeviceModel> {
    return devices.map { it.toDomainModel() }
}