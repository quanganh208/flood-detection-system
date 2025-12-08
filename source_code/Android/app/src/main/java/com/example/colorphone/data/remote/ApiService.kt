package com.example.colorphone.data.remote

import com.example.colorphone.data.remote.dto.AlertsResponse
import com.example.colorphone.data.remote.dto.DevicesResponse
import com.example.colorphone.data.remote.dto.LocationUpdateRequest
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST

interface ApiService {
    @GET("mobile/map-data")
    suspend fun getDevices() : DevicesResponse

    @GET("mobile/alerts?limit=50&offset=0")
    suspend fun getNotifications() : AlertsResponse

    @POST("fcm/register")
    suspend fun updateDeviceLocation(
        @Body requestBody: LocationUpdateRequest
    ): Response<Unit>
}