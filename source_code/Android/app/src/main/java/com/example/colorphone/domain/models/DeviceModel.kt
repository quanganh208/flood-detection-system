package com.example.colorphone.domain.models

import android.os.Parcelable
import kotlinx.parcelize.Parcelize

@Parcelize
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
) : Parcelable