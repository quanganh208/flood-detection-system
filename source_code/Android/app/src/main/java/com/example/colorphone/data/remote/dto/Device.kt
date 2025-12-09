package com.example.colorphone.data.remote.dto

import android.os.Parcelable
import com.example.colorphone.data.remote.StatusAdapter
import com.example.colorphone.domain.models.RainStatus
import com.example.colorphone.domain.models.WaterStatus
import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass
import kotlinx.parcelize.Parcelize

@JsonClass(generateAdapter = true)
data class Device(
    val id: String,

    // Using @Json for clarity, though it matches the Kotlin name
    @Json(name = "deviceId")
    val deviceId: String,

    val name: String,

    // Using Any? as a safe placeholder for {} until the specific object/value type is known.
    val location: Any?,

    // Assuming latitude/longitude will be Doubles, but marking nullable
    val lat: Double?,
    val lng: Double?,

    val isOnline: Boolean,

    // Assuming these are String enums, as they are quoted.
    val waterStatus: String,
    val rainStatus: String,

    // Assuming these are numerical values, but marking nullable
    val waterLevel: Double?,
    val rainAnalog: Double?,

    // Assuming this is a timestamp string, but marking nullable
    val lastUpdate: String?,

    val alertCount: Int
)