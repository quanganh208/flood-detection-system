package com.example.colorphone.ui.main

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.colorphone.data.remote.RetrofitClient
import com.example.colorphone.data.remote.dto.AlertItem
import com.example.colorphone.data.remote.dto.AlertsResponse
import com.example.colorphone.data.remote.dto.toDomainList
import com.example.colorphone.domain.models.DeviceModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

class MainViewmodel : ViewModel() {
    val TAG = "TAGG MainViewmodel"

    private val _devicesState = MutableStateFlow<List<DeviceModel>>(emptyList())
    val devicesState = _devicesState.asStateFlow()

    private val _notificationsState = MutableStateFlow<List<AlertItem>>(emptyList())
    val notificationsState = _notificationsState.asStateFlow()


    init {
        getInitData()
    }

    private fun getInitData() {
        viewModelScope.launch(Dispatchers.IO) {
            val response = RetrofitClient.apiService.getDevices()

            Log.d(TAG, "getInitData: $response")

            _devicesState.update {
                response.toDomainList()
            }
        }

        viewModelScope.launch(Dispatchers.IO) {
            val response = RetrofitClient.apiService.getNotifications()

            Log.d(TAG, "getInitData: $response")

            _notificationsState.update { response.alerts }
//            _devicesState.update {
//                response.toDomainList()
//            }
        }

    }
}