package com.example.colorphone.data.remote.dto

import android.os.Parcelable
import kotlinx.parcelize.Parcelize

// domain/model/AlertItem.kt
/**
 * Đại diện cho một mục cảnh báo duy nhất ở tầng Domain.
 */
@Parcelize
data class AlertItem(
    // Alert UUID
    val id: String,
    // Loại cảnh báo (Enum: WATER_WARNING, WATER_DANGER,...)
    val type: String,
    // Mức độ nghiêm trọng (Enum: LOW, MEDIUM, HIGH, CRITICAL)
    val severity: String,
    // Thông báo cảnh báo
    val message: String,
    // ID thiết bị
    val deviceId: String,
    // Tên thiết bị
    val deviceName: String?,
    // Vị trí thiết bị
    val location: String?,
    // Mức nước tại thời điểm cảnh báo
    val waterLevel: Double?,
    // Giá trị Analog đo mưa tại thời điểm cảnh báo
    val rainAnalog: Double?,
    // Thời gian tạo cảnh báo ($date-time)
    val createdAt: String
) : Parcelable