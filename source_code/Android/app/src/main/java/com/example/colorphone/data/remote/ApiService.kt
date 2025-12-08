package com.example.colorphone.data.remote

import com.example.colorphone.data.remote.dto.AlertsResponse
import com.example.colorphone.data.remote.dto.DevicesResponse
import retrofit2.http.GET

interface ApiService {
    @GET("map-data")
    suspend fun getDevices() : DevicesResponse

    @GET("alerts?limit=50&offset=0")
    suspend fun getNotifications() : AlertsResponse
}