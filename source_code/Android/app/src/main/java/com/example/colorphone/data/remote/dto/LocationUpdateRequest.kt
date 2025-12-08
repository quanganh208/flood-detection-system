package com.example.colorphone.data.remote.dto

import com.squareup.moshi.Json

data class LocationUpdateRequest(
    @Json(name = "token")
    val token: String,

    @Json(name = "latitude")
    val latitude: Double,

    @Json(name = "longitude")
    val longitude: Double
)