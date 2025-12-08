package com.example.colorphone.data.remote

import com.example.colorphone.domain.models.RainStatus
import com.example.colorphone.domain.models.WaterStatus
import com.squareup.moshi.FromJson
import com.squareup.moshi.JsonQualifier
import com.squareup.moshi.ToJson

@Retention(AnnotationRetention.RUNTIME)
@JsonQualifier
annotation class StatusAdapter

class StatusMoshiAdapter {
    @FromJson
    @StatusAdapter
    fun fromJsonToWaterStatus(status: String): WaterStatus {
        return WaterStatus.valueOf(status.uppercase())
    }

    @FromJson
    @StatusAdapter
    fun fromJsonToRainStatus(status: String) : RainStatus {
        return RainStatus.valueOf(status.uppercase())
    }

    @ToJson
    @StatusAdapter
    fun toJson(waterStatus: WaterStatus): String {
        return waterStatus.name
    }

    @ToJson
    @StatusAdapter
    fun toJson(rainStatus: RainStatus): String {
        return rainStatus.name
    }
}