package com.example.colorphone

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import com.example.colorphone.ui.main.MainActivity
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

class MyFirebaseMessagingService : FirebaseMessagingService() {

    companion object {
        private const val TAG = "TAGG FCM_Service"

        private const val CHANNEL_ID = "ALERT_NOTIFICATION_CHANNEL"
        private const val CHANNEL_NAME = "Cảnh báo Thiết bị"
    }

    /**
     * Được gọi khi một thông báo được nhận.
     */
    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        Log.d(TAG, "From: ${remoteMessage.from}")

        // Kiểm tra xem thông báo có chứa payload data không
        remoteMessage.data.isNotEmpty().let {
            Log.d(TAG, "Message data payload: " + remoteMessage.data)
            // PROPOSE: Xử lý data (ví dụ: cập nhật trạng thái UI, tải dữ liệu mới)
        }

        // Kiểm tra xem thông báo có chứa payload notification (Tiêu đề/Nội dung) không
        remoteMessage.notification?.let {
            Log.d(TAG, "Message Notification Body: ${it.body}")
            // PROPOSE: Hiển thị thông báo (Notification) tùy chỉnh tại đây
            sendNotification(it.title, it.body)
        }
    }

    /**
     * Được gọi khi Firebase Instance ID Token được cập nhật.
     * Token này có thể bị xoá hoặc cập nhật do factory reset, gỡ/cài lại app, hoặc lỗi bảo mật.
     */
    override fun onNewToken(token: String) {
        Log.d(TAG, "Refreshed token: $token")

        // PROPOSE: Gửi token mới này lên server ứng dụng của bạn để đảm bảo
        // server luôn có token mới nhất để gửi thông báo.
        sendRegistrationToServer(token)
    }

    // Tùy chọn: Hàm hiển thị thông báo tùy chỉnh

    // Tùy chọn: Hàm gửi token lên server
    private fun sendRegistrationToServer(token: String) {
        // ... (Logic sử dụng Retrofit để gửi token lên API backend của bạn)
    }

    private fun sendNotification(title: String?, messageBody: String?) {

        // 1. Chuẩn bị Intent để mở Activity khi người dùng nhấn vào thông báo
        val intent = Intent(this, MainActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
        }
        val pendingIntent = PendingIntent.getActivity(
            this, 0 /* Request code */, intent,
            PendingIntent.FLAG_ONE_SHOT or PendingIntent.FLAG_IMMUTABLE // Flag IMMUTABLE là bắt buộc
        )

        // 2. Tạo Channel (Đảm bảo nó tồn tại)
        createNotificationChannel()

        // 3. Xây dựng Notification
        val notificationBuilder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification) // BẮT BUỘC: Icon nhỏ
            .setContentTitle(title ?: "Thông báo Cảnh báo")
            .setContentText(messageBody)
            .setAutoCancel(true) // Tự động đóng khi click
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_HIGH) // Ưu tiên cao

        // 4. Gửi Notification
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        // Sử dụng một ID duy nhất để thông báo mới không đè lên thông báo cũ
        notificationManager.notify(0 /* ID Notification */, notificationBuilder.build())
    }

    private fun createNotificationChannel() {
        // Chỉ tạo Channel nếu thiết bị chạy Android 8.0 (API 26) trở lên
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val descriptionText = "Kênh thông báo cho các cảnh báo quan trọng từ thiết bị."
            val importance = NotificationManager.IMPORTANCE_HIGH // Quan trọng cao: có âm thanh

            val channel = NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME, importance
            ).apply {
                description = descriptionText
                // Tùy chỉnh (ví dụ: tắt đèn LED, thiết lập rung)
                enableLights(true)
            }

            // Đăng ký channel với hệ thống
            val notificationManager: NotificationManager =
                getSystemService(NOTIFICATION_SERVICE) as NotificationManager

            notificationManager.createNotificationChannel(channel)
        }
    }
}