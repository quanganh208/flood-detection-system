package com.example.colorphone.data.remote.dto

// domain/model/AlertsResponse.kt
/**
 * Đại diện cho phản hồi tổng thể về danh sách cảnh báo ở tầng Domain.
 */
data class AlertsResponse(
    // Danh sách các cảnh báo
    val alerts: List<AlertItem>,
    // Tổng số cảnh báo chưa được giải quyết
    val total: Int,
    // Liệu còn cảnh báo khác để tải không
    val hasMore: Boolean,
    // Thời gian server ($date-time)
    val serverTime: String
)