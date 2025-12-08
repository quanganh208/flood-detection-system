package com.example.colorphone.domain.models

data class DeviceModel(
    val id: String,
    val name: String,
    val isOnline: Boolean,

    val waterStatus: WaterStatus,
    val rainStatus: RainStatus,

    val coordinate: Pair<Double, Double>?,

    val waterLevel: Double?,

    val lastUpdateDisplay: String,

    val alertCount: Int
)